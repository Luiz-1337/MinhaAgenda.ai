import { describe, it, expect, vi, beforeEach } from "vitest"
import type Stripe from "stripe"

// vi.hoisted: as fns precisam existir ANTES das fábricas vi.mock (que são içadas).
const h = vi.hoisted(() => {
  const salonsFindFirst = vi.fn()
  const updateWhere = vi.fn().mockResolvedValue(undefined)
  const updateSet = vi.fn<(values: Record<string, unknown>) => { where: typeof updateWhere }>(() => ({ where: updateWhere }))
  const update = vi.fn<(table: unknown) => { set: typeof updateSet }>(() => ({ set: updateSet }))
  const returning = vi.fn().mockResolvedValue([{ id: "pay-1" }])
  const onConflictDoNothing = vi.fn(() => {
    const result = Promise.resolve(undefined) as Promise<undefined> & { returning: typeof returning }
    result.returning = returning
    return result
  })
  const insertValues = vi.fn(() => ({ onConflictDoNothing }))
  const insert = vi.fn<(table: unknown) => { values: typeof insertValues }>(() => ({ values: insertValues }))
  const retrieveSubscription = vi.fn()
  return {
    salonsFindFirst,
    updateWhere,
    updateSet,
    update,
    returning,
    onConflictDoNothing,
    insertValues,
    insert,
    retrieveSubscription,
  }
})

vi.mock("@repo/db", () => {
  const db = {
    query: { salons: { findFirst: h.salonsFindFirst } },
    update: h.update,
    insert: h.insert,
    transaction: vi.fn(async (cb: (tx: unknown) => unknown) => cb(db)),
  }
  return {
    db,
    salons: { _: "salons", id: "id", subscriptionStatus: "status", subscriptionStatusChangedAt: "changed_at", extraCredits: "extra" },
    profiles: { _: "profiles", id: "id" },
    payments: { _: "payments", id: "id" },
    eq: vi.fn((a: unknown, b: unknown) => ({ eq: [a, b] })),
    sql: vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({ sql: strings.join("?"), values })),
  }
})

vi.mock("@/lib/stripe", () => ({
  stripe: { subscriptions: { retrieve: h.retrieveSubscription } },
  PRICE_TO_TIER: { price_solo: "SOLO", price_pro: "PRO" },
}))

import { salons, profiles, payments } from "@repo/db"
import {
  handleCheckoutSettled,
  handleInvoicePaid,
  handleInvoicePaymentFailed,
  handleSubscriptionChanged,
} from "@/lib/services/stripe-billing.service"

function sub(fields: Partial<{ id: string; status: Stripe.Subscription.Status; price: string; salonId: string }>): Stripe.Subscription {
  return {
    id: fields.id ?? "sub_1",
    status: fields.status ?? "active",
    customer: "cus_1",
    metadata: fields.salonId ? { salonId: fields.salonId } : {},
    items: { data: [{ price: { id: fields.price ?? "price_pro" }, current_period_end: 1 }] },
  } as unknown as Stripe.Subscription
}

function invoiceFor(subscriptionId: string): Stripe.Invoice {
  return {
    id: "in_1",
    amount_paid: 99900,
    currency: "brl",
    hosted_invoice_url: null,
    parent: { subscription_details: { subscription: subscriptionId } },
  } as unknown as Stripe.Invoice
}

function setsOn(table: unknown): Record<string, unknown>[] {
  return h.update.mock.calls
    .map((call, i) => ({ table: call[0], set: h.updateSet.mock.calls[i]?.[0] ?? {} }))
    .filter((c) => c.table === table)
    .map((c) => c.set)
}

describe("stripe-billing.service", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    h.updateWhere.mockResolvedValue(undefined)
    h.returning.mockResolvedValue([{ id: "pay-1" }])
  })

  it("payment_failed fora de ordem não rebaixa: o status vem do Stripe, que diz 'active'", async () => {
    h.retrieveSubscription.mockResolvedValue(sub({ status: "active" }))
    h.salonsFindFirst.mockResolvedValueOnce({ id: "salon-1", ownerId: "owner-1" })

    await handleInvoicePaymentFailed(invoiceFor("sub_1"))

    expect(h.retrieveSubscription).toHaveBeenCalledWith("sub_1")
    const salonSets = setsOn(salons)
    expect(salonSets).toHaveLength(1)
    expect(salonSets[0]).toMatchObject({ subscriptionStatus: "PAID" })
  })

  it("payment_failed com a assinatura em atraso no Stripe → PAST_DUE, sem reiniciar o relógio à força", async () => {
    h.retrieveSubscription.mockResolvedValue(sub({ status: "past_due" }))
    h.salonsFindFirst.mockResolvedValueOnce({ id: "salon-1", ownerId: "owner-1" })

    await handleInvoicePaymentFailed(invoiceFor("sub_1"))

    const [set] = setsOn(salons)
    expect(set).toMatchObject({ subscriptionStatus: "PAST_DUE" })
    // O relógio é um CASE no banco (só muda se o status mudar), não um Date fixo.
    expect(set.subscriptionStatusChangedAt).not.toBeInstanceOf(Date)
    expect(String((set.subscriptionStatusChangedAt as { sql: string }).sql)).toContain("CASE WHEN")
  })

  it("o cancelamento de uma assinatura antiga não derruba o salão que já tem outra", async () => {
    h.retrieveSubscription.mockResolvedValue(sub({ id: "sub_old", status: "canceled", salonId: "salon-1" }))
    h.salonsFindFirst
      .mockResolvedValueOnce(undefined) // ninguém ligado a sub_old
      .mockResolvedValueOnce({ id: "salon-1", ownerId: "owner-1", stripeSubscriptionId: "sub_new" })

    await handleSubscriptionChanged(sub({ id: "sub_old" }))

    expect(h.update).not.toHaveBeenCalled()
  })

  it("invoice.paid antes do checkout.completed liga o salão pela metadata e registra o pagamento", async () => {
    h.retrieveSubscription.mockResolvedValue(sub({ id: "sub_1", status: "active", salonId: "salon-1" }))
    h.salonsFindFirst
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({ id: "salon-1", ownerId: "owner-1", stripeSubscriptionId: null })

    await handleInvoicePaid(invoiceFor("sub_1"))

    const salonSets = setsOn(salons)
    expect(salonSets[0]).toMatchObject({ stripeSubscriptionId: "sub_1" })
    expect(salonSets[1]).toMatchObject({ subscriptionStatus: "PAID" })
    expect(setsOn(profiles)[0]).toMatchObject({ tier: "PRO", stripeCustomerId: "cus_1" })
    expect(h.insert).toHaveBeenCalledWith(payments)
    expect(h.insertValues).toHaveBeenCalledWith(
      expect.objectContaining({ externalId: "in_1", amount: "999.00", userId: "owner-1" }),
    )
  })

  it("assinatura cancelada não rebaixa o tier do dono (decisão em aberto)", async () => {
    h.retrieveSubscription.mockResolvedValue(sub({ status: "canceled" }))
    h.salonsFindFirst.mockResolvedValueOnce({ id: "salon-1", ownerId: "owner-1" })

    await handleSubscriptionChanged(sub({}))

    expect(setsOn(salons)[0]).toMatchObject({ subscriptionStatus: "CANCELED" })
    expect(setsOn(profiles)[0]).not.toHaveProperty("tier")
  })

  it("checkout com boleto ainda não pago não libera plano nem crédito", async () => {
    await handleCheckoutSettled({
      id: "cs_1",
      mode: "subscription",
      payment_status: "unpaid",
      subscription: "sub_1",
      metadata: { salonId: "salon-1", tier: "PRO" },
    } as unknown as Stripe.Checkout.Session)

    expect(h.update).not.toHaveBeenCalled()
    expect(h.retrieveSubscription).not.toHaveBeenCalled()
  })

  it("checkout pago liga a assinatura ao salão e sincroniza pelo Stripe", async () => {
    h.retrieveSubscription.mockResolvedValue(sub({ status: "active", price: "price_solo" }))
    h.salonsFindFirst.mockResolvedValueOnce({ id: "salon-1", ownerId: "owner-1" })

    await handleCheckoutSettled({
      id: "cs_1",
      mode: "subscription",
      payment_status: "paid",
      subscription: "sub_1",
      metadata: { salonId: "salon-1", tier: "SOLO" },
    } as unknown as Stripe.Checkout.Session)

    expect(setsOn(salons)[0]).toMatchObject({ stripeSubscriptionId: "sub_1" })
    expect(setsOn(salons)[1]).toMatchObject({ subscriptionStatus: "PAID" })
    expect(setsOn(profiles)[0]).toMatchObject({ tier: "SOLO" })
  })

  describe("pacote de créditos", () => {
    const pack = {
      id: "cs_pack",
      mode: "payment",
      payment_status: "paid",
      amount_total: 4900,
      currency: "brl",
      customer: "cus_1",
      metadata: { type: "credit_pack", salonId: "salon-1", credits: "500000" },
    } as unknown as Stripe.Checkout.Session

    it("credita quando o pagamento entra pela primeira vez", async () => {
      h.salonsFindFirst.mockResolvedValueOnce({ id: "salon-1", ownerId: "owner-1" })

      await handleCheckoutSettled(pack)

      expect(h.insertValues).toHaveBeenCalledWith(expect.objectContaining({ externalId: "cs_pack", amount: "49.00" }))
      const [credit] = setsOn(salons)
      expect(credit.extraCredits).toMatchObject({ values: [salons.extraCredits, 500000] })
    })

    it("reenvio do mesmo evento (pagamento já registrado) não credita de novo", async () => {
      h.salonsFindFirst.mockResolvedValueOnce({ id: "salon-1", ownerId: "owner-1" })
      h.returning.mockResolvedValueOnce([])

      await handleCheckoutSettled(pack)

      expect(h.update).not.toHaveBeenCalled()
    })
  })
})
