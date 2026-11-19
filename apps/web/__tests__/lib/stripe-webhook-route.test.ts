import { describe, it, expect, vi, beforeEach } from "vitest"

const h = vi.hoisted(() => {
  const store = new Map<string, string>()
  const redis = {
    set: vi.fn(async (key: string, value: string, ...args: unknown[]) => {
      if (args.includes("NX") && store.has(key)) return null
      store.set(key, value)
      return "OK"
    }),
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    del: vi.fn(async (key: string) => (store.delete(key) ? 1 : 0)),
  }
  return {
    store,
    redis,
    constructEvent: vi.fn(),
    handleCheckoutSettled: vi.fn(),
    handleInvoicePaid: vi.fn(),
    handleInvoicePaymentFailed: vi.fn(),
    handleSubscriptionChanged: vi.fn(),
    handleCheckoutAsyncFailed: vi.fn(),
  }
})

vi.mock("@/lib/infra/redis", () => ({ getRedisClient: () => h.redis }))
vi.mock("@/lib/stripe", () => ({ stripe: { webhooks: { constructEvent: h.constructEvent } } }))
vi.mock("@/lib/services/stripe-billing.service", () => ({
  handleCheckoutSettled: h.handleCheckoutSettled,
  handleInvoicePaid: h.handleInvoicePaid,
  handleInvoicePaymentFailed: h.handleInvoicePaymentFailed,
  handleSubscriptionChanged: h.handleSubscriptionChanged,
  handleCheckoutAsyncFailed: h.handleCheckoutAsyncFailed,
}))

import { NextRequest } from "next/server"
import { POST } from "@/app/api/webhook/stripe/route"

function request(): NextRequest {
  return new NextRequest("https://example.test/api/webhook/stripe", {
    method: "POST",
    body: "{}",
    headers: { "stripe-signature": "t=1,v1=x" },
  })
}

const EVENT = { id: "evt_1", type: "checkout.session.completed", data: { object: { id: "cs_1" } } }

describe("POST /api/webhook/stripe", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    h.store.clear()
    h.constructEvent.mockReturnValue(EVENT)
  })

  it("assinatura inválida → 400 e nada processado", async () => {
    h.constructEvent.mockImplementation(() => {
      throw new Error("bad signature")
    })
    const res = await POST(request())
    expect(res.status).toBe(400)
    expect(h.handleCheckoutSettled).not.toHaveBeenCalled()
  })

  it("evento que falha é processado no reenvio (antes era descartado como duplicado)", async () => {
    h.handleCheckoutSettled.mockRejectedValueOnce(new Error("db timeout"))

    const first = await POST(request())
    expect(first.status).toBe(500)
    expect(h.store.has("stripe:event:evt_1")).toBe(false)

    const retry = await POST(request())
    expect(retry.status).toBe(200)
    expect(h.handleCheckoutSettled).toHaveBeenCalledTimes(2)
    expect(h.store.get("stripe:event:evt_1")).toBe("done")
  })

  it("evento já processado → 200 sem processar de novo", async () => {
    await POST(request())
    const again = await POST(request())
    expect(again.status).toBe(200)
    expect(h.handleCheckoutSettled).toHaveBeenCalledTimes(1)
  })

  it("entrega paralela do mesmo evento → 409 para o Stripe reenviar", async () => {
    h.store.set("stripe:event:evt_1", "processing")
    const res = await POST(request())
    expect(res.status).toBe(409)
    expect(h.handleCheckoutSettled).not.toHaveBeenCalled()
  })

  it("encaminha cada tipo de evento ao handler certo", async () => {
    const cases: Array<[string, keyof typeof h]> = [
      ["checkout.session.async_payment_succeeded", "handleCheckoutSettled"],
      ["checkout.session.async_payment_failed", "handleCheckoutAsyncFailed"],
      ["invoice.paid", "handleInvoicePaid"],
      ["invoice.payment_failed", "handleInvoicePaymentFailed"],
      ["customer.subscription.created", "handleSubscriptionChanged"],
      ["customer.subscription.updated", "handleSubscriptionChanged"],
      ["customer.subscription.deleted", "handleSubscriptionChanged"],
    ]
    for (const [type, handler] of cases) {
      h.store.clear()
      vi.clearAllMocks()
      h.constructEvent.mockReturnValue({ ...EVENT, id: `evt_${type}`, type })
      const res = await POST(request())
      expect(res.status).toBe(200)
      expect(h[handler]).toHaveBeenCalledTimes(1)
    }
  })
})
