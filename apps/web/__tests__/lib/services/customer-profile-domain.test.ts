import { describe, it, expect } from "vitest"
import {
  customerAge,
  formatCpf,
  formatCustomerAddress,
  formatZipCode,
  isBirthday,
  isValidCpf,
  maskCpf,
  planCustomerProfile,
} from "@repo/db/src/domain/customer-profile"

/**
 * A regra dos dados cadastrais do cliente, testada sem banco (docs/ROADMAP.md,
 * fase 7, fatia 7a).
 *
 * O que estes testes seguram: CPF que não existe não entra na ficha, quem não pode
 * ver o CPF só vê o final, e a idade não erra na véspera do aniversário.
 *
 * Os CPFs abaixo são de teste: só têm os dígitos verificadores certos.
 */

const TODAY = "2026-11-18"

describe("isValidCpf", () => {
  it("aceita CPF com os dígitos verificadores certos, com ou sem pontuação", () => {
    expect(isValidCpf("52998224725")).toBe(true)
    expect(isValidCpf("529.982.247-25")).toBe(true)
    expect(isValidCpf("111.444.777-35")).toBe(true)
  })

  it("recusa dígito verificador errado, tamanho errado e sequência repetida", () => {
    expect(isValidCpf("52998224724")).toBe(false)
    expect(isValidCpf("5299822472")).toBe(false)
    expect(isValidCpf("529982247250")).toBe(false)
    expect(isValidCpf("11111111111")).toBe(false)
    expect(isValidCpf("00000000000")).toBe(false)
    expect(isValidCpf("")).toBe(false)
  })
})

describe("formatar e mascarar", () => {
  it("CPF: formata os 11 dígitos; o resto devolve como veio", () => {
    expect(formatCpf("52998224725")).toBe("529.982.247-25")
    expect(formatCpf("•••.•••.•••-25")).toBe("•••.•••.•••-25")
    expect(formatCpf(null)).toBe("")
  })

  it("máscara: só os dois últimos dígitos", () => {
    expect(maskCpf("52998224725")).toBe("•••.•••.•••-25")
    expect(maskCpf(null)).toBeNull()
    expect(maskCpf("123")).toBeNull()
  })

  it("CEP", () => {
    expect(formatZipCode("01310100")).toBe("01310-100")
    expect(formatZipCode("123")).toBe("123")
  })

  it("endereço numa linha, pulando o que falta", () => {
    expect(
      formatCustomerAddress({
        zipCode: "01310100",
        addressStreet: "Rua Exemplo",
        addressNumber: "10",
        addressComplement: "Apto 2",
        addressDistrict: "Centro",
        addressCity: "São Paulo",
        addressState: "SP",
      })
    ).toBe("Rua Exemplo, 10 - Apto 2 · Centro · São Paulo/SP · 01310-100")

    expect(
      formatCustomerAddress({
        zipCode: null,
        addressStreet: null,
        addressNumber: null,
        addressComplement: null,
        addressDistrict: null,
        addressCity: "Campinas",
        addressState: null,
      })
    ).toBe("Campinas")

    expect(
      formatCustomerAddress({
        zipCode: null,
        addressStreet: null,
        addressNumber: null,
        addressComplement: null,
        addressDistrict: null,
        addressCity: null,
        addressState: null,
      })
    ).toBe("")
  })
})

describe("idade e aniversário", () => {
  it("a idade só vira no dia do aniversário", () => {
    expect(customerAge("1990-11-19", TODAY)).toBe(35)
    expect(customerAge("1990-11-18", TODAY)).toBe(36)
    expect(customerAge("1990-01-01", TODAY)).toBe(36)
  })

  it("sem data, data inválida ou no futuro: sem idade", () => {
    expect(customerAge(null, TODAY)).toBeNull()
    expect(customerAge("1990-02-30", TODAY)).toBeNull()
    expect(customerAge("2027-01-01", TODAY)).toBeNull()
  })

  it("aniversário é o dia e o mês, em qualquer ano", () => {
    expect(isBirthday("1990-11-18", TODAY)).toBe(true)
    expect(isBirthday("1990-11-17", TODAY)).toBe(false)
    expect(isBirthday(null, TODAY)).toBe(false)
  })

  it("quem nasceu em 29/fev comemora em 28/fev fora de ano bissexto", () => {
    expect(isBirthday("1992-02-29", "2027-02-28")).toBe(true)
    // Em ano bissexto, só no dia 29.
    expect(isBirthday("1992-02-29", "2028-02-28")).toBe(false)
    expect(isBirthday("1992-02-29", "2028-02-29")).toBe(true)
  })
})

describe("planCustomerProfile", () => {
  it("tudo em branco vira ficha vazia", () => {
    expect(planCustomerProfile({ cpf: "  ", birthDate: "", addressCity: null }, TODAY)).toEqual({
      ok: true,
      profile: {
        birthDate: null,
        cpf: null,
        gender: null,
        zipCode: null,
        addressStreet: null,
        addressNumber: null,
        addressComplement: null,
        addressDistrict: null,
        addressCity: null,
        addressState: null,
        referralSource: null,
      },
    })
  })

  it("normaliza: CPF e CEP só com dígitos, UF em maiúsculas, espaços enxugados", () => {
    expect(
      planCustomerProfile(
        {
          birthDate: "1990-05-20",
          cpf: "529.982.247-25",
          gender: "female",
          zipCode: "01310-100",
          addressStreet: "  Rua   Exemplo ",
          addressNumber: "10",
          addressState: "sp",
          referralSource: " Indicação ",
        },
        TODAY
      )
    ).toEqual({
      ok: true,
      profile: {
        birthDate: "1990-05-20",
        cpf: "52998224725",
        gender: "female",
        zipCode: "01310100",
        addressStreet: "Rua Exemplo",
        addressNumber: "10",
        addressComplement: null,
        addressDistrict: null,
        addressCity: null,
        addressState: "SP",
        referralSource: "Indicação",
      },
    })
  })

  it("recusa CPF inválido, nascimento no futuro ou impossível, CEP curto, UF e gênero desconhecidos", () => {
    expect(planCustomerProfile({ cpf: "529.982.247-24" }, TODAY)).toEqual({ ok: false, error: "CPF inválido" })
    expect(planCustomerProfile({ cpf: "abc" }, TODAY)).toEqual({ ok: false, error: "CPF inválido" })
    expect(planCustomerProfile({ birthDate: "2026-11-19" }, TODAY).ok).toBe(false)
    expect(planCustomerProfile({ birthDate: "1990-02-30" }, TODAY).ok).toBe(false)
    expect(planCustomerProfile({ birthDate: "1899-12-31" }, TODAY).ok).toBe(false)
    expect(planCustomerProfile({ zipCode: "1234" }, TODAY).ok).toBe(false)
    expect(planCustomerProfile({ addressState: "XX" }, TODAY).ok).toBe(false)
    expect(planCustomerProfile({ gender: "x" }, TODAY).ok).toBe(false)
  })

  it("nascimento hoje é aceito (recém-nascido existe); textos têm teto", () => {
    expect(planCustomerProfile({ birthDate: TODAY }, TODAY).ok).toBe(true)
    expect(planCustomerProfile({ addressStreet: "a".repeat(121) }, TODAY).ok).toBe(false)
    expect(planCustomerProfile({ referralSource: "a".repeat(81) }, TODAY).ok).toBe(false)
    expect(planCustomerProfile({ referralSource: "a".repeat(80) }, TODAY).ok).toBe(true)
  })
})
