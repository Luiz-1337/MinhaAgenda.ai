import { describe, expect, it, vi } from "vitest"
import { TOKENS } from "../../../src/container"
import { registerAllTools } from "../../../src/presentation/tools"
import { createContainerMock } from "../../helpers/container.mock"
import { FIXED, IDS, makeAvailabilityDTO, makeIdentifyResultDTO } from "../../helpers/fixtures"
import { okResult } from "../../helpers/result"

describe("presentation/tools/index", () => {
  it("registerAllTools agrega 16 tools esperadas", () => {
    const container = {
      resolve: vi.fn(),
    } as any

    const tools = registerAllTools(container, IDS.salonId, FIXED.clientPhone)

    expect(Object.keys(tools)).toEqual([
      "addAppointment",
      "updateAppointment",
      "removeAppointment",
      "getMyFutureAppointments",
      "checkAvailability",
      "getAvailableSlots",
      "getProfessionalAvailabilityRules",
      "identifyCustomer",
      "createCustomer",
      "updateCustomerName",
      "getServices",
      "getProducts",
      "getProfessionals",
      "getSalonInfo",
      "saveCustomerPreference",
      "qualifyLead",
    ])
  })

  it("propaga salonId e clientPhone para tools criadas", async () => {
    const checkAvailabilityExecute = vi.fn().mockResolvedValue(okResult(makeAvailabilityDTO()))
    const identifyExecute = vi.fn().mockResolvedValue(okResult(makeIdentifyResultDTO()))

    const containerController = createContainerMock({
      [TOKENS.CheckAvailabilityUseCase]: { execute: checkAvailabilityExecute },
      [TOKENS.GetAvailableSlotsUseCase]: { execute: vi.fn().mockResolvedValue(okResult(makeAvailabilityDTO())) },
      [TOKENS.GetProfessionalAvailabilityRulesUseCase]: {
        execute: vi.fn().mockResolvedValue(okResult({ professionalId: IDS.professionalId, professionalName: "João", rules: [], message: "ok" })),
      },
      [TOKENS.IdentifyCustomerUseCase]: { execute: identifyExecute },
      [TOKENS.CreateCustomerUseCase]: { execute: vi.fn().mockResolvedValue(okResult({ id: IDS.customerId, phone: FIXED.clientPhone, phoneNormalized: FIXED.clientPhone, name: "Cliente", isNew: false, isIdentified: true })) },
      [TOKENS.UpdateCustomerUseCase]: { execute: vi.fn().mockResolvedValue(okResult({ id: IDS.customerId, phone: FIXED.clientPhone, phoneNormalized: FIXED.clientPhone, name: "Cliente", isNew: false, isIdentified: true })) },
      [TOKENS.GetServicesUseCase]: { execute: vi.fn().mockResolvedValue(okResult({ services: [], total: 0, message: "ok" })) },
      [TOKENS.GetProductsUseCase]: { execute: vi.fn().mockResolvedValue(okResult({ products: [], total: 0, message: "ok" })) },
      [TOKENS.GetProfessionalsUseCase]: { execute: vi.fn().mockResolvedValue(okResult({ professionals: [], total: 0, message: "ok" })) },
      [TOKENS.SalonRepository]: { findById: vi.fn().mockResolvedValue({ isSoloPlan: () => false }) },
      [TOKENS.GetSalonDetailsUseCase]: { execute: vi.fn().mockResolvedValue(okResult({ id: IDS.salonId, name: "Salão", businessHours: null, settings: {}, message: "ok" })) },
      [TOKENS.SaveCustomerPreferenceUseCase]: { execute: vi.fn().mockResolvedValue(okResult({ customerId: IDS.customerId, key: "k", value: "v", message: "ok" })) },
      [TOKENS.QualifyLeadUseCase]: { execute: vi.fn().mockResolvedValue(okResult({ leadId: IDS.leadId, status: "qualified", message: "ok" })) },
      [TOKENS.CreateAppointmentUseCase]: { execute: vi.fn().mockResolvedValue(okResult({ id: IDS.appointmentId, customerName: "Cliente", customerId: IDS.customerId, serviceName: "Corte", serviceId: IDS.serviceId, professionalName: "João", professionalId: IDS.professionalId, startsAt: "x", endsAt: "y", startsAtISO: "2026-04-10T09:00:00-03:00", endsAtISO: "2026-04-10T10:00:00-03:00", status: "pending" })) },
      [TOKENS.UpdateAppointmentUseCase]: { execute: vi.fn().mockResolvedValue(okResult({ id: IDS.appointmentId, customerName: "Cliente", customerId: IDS.customerId, serviceName: "Corte", serviceId: IDS.serviceId, professionalName: "João", professionalId: IDS.professionalId, startsAt: "x", endsAt: "y", startsAtISO: "2026-04-10T09:00:00-03:00", endsAtISO: "2026-04-10T10:00:00-03:00", status: "pending" })) },
      [TOKENS.DeleteAppointmentUseCase]: { execute: vi.fn().mockResolvedValue(okResult({ appointmentId: IDS.appointmentId, message: "ok" })) },
      [TOKENS.GetUpcomingAppointmentsUseCase]: { execute: vi.fn().mockResolvedValue(okResult({ appointments: [], total: 0, message: "ok" })) },
    })

    const tools = registerAllTools(containerController.container as any, IDS.salonId, FIXED.clientPhone)

    await tools.checkAvailability.execute({ date: FIXED.isoDateWithTimezone })
    await tools.identifyCustomer.execute({})

    expect(checkAvailabilityExecute).toHaveBeenCalledWith({
      salonId: IDS.salonId,
      date: FIXED.isoDateWithTimezone,
      professionalId: undefined,
      serviceId: undefined,
      serviceDuration: undefined,
    })
    expect(identifyExecute).toHaveBeenCalledWith({
      phone: FIXED.clientPhone,
      name: undefined,
      salonId: IDS.salonId,
    })
  })
})
