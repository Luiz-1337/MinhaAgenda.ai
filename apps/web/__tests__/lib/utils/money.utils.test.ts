import { describe, it, expect } from "vitest"
import {
  toAmount,
  formatBRL,
  parseBRL,
  toNumericString,
  suggestedPriceFromService,
} from "@/lib/utils/money.utils"

/**
 * Dinheiro é o dado que o CRM inteiro passa a derivar (LTV, ticket médio, receita
 * por profissional, ROI de campanha). Errar a leitura do campo de preço uma vez
 * contamina todo relatório para sempre, e o valor cobrado NÃO é recalculável
 * depois — o catálogo muda.
 */

describe("toAmount", () => {
  it("aceita numeric do banco (string) e number", () => {
    expect(toAmount("120.50")).toBe(120.5)
    expect(toAmount(120.5)).toBe(120.5)
  })

  it("distingue sem-valor de zero", () => {
    // "sem preço" e "cortesia" sao coisas diferentes: o primeiro e dado faltando,
    // o segundo e decisao do salao. Colapsar os dois em 0 mente no relatorio.
    expect(toAmount(null)).toBeNull()
    expect(toAmount(undefined)).toBeNull()
    expect(toAmount("")).toBeNull()
    expect(toAmount("0")).toBe(0)
    expect(toAmount(0)).toBe(0)
  })

  it("lixo devolve null, nao NaN", () => {
    expect(toAmount("sob avaliacao")).toBeNull()
    expect(toAmount("abc")).toBeNull()
  })
})

describe("formatBRL", () => {
  it("formata em pt-BR", () => {
    expect(formatBRL("120.5")).toBe("R$ 120,50")
    expect(formatBRL("1200")).toBe("R$ 1.200,00")
  })

  it("cortesia aparece como R$ 0,00", () => {
    expect(formatBRL("0")).toBe("R$ 0,00")
  })

  it("sem valor aparece como travessao, nao como zero", () => {
    // Um atendimento sem preco registrado nao pode parecer cortesia na tela.
    expect(formatBRL(null)).toBe("—")
    expect(formatBRL("")).toBe("—")
  })
})

describe("parseBRL", () => {
  it("le as formas que aparecem num balcao brasileiro", () => {
    expect(parseBRL("120")).toBe(120)
    expect(parseBRL("120,50")).toBe(120.5)
    expect(parseBRL("R$ 120,50")).toBe(120.5)
    expect(parseBRL("  R$ 1.200,00 ")).toBe(1200)
  })

  it("aceita ponto decimal do teclado numerico", () => {
    expect(parseBRL("120.50")).toBe(120.5)
    expect(parseBRL("120.5")).toBe(120.5)
  })

  it("resolve a ambiguidade do ponto pelo numero de casas", () => {
    // Esta e a armadilha real: em "1.200" o ponto e milhar, em "120.50" e decimal.
    // Confundir os dois transforma R$ 1.200 em R$ 1,20.
    expect(parseBRL("1.200")).toBe(1200)
    expect(parseBRL("1,200")).toBe(1200)
    expect(parseBRL("1.200,50")).toBe(1200.5)
    expect(parseBRL("1.200.000")).toBe(1200000)
  })

  it("zero explicito e valido (cortesia)", () => {
    expect(parseBRL("0")).toBe(0)
    expect(parseBRL("0,00")).toBe(0)
    expect(parseBRL("R$ 0,00")).toBe(0)
  })

  it("vazio e lixo devolvem null, nunca 0", () => {
    // Se lixo virasse 0, um erro de digitacao seria gravado como cortesia.
    expect(parseBRL("")).toBeNull()
    expect(parseBRL(null)).toBeNull()
    expect(parseBRL("abc")).toBeNull()
    expect(parseBRL("R$")).toBeNull()
  })
})

describe("toNumericString", () => {
  it("sempre 2 casas, para a coluna numeric(10,2)", () => {
    expect(toNumericString(120)).toBe("120.00")
    expect(toNumericString(120.5)).toBe("120.50")
    expect(toNumericString(0)).toBe("0.00")
  })
})

describe("suggestedPriceFromService", () => {
  const base = {
    price: "100.00",
    priceType: "fixed",
    priceMin: null,
    priceMax: null,
    priceOnRequest: false,
  }

  it("preco fixo abre com o preco do catalogo", () => {
    expect(suggestedPriceFromService(base)).toBe(100)
  })

  it("sob avaliacao abre VAZIO", () => {
    // Usar o catalogo como proxy aqui gravaria receita errada.
    expect(suggestedPriceFromService({ ...base, priceOnRequest: true })).toBeNull()
  })

  it("faixa abre no minimo (ancora conservadora)", () => {
    // Corrigir para cima e mais facil de notar do que um valor alto passar batido.
    expect(
      suggestedPriceFromService({
        ...base,
        priceType: "range",
        priceMin: "80.00",
        priceMax: "150.00",
      })
    ).toBe(80)
  })

  it("faixa sem minimo cai no preco base", () => {
    expect(
      suggestedPriceFromService({ ...base, priceType: "range", priceMin: null })
    ).toBe(100)
  })

  it("preco zero no catalogo abre VAZIO, nao como cortesia", () => {
    // ~30% dos servicos em producao tem preco 0, faixa ou sob avaliacao. Abrir
    // como R$ 0,00 faria o balcao concluir sem perceber que nao informou valor.
    expect(suggestedPriceFromService({ ...base, price: "0" })).toBeNull()
    expect(suggestedPriceFromService({ ...base, price: "0.00" })).toBeNull()
  })
})
