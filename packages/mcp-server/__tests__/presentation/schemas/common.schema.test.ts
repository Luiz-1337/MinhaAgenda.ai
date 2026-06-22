import { describe, expect, it } from "vitest"
import {
  NIL_UUID,
  uuidSchema,
  uuidOptionalSchema,
} from "../../../src/presentation/schemas/common.schema"

const VALID_UUID = "b3a1ca53-e673-40d8-9019-7f5a3df259e5"

describe("common.schema UUID guards", () => {
  describe("uuidSchema", () => {
    it("aceita UUID válido", () => {
      const result = uuidSchema.safeParse(VALID_UUID)
      expect(result.success).toBe(true)
    })

    it("rejeita UUID nulo (todos zeros) com mensagem instrutiva ao agente", () => {
      const result = uuidSchema.safeParse(NIL_UUID)
      expect(result.success).toBe(false)
      if (!result.success) {
        const message = result.error.issues[0]?.message ?? ""
        expect(message).toContain("NUNCA invente")
        expect(message).toContain("getServices")
      }
    })

    it("rejeita string vazia e formato inválido", () => {
      expect(uuidSchema.safeParse("").success).toBe(false)
      expect(uuidSchema.safeParse("not-a-uuid").success).toBe(false)
    })
  })

  describe("uuidOptionalSchema", () => {
    it("aceita UUID válido", () => {
      expect(uuidOptionalSchema.safeParse(VALID_UUID).success).toBe(true)
    })

    it("aceita undefined", () => {
      expect(uuidOptionalSchema.safeParse(undefined).success).toBe(true)
    })

    it("rejeita UUID nulo mesmo sendo opcional", () => {
      const result = uuidOptionalSchema.safeParse(NIL_UUID)
      expect(result.success).toBe(false)
      if (!result.success) {
        const message = result.error.issues[0]?.message ?? ""
        expect(message).toContain("NUNCA invente")
      }
    })
  })
})
