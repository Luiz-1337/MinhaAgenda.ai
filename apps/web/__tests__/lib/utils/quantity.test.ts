import { describe, it, expect } from "vitest"
import { formatQuantity, parseQuantity, quantityToInput } from "@/lib/utils/quantity.utils"

/**
 * Quantidade de estoque na tela.
 *
 * O que estes testes seguram: o que a tela põe num campo tem que voltar a ser o
 * mesmo número. No teste em uso da fatia 4e, salvar a configuração de um produto
 * com "1.000 ml por unidade" gravou 1 ml — o campo abriu com "1.000" e leu como um.
 */

describe("formatQuantity — para mostrar", () => {
  it("usa vírgula decimal, separador de milhar e corta zeros à direita", () => {
    expect(formatQuantity("12.500")).toBe("12,5")
    expect(formatQuantity("1000.000")).toBe("1.000")
    expect(formatQuantity("0.030")).toBe("0,03")
    expect(formatQuantity(3)).toBe("3")
  })
})

describe("quantityToInput — para pôr num campo", () => {
  it("não põe separador de milhar", () => {
    expect(quantityToInput("1000.000")).toBe("1000")
    expect(quantityToInput("12500.500")).toBe("12500,5")
    expect(quantityToInput("0.250")).toBe("0,25")
  })
})

describe("parseQuantity", () => {
  it("vírgula é o decimal", () => {
    expect(parseQuantity("0,25")).toBe(0.25)
    expect(parseQuantity("12,5")).toBe(12.5)
    expect(parseQuantity("1.250,5")).toBe(1250.5)
  })

  it("ponto seguido de três dígitos é milhar, como se escreve em português", () => {
    expect(parseQuantity("1.000")).toBe(1000)
    expect(parseQuantity("12.500")).toBe(12500)
    expect(parseQuantity("1.000.000")).toBe(1000000)
  })

  it("com parte inteira zero, o ponto é decimal", () => {
    expect(parseQuantity("0.250")).toBe(0.25)
    expect(parseQuantity("0.5")).toBe(0.5)
  })

  it("qualquer outro ponto é decimal", () => {
    expect(parseQuantity("1.5")).toBe(1.5)
    expect(parseQuantity("2.75")).toBe(2.75)
    expect(parseQuantity("10.0")).toBe(10)
  })

  it("inteiro puro e espaços", () => {
    expect(parseQuantity("30")).toBe(30)
    expect(parseQuantity(" 1 000 ")).toBe(1000)
  })

  it("o que não é número vira null", () => {
    expect(parseQuantity("")).toBeNull()
    expect(parseQuantity("abc")).toBeNull()
    expect(parseQuantity("-1")).toBeNull()
    expect(parseQuantity("1,2,3")).toBeNull()
  })
})

describe("ida e volta: o campo relê o que a tela pôs nele", () => {
  it.each(["1.000", "1000.000", "12500.500", "0.250", "0.030", "5.000", "999.999", "1234567.891"])(
    "%s volta igual",
    (column) => {
      expect(parseQuantity(quantityToInput(column))).toBe(Number(column))
    }
  )

  it("o texto de MOSTRAR também é relido certo, mesmo com milhar", () => {
    for (const column of ["1000.000", "12500.500", "5.000", "0.250"]) {
      expect(parseQuantity(formatQuantity(column))).toBe(Number(column))
    }
  })
})
