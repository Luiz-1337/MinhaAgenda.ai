import { describe, it, expect } from "vitest"
import {
  uuidSchema,
  uuidOptionalSchema,
} from "../../../src/presentation/schemas/common.schema"

const NIL_UUID = "00000000-0000-0000-0000-000000000000"
const REAL_UUID = "b3a1ca53-e673-40d8-9019-7f5a3df259e5"

describe("uuidSchema", () => {
  it("aceita UUID real", () => {
    const result = uuidSchema.safeParse(REAL_UUID)
    expect(result.success).toBe(true)
  })

  it("rejeita o nil UUID com mensagem instrutiva ao agente", () => {
    const result = uuidSchema.safeParse(NIL_UUID)
    expect(result.success).toBe(false)
    if (!result.success) {
      const message = result.error.issues[0]?.message ?? ""
      expect(message).toContain("NUNCA invente")
      expect(message).toContain("getServices")
    }
  })

  it("rejeita strings que não são UUIDs", () => {
    const result = uuidSchema.safeParse("not-a-uuid")
    expect(result.success).toBe(false)
  })

  it("rejeita string vazia", () => {
    const result = uuidSchema.safeParse("")
    expect(result.success).toBe(false)
  })
})

describe("uuidOptionalSchema", () => {
  it("aceita undefined", () => {
    const result = uuidOptionalSchema.safeParse(undefined)
    expect(result.success).toBe(true)
  })

  it("aceita UUID real", () => {
    const result = uuidOptionalSchema.safeParse(REAL_UUID)
    expect(result.success).toBe(true)
  })

  it("rejeita o nil UUID mesmo quando opcional", () => {
    const result = uuidOptionalSchema.safeParse(NIL_UUID)
    expect(result.success).toBe(false)
    if (!result.success) {
      const message = result.error.issues[0]?.message ?? ""
      expect(message).toContain("NUNCA invente")
    }
  })
})
