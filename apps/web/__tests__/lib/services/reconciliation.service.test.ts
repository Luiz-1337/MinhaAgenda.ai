import { describe, it, expect, vi, beforeEach } from "vitest"

// Mock @repo/db local: controla o retorno de db.execute e fornece um `sql` tag.
const h = vi.hoisted(() => ({ execute: vi.fn() }))
vi.mock("@repo/db", () => ({
  db: { execute: h.execute },
  sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values }),
}))

import { findUnansweredChats } from "@/lib/services/reconciliation.service"

const execute = h.execute

describe("reconciliation.service.findUnansweredChats", () => {
  beforeEach(() => vi.clearAllMocks())

  it("mapeia linhas (driver postgres-js retorna array)", async () => {
    execute.mockResolvedValue([
      { chat_id: "c1", salon_id: "s1", client_phone: "551199", last_user_at: "2026-06-17T21:00:00.000Z" },
      { chat_id: "c2", salon_id: "s1", client_phone: "551188", last_user_at: new Date("2026-06-17T21:05:00.000Z") },
    ])

    const result = await findUnansweredChats()

    expect(result).toHaveLength(2)
    expect(result[0]).toEqual({
      chatId: "c1",
      salonId: "s1",
      clientPhone: "551199",
      lastUserAt: "2026-06-17T21:00:00.000Z",
    })
    // Date é normalizada para ISO string
    expect(result[1].lastUserAt).toBe("2026-06-17T21:05:00.000Z")
  })

  it("lida com o shape { rows: [...] } (driver node-postgres)", async () => {
    execute.mockResolvedValue({ rows: [{ chat_id: "c3", salon_id: "s2", client_phone: "5511", last_user_at: "2026-06-17T20:00:00.000Z" }] })

    const result = await findUnansweredChats()

    expect(result).toHaveLength(1)
    expect(result[0].chatId).toBe("c3")
  })

  it("retorna [] quando não há conversas sem resposta", async () => {
    execute.mockResolvedValue([])
    const result = await findUnansweredChats()
    expect(result).toEqual([])
  })
})
