import { describe, it, expect, beforeEach } from "vitest"
import { GetProfessionalsUseCase } from "../../../../src/application/use-cases/catalog/GetProfessionalsUseCase"
import {
  mockProfessionalRepo,
  mockServiceRepo,
  mockSalonRepo,
} from "../../../helpers/repository.mock"
import { IDS } from "../../../helpers/fixtures"

describe("GetProfessionalsUseCase", () => {
  let useCase: GetProfessionalsUseCase
  let professionalRepo: ReturnType<typeof mockProfessionalRepo>
  let serviceRepo: ReturnType<typeof mockServiceRepo>
  let salonRepo: ReturnType<typeof mockSalonRepo>

  beforeEach(() => {
    professionalRepo = mockProfessionalRepo()
    serviceRepo = mockServiceRepo()
    salonRepo = mockSalonRepo()
    useCase = new GetProfessionalsUseCase(
      professionalRepo as any,
      serviceRepo as any,
      salonRepo as any
    )
  })

  it("bloqueia a listagem no plano SOLO sem consultar profissionais", async () => {
    salonRepo.findById.mockResolvedValue({ isSoloPlan: () => true })

    const result = await useCase.execute({ salonId: IDS.salonId })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe("PLAN_RESTRICTION")
    }
    expect(professionalRepo.findBySalon).not.toHaveBeenCalled()
  })

  it("lista profissionais quando não é plano SOLO", async () => {
    salonRepo.findById.mockResolvedValue({ isSoloPlan: () => false })
    professionalRepo.findBySalon.mockResolvedValue([
      { id: IDS.professionalId, name: "João", isActive: true, services: [IDS.serviceId] },
    ])
    serviceRepo.findBySalon.mockResolvedValue([{ id: IDS.serviceId, name: "Corte" }])

    const result = await useCase.execute({ salonId: IDS.salonId })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.total).toBe(1)
      expect(result.data.professionals[0]).toMatchObject({
        id: IDS.professionalId,
        name: "João",
        services: ["Corte"],
      })
    }
  })
})
