import { describe, expect, it } from "vitest"
import { CatalogPresenter } from "../../src/presentation/presenters/CatalogPresenter"
import { AvailabilityPresenter } from "../../src/presentation/presenters/AvailabilityPresenter"
import type { ServiceListDTO } from "../../src/application/dtos/CatalogDTO"
import type { AvailabilityDTO } from "../../src/application/dtos/AvailabilityDTO"

/**
 * O `_instrucao` que a tool devolve é o último texto que o modelo lê antes de
 * escrever a resposta. Diretriz de FORMATO ali (o que informar, quantos itens)
 * vencia o prompt do dono do salão: "Informe nome, preço e duração" contra "nunca
 * informe a duração" e "ofereça 2-3 horários" contra "sempre 4" (Liz, 23/09/2026).
 * Formato é do system prompt, onde o salão tem precedência; aqui só segurança e
 * regra de negócio.
 */

const FORMAT_DIRECTIVES = [/dura[çc][ãa]o/i, /\b\d\s*-\s*\d\s*hor[áa]rios\b/i, /\binforme\b/i, /\bapresente\b/i]

function expectNoFormatDirective(instrucao: unknown) {
  expect(typeof instrucao).toBe("string")
  for (const pattern of FORMAT_DIRECTIVES) {
    expect(instrucao).not.toMatch(pattern)
  }
  // A trava de segurança continua.
  expect(instrucao).toMatch(/NUNCA mostre IDs/)
}

describe("_instrucao das tools não dita formato", () => {
  it("getServices: sem 'informe nome, preço e duração'", () => {
    const dto: ServiceListDTO = {
      services: [
        {
          id: "svc-1",
          name: "Corte Feminino",
          duration: 60,
          durationFormatted: "1h",
          price: 290,
          priceFormatted: "R$ 290,00",
          isActive: true,
        },
      ],
      total: 1,
      message: "1 serviço",
    }

    const json = CatalogPresenter.servicesToJSON(dto)

    expectNoFormatDirective(json._instrucao)
    // A regra de negócio do preço sob avaliação continua.
    expect(json._instrucao).toMatch(/precoSobAvaliacao/)
  })

  const baseAvailability: Omit<AvailabilityDTO, "slots"> = {
    date: "quinta-feira, 25/09",
    dateISO: "2026-09-25",
    totalAvailable: 2,
    message: "2 horários",
  }

  it("checkAvailability por profissional: sem '2-3 horários', mas prefere o especialista", () => {
    const json = AvailabilityPresenter.toJSON({
      ...baseAvailability,
      slots: [
        { time: "09:00", available: true, professionalName: "Marcos", isSpecialist: true },
        { time: "14:00", available: true, professionalName: "Marcos", isSpecialist: true },
      ],
    })

    expect(json.mode).toBe("byProfessional")
    expectNoFormatDirective(json._instrucao)
    expect(json._instrucao).toMatch(/Prefira o ESPECIALISTA/)
  })

  it("checkAvailability simples: sem 'apresente apenas 2-3 horários'", () => {
    const json = AvailabilityPresenter.toJSON({
      ...baseAvailability,
      professional: "Marcos",
      slots: [
        { time: "09:00", available: true },
        { time: "14:00", available: true },
      ],
    })

    expect(json.mode).toBeUndefined()
    expectNoFormatDirective(json._instrucao)
  })
})
