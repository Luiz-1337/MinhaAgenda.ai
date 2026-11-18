import { beforeEach, describe, expect, it, vi } from "vitest"
import { getCustomerCashbackService } from "@repo/db"
import { TOKENS } from "../../../src/container"
import { createCashbackTools, presentCashbackBalance } from "../../../src/presentation/tools/cashback.tools"
import { createContainerMock, type ContainerMockController } from "../../helpers/container.mock"
import { FIXED, IDS, makeIdentifyResultDTO } from "../../helpers/fixtures"
import { failResult, okResult } from "../../helpers/result"

/**
 * getMyCashbackBalance (docs/ROADMAP.md, fase 6, fatia 6f).
 *
 * O que estes testes seguram: a IA só enxerga o saldo do cliente DA CONVERSA
 * (salão e telefone vêm do contexto, nunca do modelo), não recebe o extrato, não
 * promete cashback com o programa desligado, e "não tem saldo" é uma resposta —
 * não um erro que viraria mensagem pronta ao cliente.
 */

function cashback(overrides: Partial<Awaited<ReturnType<typeof getCustomerCashbackService>>> = {}) {
  return {
    balance: "12.50",
    minRedeem: "10.00",
    isEnabled: true,
    status: "available" as const,
    entries: [],
    ...overrides,
  }
}

describe("presentCashbackBalance", () => {
  it("saldo que já pode ser usado", () => {
    expect(presentCashbackBalance(cashback())).toEqual({
      programaAtivo: true,
      saldo: "R$ 12,50",
      minimoParaUsar: "R$ 10,00",
      podeUsar: true,
      message: expect.stringContaining("já pode usar"),
    })
  })

  it("saldo abaixo do mínimo: informa, mas não pode usar", () => {
    const result = presentCashbackBalance(cashback({ balance: "4.00", status: "below_minimum" }))
    expect(result).toMatchObject({ saldo: "R$ 4,00", podeUsar: false })
    expect(result.message).toContain("mínimo para usar é R$ 10,00")
  })

  it("sem saldo, manda não inventar nem prometer", () => {
    const result = presentCashbackBalance(cashback({ balance: "0.00", status: "empty" }))
    expect(result).toMatchObject({ programaAtivo: true, saldo: "R$ 0,00", podeUsar: false })
    expect(result.message).toContain("Não invente saldo")
  })

  it("programa desligado no salão: não pode usar, mesmo com saldo antigo", () => {
    const result = presentCashbackBalance(cashback({ isEnabled: false }))
    expect(result).toMatchObject({ programaAtivo: false, podeUsar: false })
    expect(result.message).toContain("NÃO informe saldo")
  })

  it("não leva o extrato nem ids para a IA", () => {
    const result = presentCashbackBalance(cashback())
    expect(Object.keys(result).sort()).toEqual(["message", "minimoParaUsar", "podeUsar", "programaAtivo", "saldo"])
  })
})

describe("cashback.tools / getMyCashbackBalance", () => {
  let containerController: ContainerMockController
  const identifyExecute = vi.fn()
  const getCashback = vi.mocked(getCustomerCashbackService)

  beforeEach(() => {
    identifyExecute.mockReset()
    getCashback.mockReset()
    containerController = createContainerMock({
      [TOKENS.IdentifyCustomerUseCase]: { execute: identifyExecute },
    })
  })

  function tools() {
    return createCashbackTools({
      container: containerController.container as any,
      salonId: IDS.salonId,
      clientPhone: FIXED.clientPhone,
    })
  }

  it("consulta o saldo do cliente da conversa, no salão da conversa, sem extrato", async () => {
    identifyExecute.mockResolvedValueOnce(okResult(makeIdentifyResultDTO()))
    getCashback.mockResolvedValueOnce(cashback())

    const result = await tools().getMyCashbackBalance.execute({})

    expect(identifyExecute).toHaveBeenCalledWith({ phone: FIXED.clientPhone, salonId: IDS.salonId })
    expect(getCashback).toHaveBeenCalledWith({ salonId: IDS.salonId, customerId: IDS.customerId, limit: 0 })
    expect(result).toMatchObject({ saldo: "R$ 12,50", podeUsar: true })
  })

  it("ignora o que o modelo mandar: salão e cliente vêm do contexto", async () => {
    identifyExecute.mockResolvedValueOnce(okResult(makeIdentifyResultDTO()))
    getCashback.mockResolvedValueOnce(cashback())

    await tools().getMyCashbackBalance.execute({
      salonId: "99999999-9999-4999-8999-999999999999",
      customerId: "99999999-9999-4999-8999-999999999999",
      phone: "5500000000000",
    })

    expect(identifyExecute).toHaveBeenCalledWith({ phone: FIXED.clientPhone, salonId: IDS.salonId })
    expect(getCashback).toHaveBeenCalledWith(
      expect.objectContaining({ salonId: IDS.salonId, customerId: IDS.customerId })
    )
  })

  it("cliente sem cadastro: responde que não tem saldo, sem erro e sem consultar", async () => {
    identifyExecute.mockResolvedValueOnce(failResult(new Error("Cliente não encontrado")))
    const noRecord = await tools().getMyCashbackBalance.execute({})
    expect(noRecord).toMatchObject({ saldo: "R$ 0,00", podeUsar: false })
    expect(noRecord).not.toHaveProperty("error")

    expect(getCashback).not.toHaveBeenCalled()
  })

  it("falha do banco vira erro da tool, não saldo zerado", async () => {
    identifyExecute.mockResolvedValueOnce(okResult(makeIdentifyResultDTO()))
    getCashback.mockRejectedValueOnce(new Error("conexão caiu"))

    const result = await tools().getMyCashbackBalance.execute({})
    expect(result).toMatchObject({ error: true })
  })
})
