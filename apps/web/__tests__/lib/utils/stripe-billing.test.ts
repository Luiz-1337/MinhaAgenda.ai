import { describe, it, expect } from "vitest"
import type Stripe from "stripe"
import {
  centsToAmount,
  decideCheckout,
  getInvoiceSubscriptionId,
  getSubscriptionPeriodEnd,
  interpretEventClaim,
  isCheckoutPaid,
  isSubscriptionLive,
  mapStripeSubscriptionStatus,
} from "@/lib/utils/stripe-billing.utils"

function invoice(fields: Record<string, unknown>): Stripe.Invoice {
  return fields as unknown as Stripe.Invoice
}

function subscription(periodEnds: number[]): Stripe.Subscription {
  return {
    items: { data: periodEnds.map((end) => ({ current_period_end: end })) },
  } as unknown as Stripe.Subscription
}

describe("mapStripeSubscriptionStatus", () => {
  it("assinatura em dia ou em teste é paga", () => {
    expect(mapStripeSubscriptionStatus("active")).toBe("PAID")
    expect(mapStripeSubscriptionStatus("trialing")).toBe("PAID")
  })

  it("em atraso vira PAST_DUE (com a carência do bot)", () => {
    expect(mapStripeSubscriptionStatus("past_due")).toBe("PAST_DUE")
  })

  it("sem cobrança acontecendo não fica como paga — inclusive pausada", () => {
    expect(mapStripeSubscriptionStatus("canceled")).toBe("CANCELED")
    expect(mapStripeSubscriptionStatus("unpaid")).toBe("CANCELED")
    expect(mapStripeSubscriptionStatus("incomplete_expired")).toBe("CANCELED")
    expect(mapStripeSubscriptionStatus("paused")).toBe("CANCELED")
  })

  it("primeira cobrança em aberto não mexe no status local", () => {
    expect(mapStripeSubscriptionStatus("incomplete")).toBeNull()
  })
})

describe("decideCheckout", () => {
  it("sem assinatura → Checkout novo", () => {
    expect(decideCheckout(null)).toBe("new_checkout")
  })

  it("assinatura encerrada → Checkout novo", () => {
    expect(decideCheckout("canceled")).toBe("new_checkout")
    expect(decideCheckout("incomplete_expired")).toBe("new_checkout")
  })

  it("assinatura viva (inclusive em atraso) → Portal, nunca uma segunda assinatura", () => {
    for (const status of ["active", "trialing", "past_due", "unpaid", "incomplete", "paused"] as const) {
      expect(decideCheckout(status)).toBe("portal")
    }
  })

  it("isSubscriptionLive bate com a decisão", () => {
    expect(isSubscriptionLive("past_due")).toBe(true)
    expect(isSubscriptionLive("canceled")).toBe(false)
  })
})

describe("getInvoiceSubscriptionId", () => {
  it("lê o campo da API atual (parent.subscription_details)", () => {
    expect(
      getInvoiceSubscriptionId(invoice({ parent: { subscription_details: { subscription: "sub_new" } } })),
    ).toBe("sub_new")
  })

  it("aceita a assinatura expandida", () => {
    expect(
      getInvoiceSubscriptionId(invoice({ parent: { subscription_details: { subscription: { id: "sub_obj" } } } })),
    ).toBe("sub_obj")
  })

  it("lê o campo antigo quando o endpoint está numa versão anterior da API", () => {
    expect(getInvoiceSubscriptionId(invoice({ subscription: "sub_old" }))).toBe("sub_old")
  })

  it("fatura avulsa não tem assinatura", () => {
    expect(getInvoiceSubscriptionId(invoice({ parent: null }))).toBeNull()
  })
})

describe("getSubscriptionPeriodEnd", () => {
  it("usa o maior fim de período entre os itens", () => {
    expect(getSubscriptionPeriodEnd(subscription([1_700_000_000, 1_700_500_000]))).toBe(1_700_500_000)
  })

  it("sem itens → null", () => {
    expect(getSubscriptionPeriodEnd(subscription([]))).toBeNull()
  })
})

describe("isCheckoutPaid", () => {
  it("boleto ainda não pago não libera nada", () => {
    expect(isCheckoutPaid({ payment_status: "unpaid" })).toBe(false)
  })

  it("pago ou sem pagamento devido (teste grátis) libera", () => {
    expect(isCheckoutPaid({ payment_status: "paid" })).toBe(true)
    expect(isCheckoutPaid({ payment_status: "no_payment_required" })).toBe(true)
  })
})

describe("centsToAmount", () => {
  it("converte centavos inteiros sem float", () => {
    expect(centsToAmount(29900)).toBe("299.00")
    expect(centsToAmount(4905)).toBe("49.05")
    expect(centsToAmount(7)).toBe("0.07")
    expect(centsToAmount(0)).toBe("0.00")
    expect(centsToAmount(null)).toBe("0.00")
  })
})

describe("interpretEventClaim", () => {
  it("SET NX criou a chave → processa", () => {
    expect(interpretEventClaim("OK", null)).toBe("claimed")
  })

  it("chave já marcada como feita → ignora", () => {
    expect(interpretEventClaim(null, "done")).toBe("already_done")
  })

  it("outra entrega processando (ou a chave sumiu no meio) → pede reenvio", () => {
    expect(interpretEventClaim(null, "processing")).toBe("in_progress")
    expect(interpretEventClaim(null, null)).toBe("in_progress")
  })
})
