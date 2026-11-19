import { describe, it, expect } from "vitest"
import { csvDate, csvFileName, csvMoney, toCsv } from "@/lib/utils/csv.utils"

/**
 * A planilha dos relatórios (docs/ROADMAP.md, fase 9, fatia 9f).
 *
 * O que estes testes seguram: o arquivo abre certo no Excel em português
 * (separador, vírgula decimal, acentos) e texto digitado por gente de fora não
 * vira fórmula.
 */

const body = (csv: string) => csv.replace(/^﻿/, "").split("\r\n")

describe("toCsv", () => {
  it("BOM, ponto e vírgula, CRLF e linha final", () => {
    const csv = toCsv(["Nome", "Valor"], [["Corte", 170]])
    expect(csv.startsWith("﻿")).toBe(true)
    expect(csv).toBe("﻿Nome;Valor\r\nCorte;170\r\n")
  })

  it("número com vírgula decimal, sem milhar e sem zeros sobrando", () => {
    expect(body(toCsv(["n"], [[1234.5], [0.1 + 0.2], [9.12], [3], [1.0005], [Number.NaN]]))).toEqual([
      "n",
      "1234,5",
      "0,3",
      "9,12",
      "3",
      "1,001",
      "",
      "",
    ])
  })

  it("vazio, sim e não", () => {
    expect(body(toCsv(["a", "b", "c", "d"], [[null, undefined, true, false]]))[1]).toBe(";;Sim;Não")
  })

  it("aspas em volta do que tem ponto e vírgula, aspas ou quebra de linha", () => {
    expect(body(toCsv(["t"], [["a;b"], ['diz "oi"'], ["simples"]]))).toEqual(["t", '"a;b"', '"diz ""oi"""', "simples", ""])
    expect(toCsv(["t"], [["linha 1\nlinha 2"]])).toBe('﻿t\r\n"linha 1\nlinha 2"\r\n')
  })

  it("texto que começa como fórmula ganha apóstrofo; número negativo não", () => {
    expect(body(toCsv(["t"], [["=HYPERLINK(\"x\")"], ["+55 11"], ["-desconto"], ["@usuario"], [-5]]))).toEqual([
      "t",
      "\"'=HYPERLINK(\"\"x\"\")\"",
      "'+55 11",
      "'-desconto",
      "'@usuario",
      "-5",
      "",
    ])
  })
})

describe("ajudas", () => {
  it("centavos viram reais, como número", () => {
    expect(csvMoney(19416)).toBe(194.16)
    expect(csvMoney(0)).toBe(0)
    expect(csvMoney(null)).toBeNull()
    expect(csvMoney(undefined)).toBeNull()
  })

  it("data em dia/mês/ano", () => {
    expect(csvDate("2026-11-19")).toBe("19/11/2026")
    expect(csvDate("2026-11-19T10:00:00Z")).toBe("19/11/2026")
    expect(csvDate(null)).toBe("")
    expect(csvDate("sem data")).toBe("sem data")
  })

  it("nome de arquivo sem acento, espaço nem parte vazia", () => {
    expect(csvFileName("Extrato de contas", "Teste Banco", "2026-11-01", "2026-11-19")).toBe(
      "extrato-de-contas_teste-banco_2026-11-01_2026-11-19.csv"
    )
    expect(csvFileName("Aniversariantes", "Março", 2026)).toBe("aniversariantes_marco_2026.csv")
    expect(csvFileName("Lista de produtos e serviços", null, undefined, "")).toBe("lista-de-produtos-e-servicos.csv")
    expect(csvFileName("???")).toBe("relatorio.csv")
  })
})
