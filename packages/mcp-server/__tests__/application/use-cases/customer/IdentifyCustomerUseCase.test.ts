import { describe, it, expect, vi, beforeEach } from "vitest"
import { IdentifyCustomerUseCase } from "../../../../src/application/use-cases/customer/IdentifyCustomerUseCase"
import { Customer } from "../../../../src/domain/entities/Customer"
import { mockCustomerRepo } from "../../../helpers/repository.mock"
import { IDS, FIXED } from "../../../helpers/fixtures"

describe("IdentifyCustomerUseCase", () => {
  let useCase: IdentifyCustomerUseCase
  let customerRepo: ReturnType<typeof mockCustomerRepo>

  beforeEach(() => {
    customerRepo = mockCustomerRepo()
    useCase = new IdentifyCustomerUseCase(customerRepo as any)
  })

  it("encontra cliente existente por telefone", async () => {
    const existingCustomer = Customer.create({
      id: IDS.customerId,
      salonId: IDS.salonId,
      phone: FIXED.clientPhone,
      name: "Cliente Existente",
    })
    customerRepo.findByPhone.mockResolvedValue(existingCustomer)

    const result = await useCase.execute({
      phone: FIXED.clientPhone,
      salonId: IDS.salonId,
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.found).toBe(true)
      expect(result.data.created).toBe(false)
      expect(result.data.name).toBe("Cliente Existente")
      expect(result.data.id).toBe(IDS.customerId)
    }
  })

  it("cria novo cliente quando não encontrado e nome fornecido", async () => {
    customerRepo.findByPhone.mockResolvedValue(null)

    const result = await useCase.execute({
      phone: FIXED.clientPhone,
      name: "Novo Cliente",
      salonId: IDS.salonId,
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.found).toBe(false)
      expect(result.data.created).toBe(true)
      expect(result.data.name).toBe("Novo Cliente")
      expect(result.data.id).toBeTruthy() // UUID gerado
    }
    expect(customerRepo.save).toHaveBeenCalled()
  })

  it("retorna 'não encontrado' quando cliente não existe e nome não fornecido", async () => {
    customerRepo.findByPhone.mockResolvedValue(null)

    const result = await useCase.execute({
      phone: FIXED.clientPhone,
      salonId: IDS.salonId,
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.found).toBe(false)
      expect(result.data.created).toBe(false)
      expect(result.data.id).toBe("")
      expect(result.data.message).toContain("Forneça o nome")
    }
    expect(customerRepo.save).not.toHaveBeenCalled()
  })

  it("não cria cliente quando nome é string vazia", async () => {
    customerRepo.findByPhone.mockResolvedValue(null)

    const result = await useCase.execute({
      phone: FIXED.clientPhone,
      name: "   ",
      salonId: IDS.salonId,
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.created).toBe(false)
    }
    expect(customerRepo.save).not.toHaveBeenCalled()
  })

  it("retorna erro para telefone inválido", async () => {
    const result = await useCase.execute({
      phone: "123",
      salonId: IDS.salonId,
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe("INVALID_PHONE")
    }
  })

  it("retorna erro para telefone vazio", async () => {
    const result = await useCase.execute({
      phone: "",
      salonId: IDS.salonId,
    })

    expect(result.success).toBe(false)
  })

  it("faz trim do nome antes de salvar", async () => {
    customerRepo.findByPhone.mockResolvedValue(null)

    const result = await useCase.execute({
      phone: FIXED.clientPhone,
      name: "  João Silva  ",
      salonId: IDS.salonId,
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.name).toBe("João Silva")
    }
  })
})
