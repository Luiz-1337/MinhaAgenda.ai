import { describe, it, expect } from "vitest"
import {
  isValidPhone,
  formatPhone,
  normalizePhone,
} from "../../../src/shared/utils/phone.utils"
import { Phone } from "../../../src/domain/value-objects/Phone"
import { isOk } from "../../../src/shared/types"

describe("phone.utils", () => {
  describe("isValidPhone — brasileiros (sem regressão)", () => {
    it("aceita celular BR (11 dígitos)", () => {
      expect(isValidPhone("11987654321")).toBe(true)
    })

    it("aceita celular BR com DDI 55", () => {
      expect(isValidPhone("5511987654321")).toBe(true)
    })

    it("aceita fixo BR (10 dígitos)", () => {
      expect(isValidPhone("1133445566")).toBe(true)
    })

    it("aceita fixo BR com DDI 55", () => {
      expect(isValidPhone("551133445566")).toBe(true)
    })

    it("aceita entrada formatada (caracteres não numéricos)", () => {
      expect(isValidPhone("(11) 98765-4321")).toBe(true)
    })
  })

  describe("isValidPhone — internacionais (o bug)", () => {
    it("aceita celular de Portugal (+351, 12 dígitos)", () => {
      // Caso real de produção que era rejeitado.
      expect(isValidPhone("351910330958")).toBe(true)
    })

    it("aceita número dos EUA (+1, 11 dígitos)", () => {
      expect(isValidPhone("12025550123")).toBe(true)
    })

    it("aceita E.164 com '+' na entrada", () => {
      expect(isValidPhone("+351 910 330 958")).toBe(true)
    })
  })

  describe("isValidPhone — rejeições", () => {
    it("rejeita número curto (< 8 dígitos)", () => {
      expect(isValidPhone("12345")).toBe(false)
    })

    it("rejeita vazio", () => {
      expect(isValidPhone("")).toBe(false)
    })

    it("rejeita string sem dígitos", () => {
      expect(isValidPhone("abc")).toBe(false)
    })

    it("rejeita número longo demais (> 15 dígitos)", () => {
      expect(isValidPhone("1234567890123456")).toBe(false)
    })

    it("rejeita número internacional com zero à esquerda", () => {
      expect(isValidPhone("0511910330958")).toBe(false)
    })
  })

  describe("formatPhone", () => {
    it("formata celular BR", () => {
      expect(formatPhone("11987654321")).toBe("(11) 98765-4321")
    })

    it("formata fixo BR", () => {
      expect(formatPhone("1133445566")).toBe("(11) 3344-5566")
    })

    it("remove DDI 55 e formata", () => {
      expect(formatPhone("5511987654321")).toBe("(11) 98765-4321")
    })

    it("exibe internacional em E.164 (+DDI...)", () => {
      expect(formatPhone("351910330958")).toBe("+351910330958")
    })
  })

  describe("normalizePhone (agnóstico — não deve mudar)", () => {
    it("mantém apenas dígitos", () => {
      expect(normalizePhone("+351 910 330 958")).toBe("351910330958")
      expect(normalizePhone("(11) 98765-4321")).toBe("11987654321")
    })
  })

  describe("Phone.create", () => {
    it("aceita telefone internacional (antes falhava)", () => {
      const result = Phone.create("351910330958")
      expect(isOk(result)).toBe(true)
    })

    it("aceita telefone brasileiro", () => {
      const result = Phone.create("11987654321")
      expect(isOk(result)).toBe(true)
    })

    it("rejeita vazio", () => {
      expect(isOk(Phone.create(""))).toBe(false)
    })
  })
})
