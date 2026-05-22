import { describe, expect, it } from "vitest"
import {
  NIL_UUID,
  uuidSchema,
  uuidOptionalSchema,
} from "../../../src/presentation/schemas/common.schema"

const VALID_UUID = "11111111-1111-4111-8111-111111111111"

describe("common.schema UUID guards", () => {
  describe("uuidSchema", () => {
    it("aceita UUID válido", () => {
      expect(() => uuidSchema.parse(VALID_UUID)).not.toThrow()
    })

    it("rejeita UUID nulo (todos zeros) — defesa contra alucinação da IA", () => {
      expect(() => uuidSchema.parse(NIL_UUID)).toThrowError(/UUID nulo/)
    })

    it("rejeita string vazia e formato inválido", () => {
      expect(() => uuidSchema.parse("")).toThrow()
      expect(() => uuidSchema.parse("not-a-uuid")).toThrow()
    })
  })

  describe("uuidOptionalSchema", () => {
    it("aceita UUID válido", () => {
      expect(() => uuidOptionalSchema.parse(VALID_UUID)).not.toThrow()
    })

    it("aceita undefined", () => {
      expect(() => uuidOptionalSchema.parse(undefined)).not.toThrow()
    })

    it("rejeita UUID nulo mesmo sendo opcional", () => {
      expect(() => uuidOptionalSchema.parse(NIL_UUID)).toThrowError(/UUID nulo/)
    })
  })
})
