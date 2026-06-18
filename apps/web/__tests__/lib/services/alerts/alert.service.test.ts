import { describe, it, expect, vi, beforeEach } from "vitest"

// vi.hoisted: as fns precisam existir ANTES das fábricas vi.mock (que são içadas).
const h = vi.hoisted(() => {
  const insertValues = vi.fn()
  const insertMock = vi.fn(() => ({ values: insertValues }))
  const updateWhere = vi.fn().mockResolvedValue(undefined)
  const updateSet = vi.fn(() => ({ where: updateWhere }))
  const updateMock = vi.fn(() => ({ set: updateSet }))
  const redisSet = vi.fn()
  const redisDel = vi.fn()
  return { insertValues, insertMock, updateWhere, updateSet, updateMock, redisSet, redisDel }
})

vi.mock("@repo/db", () => ({
  db: { insert: h.insertMock, update: h.updateMock, select: vi.fn() },
  systemAlerts: { id: "id", scope: "scope", salonId: "salon_id", type: "type", status: "status", createdAt: "created_at" },
  and: vi.fn((...args: unknown[]) => ({ and: args })),
  eq: vi.fn((a: unknown, b: unknown) => ({ eq: [a, b] })),
  isNull: vi.fn((a: unknown) => ({ isNull: a })),
  desc: vi.fn((a: unknown) => ({ desc: a })),
}))

vi.mock("@/lib/infra/redis", () => ({
  getRedisClient: () => ({ set: h.redisSet, del: h.redisDel }),
}))

import { recordAlert, resolveAlert } from "@/lib/services/alerts/alert.service"

describe("alert.service", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    h.insertValues.mockResolvedValue(undefined)
    h.updateWhere.mockResolvedValue(undefined)
    h.updateSet.mockReturnValue({ where: h.updateWhere })
    h.insertMock.mockReturnValue({ values: h.insertValues })
    h.updateMock.mockReturnValue({ set: h.updateSet })
  })

  it("recordAlert grava o alerta quando o throttle está livre (SET NX = OK)", async () => {
    h.redisSet.mockResolvedValue("OK")

    await recordAlert({ scope: "salon", salonId: "salon-1", type: "out_of_credits", severity: "critical", title: "Sem créditos" })

    expect(h.insertMock).toHaveBeenCalledTimes(1)
    expect(h.insertValues).toHaveBeenCalledWith(
      expect.objectContaining({ scope: "salon", salonId: "salon-1", type: "out_of_credits", severity: "critical", title: "Sem créditos" })
    )
  })

  it("recordAlert NÃO grava quando throttled (SET NX = null)", async () => {
    h.redisSet.mockResolvedValue(null)

    await recordAlert({ scope: "global", type: "worker_down", severity: "critical", title: "Worker caiu" })

    expect(h.insertMock).not.toHaveBeenCalled()
  })

  it("recordAlert nunca lança, mesmo se o insert falhar", async () => {
    h.redisSet.mockResolvedValue("OK")
    h.insertValues.mockRejectedValueOnce(new Error("db down"))

    await expect(
      recordAlert({ scope: "global", type: "worker_down", severity: "critical", title: "x" })
    ).resolves.toBeUndefined()
  })

  it("resolveAlert libera o cooldown e fecha os alertas abertos", async () => {
    await resolveAlert("worker_down", "salon-1")

    expect(h.redisDel).toHaveBeenCalledWith("alert:cooldown:worker_down:salon-1")
    expect(h.updateMock).toHaveBeenCalledTimes(1)
    expect(h.updateSet).toHaveBeenCalledWith(expect.objectContaining({ status: "resolved" }))
  })

  it("resolveAlert global usa a entidade 'global' no cooldown", async () => {
    await resolveAlert("queue_backlog")
    expect(h.redisDel).toHaveBeenCalledWith("alert:cooldown:queue_backlog:global")
  })
})
