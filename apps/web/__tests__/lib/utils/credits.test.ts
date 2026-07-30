import { describe, it, expect } from "vitest"
import { calculateCredits, getModelWeight, MODEL_WEIGHTS } from "@/lib/utils/credits"

/**
 * Crédito é COBRANÇA: é o que consome o saldo do plano do salão e o que aparece na
 * tela de billing. Errar o peso significa cobrar a mais ou a menos de um cliente
 * pagante — e foi exatamente o que acontecia até 30/07/2026.
 *
 * `debitSalonCredits` (escritor ao vivo, no worker) gravava `tokensUsed` CRU,
 * ignorando MODEL_WEIGHTS. O salão era cobrado em dobro por todo uso do modelo mini,
 * e o número só voltava ao certo se alguém abrisse o dashboard — o `after()` de lá
 * recalculava a tabela inteira, ponderado, sobrescrevendo. O saldo do cliente
 * dependia de alguém ter visitado uma tela.
 *
 * Medido em produção: Spettacolo Salone tinha 1.265.982 créditos gravados contra
 * 604.520 no recálculo ponderado.
 */

const MINI = "gpt-5.4-mini-2026-03-17"

describe("getModelWeight", () => {
  it("o modelo mini vale 0,5 por token", () => {
    expect(getModelWeight(MINI)).toBe(0.5)
    expect(MODEL_WEIGHTS[MINI]).toBe(0.5)
  })

  it("modelo desconhecido vale 1,0 — nunca 0", () => {
    // Peso 0 faria uso real sair de graça e o saldo nunca baixar.
    expect(getModelWeight("gpt-4o")).toBe(1.0)
    expect(getModelWeight("modelo-que-nao-existe")).toBe(1.0)
    expect(getModelWeight("unknown")).toBe(1.0)
  })

  it("null/undefined/vazio caem em 1,0", () => {
    // O worker passa `response.model ?? "unknown"`, mas a função tem que aguentar.
    expect(getModelWeight(null)).toBe(1.0)
    expect(getModelWeight(undefined)).toBe(1.0)
    expect(getModelWeight("")).toBe(1.0)
  })

  it("normaliza espaco e caixa, como o SQL espelha", () => {
    // weightedCreditsSql faz lower(btrim(...)); os dois lados tem que concordar,
    // senao o recalculo do cron divergiria do debito ao vivo.
    expect(getModelWeight(`  ${MINI}  `)).toBe(0.5)
    expect(getModelWeight(MINI.toUpperCase())).toBe(0.5)
  })
})

describe("calculateCredits", () => {
  it("aplica o peso do modelo", () => {
    expect(calculateCredits(1000, MINI)).toBe(500)
    expect(calculateCredits(1000, "gpt-4o")).toBe(1000)
  })

  it("o mini custa METADE do bruto — a diferenca que causava cobranca em dobro", () => {
    const tokens = 1_265_982
    expect(calculateCredits(tokens, MINI)).toBe(632_991)
    // O valor cru, que era o que ia para o banco antes da correcao:
    expect(calculateCredits(tokens, MINI)).toBeLessThan(tokens)
  })

  it("arredonda para o inteiro mais proximo", () => {
    // A coluna credits e int. 0.5 tem que arredondar para cima (half away from
    // zero), igual ao ROUND(::numeric) que o SQL do cron usa — se divergirem, o
    // recalculo muda o numero sem ninguem ter gasto nada.
    expect(calculateCredits(3, MINI)).toBe(2)   // 1.5 -> 2
    expect(calculateCredits(5, MINI)).toBe(3)   // 2.5 -> 3
    expect(calculateCredits(1, MINI)).toBe(1)   // 0.5 -> 1
  })

  it("zero e negativo nao geram credito", () => {
    expect(calculateCredits(0, MINI)).toBe(0)
    expect(calculateCredits(-100, MINI)).toBe(0)
  })

  it("nunca devolve NaN", () => {
    // NaN em `credits` (coluna int) estouraria o insert do worker no meio do
    // processamento de uma mensagem.
    expect(Number.isNaN(calculateCredits(100, null))).toBe(false)
    expect(Number.isNaN(calculateCredits(100, undefined))).toBe(false)
  })
})
