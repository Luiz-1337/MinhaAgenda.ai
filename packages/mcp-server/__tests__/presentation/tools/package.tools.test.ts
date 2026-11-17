import { beforeEach, describe, expect, it, vi } from "vitest"
import { listCustomerPackageBalancesService } from "@repo/db"
import { TOKENS } from "../../../src/container"
import { createPackageTools, presentPackageBalance } from "../../../src/presentation/tools/package.tools"
import { createContainerMock, type ContainerMockController } from "../../helpers/container.mock"
import { FIXED, IDS, makeIdentifyResultDTO } from "../../helpers/fixtures"
import { failResult, okResult } from "../../helpers/result"

/**
 * getMyPackageBalance (docs/ROADMAP.md, fase 5, fatia 5d).
 *
 * O que estes testes seguram: a IA só enxerga o saldo do cliente DA CONVERSA
 * (salão e telefone vêm do contexto, nunca do modelo), sem ids internos, e "não
 * tem pacote" é uma resposta — não um erro que viraria mensagem pronta ao cliente.
 */

const balances = [
  {
    lineId: "line-1",
    customerPackageId: "pkg-1",
    packageName: "3 cortes",
    kind: "service" as const,
    serviceId: IDS.serviceId,
    productId: null,
    description: "Corte",
    quantity: 3,
    remaining: 2,
    soldOn: "2026-11-17",
    expiresOn: "2026-12-17",
  },
  {
    lineId: "line-2",
    customerPackageId: "pkg-1",
    packageName: "3 cortes",
    kind: "product" as const,
    serviceId: null,
    productId: IDS.productId,
    description: "Shampoo",
    quantity: 1,
    remaining: 1,
    soldOn: "2026-11-17",
    expiresOn: "2026-12-17",
  },
  {
    lineId: "line-3",
    customerPackageId: "pkg-2",
    packageName: "Hidratação avulsa",
    kind: "service" as const,
    serviceId: IDS.serviceId,
    productId: null,
    description: "Hidratação",
    quantity: 5,
    remaining: 5,
    soldOn: "2026-10-01",
    expiresOn: null,
  },
]

describe("presentPackageBalance", () => {
  it("agrupa as linhas por pacote, com saldo e validade", () => {
    expect(presentPackageBalance(balances)).toEqual({
      total: 2,
      packages: [
        {
          pacote: "3 cortes",
          compradoEm: "17/11/2026",
          validoAte: "17/12/2026",
          itens: [
            { item: "Corte", tipo: "serviço", saldo: 2, de: 3 },
            { item: "Shampoo", tipo: "produto", saldo: 1, de: 1 },
          ],
        },
        {
          pacote: "Hidratação avulsa",
          compradoEm: "01/10/2026",
          validoAte: "não vence",
          itens: [{ item: "Hidratação", tipo: "serviço", saldo: 5, de: 5 }],
        },
      ],
      message: expect.stringContaining("2 pacote(s) com saldo"),
    })
  })

  it("não expõe ids internos", () => {
    const json = JSON.stringify(presentPackageBalance(balances))
    expect(json).not.toContain("pkg-1")
    expect(json).not.toContain("line-1")
    expect(json).not.toContain(IDS.serviceId)
    expect(json).not.toContain(IDS.productId)
  })

  it("sem pacote, diz que não há e manda não inventar", () => {
    const result = presentPackageBalance([])
    expect(result.total).toBe(0)
    expect(result.packages).toEqual([])
    expect(result.message).toContain("Não invente saldo")
  })
})

describe("package.tools / getMyPackageBalance", () => {
  let containerController: ContainerMockController
  const identifyExecute = vi.fn()
  const listBalances = vi.mocked(listCustomerPackageBalancesService)

  beforeEach(() => {
    identifyExecute.mockReset()
    listBalances.mockReset()
    containerController = createContainerMock({
      [TOKENS.IdentifyCustomerUseCase]: { execute: identifyExecute },
    })
  })

  function tools() {
    return createPackageTools({
      container: containerController.container as any,
      salonId: IDS.salonId,
      clientPhone: FIXED.clientPhone,
    })
  }

  it("consulta o saldo do cliente da conversa, no salão da conversa", async () => {
    identifyExecute.mockResolvedValueOnce(okResult(makeIdentifyResultDTO()))
    listBalances.mockResolvedValueOnce(balances)

    const result = await tools().getMyPackageBalance.execute({})

    expect(identifyExecute).toHaveBeenCalledWith({ phone: FIXED.clientPhone, salonId: IDS.salonId })
    expect(listBalances).toHaveBeenCalledWith({
      salonId: IDS.salonId,
      customerId: IDS.customerId,
      now: expect.any(Date),
    })
    expect(result).toMatchObject({ total: 2 })
  })

  it("ignora o que o modelo mandar: salão e cliente vêm do contexto", async () => {
    identifyExecute.mockResolvedValueOnce(okResult(makeIdentifyResultDTO()))
    listBalances.mockResolvedValueOnce([])

    await tools().getMyPackageBalance.execute({
      salonId: "99999999-9999-4999-8999-999999999999",
      customerId: "99999999-9999-4999-8999-999999999999",
      phone: "5500000000000",
    })

    expect(identifyExecute).toHaveBeenCalledWith({ phone: FIXED.clientPhone, salonId: IDS.salonId })
    expect(listBalances).toHaveBeenCalledWith(
      expect.objectContaining({ salonId: IDS.salonId, customerId: IDS.customerId })
    )
  })

  it("cliente sem cadastro: responde que não tem pacote, sem erro e sem consultar", async () => {
    identifyExecute.mockResolvedValueOnce(failResult(new Error("Cliente não encontrado")))
    const noRecord = await tools().getMyPackageBalance.execute({})
    expect(noRecord).toMatchObject({ total: 0, packages: [] })
    expect(noRecord).not.toHaveProperty("error")

    identifyExecute.mockResolvedValueOnce(okResult(makeIdentifyResultDTO({ id: undefined as never })))
    const noId = await tools().getMyPackageBalance.execute({})
    expect(noId).toMatchObject({ total: 0, packages: [] })

    expect(listBalances).not.toHaveBeenCalled()
  })

  it("falha do banco vira erro da tool, não saldo vazio", async () => {
    identifyExecute.mockResolvedValueOnce(okResult(makeIdentifyResultDTO()))
    listBalances.mockRejectedValueOnce(new Error("conexão caiu"))

    const result = await tools().getMyPackageBalance.execute({})
    expect(result).toMatchObject({ error: true })
  })
})
