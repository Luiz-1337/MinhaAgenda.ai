import { describe, it, expect } from "vitest"
import {
  MessagesUpdateDataSchema,
  normalizeAckStatus,
  MessageAckStatus,
} from "@/lib/schemas/evolution"

describe("MessagesUpdateDataSchema", () => {
  // Formato real emitido pela Evolution v2.3.x (achatado, sem objeto `key`).
  // Era exatamente este payload que falhava no safeParse, fazendo a escada
  // status:0 e a confirmação de entrega nunca dispararem.
  it("parses the flattened v2.3.x payload (keyId/fromMe/status at root)", () => {
    const parsed = MessagesUpdateDataSchema.safeParse({
      keyId: "3EB052CEF97694BDBB4339",
      remoteJid: "5511943859555@s.whatsapp.net",
      fromMe: true,
      participant: undefined,
      status: "ERROR",
      pollUpdates: undefined,
      instanceId: "e9c0a77f-6e3d-48a0-90c6-c11f8478a3bf",
      messageId: "cmqjk5db91a3eqt5krnpdlx2s",
    })

    expect(parsed.success).toBe(true)
    if (!parsed.success) return
    expect(parsed.data.key.id).toBe("3EB052CEF97694BDBB4339")
    expect(parsed.data.key.fromMe).toBe(true)
    expect(normalizeAckStatus(parsed.data.update?.status ?? parsed.data.status)).toBe(
      MessageAckStatus.ERROR
    )
  })

  it("still parses the nested payload (key/update at proper levels)", () => {
    const parsed = MessagesUpdateDataSchema.safeParse({
      key: { id: "3EB0X", remoteJid: "5511999999999@s.whatsapp.net", fromMe: true },
      update: { status: 3 },
    })

    expect(parsed.success).toBe(true)
    if (!parsed.success) return
    expect(parsed.data.key.id).toBe("3EB0X")
    expect(normalizeAckStatus(parsed.data.update?.status ?? parsed.data.status)).toBe(
      MessageAckStatus.DELIVERY_ACK
    )
  })

  it("rejects payloads with neither key nor keyId/remoteJid", () => {
    expect(MessagesUpdateDataSchema.safeParse({ status: "ERROR" }).success).toBe(false)
  })
})

describe("normalizeAckStatus", () => {
  it("maps string and numeric statuses", () => {
    expect(normalizeAckStatus("ERROR")).toBe(0)
    expect(normalizeAckStatus(0)).toBe(0)
    expect(normalizeAckStatus("DELIVERY_ACK")).toBe(3)
    expect(normalizeAckStatus(2)).toBe(2)
    expect(normalizeAckStatus(undefined)).toBeNull()
  })
})
