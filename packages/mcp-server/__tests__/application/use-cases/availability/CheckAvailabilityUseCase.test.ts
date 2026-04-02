import { describe, it, expect, vi, beforeEach } from "vitest"
import { CheckAvailabilityUseCase } from "../../../../src/application/use-cases/availability/CheckAvailabilityUseCase"
import { TimeSlot } from "../../../../src/domain/entities"
import { Salon } from "../../../../src/domain/entities/Salon"
import { Service } from "../../../../src/domain/entities/Service"
import { Appointment } from "../../../../src/domain/entities/Appointment"
import { DateRange } from "../../../../src/domain/value-objects"
import {
  mockAppointmentRepo,
  mockAvailabilityRepo,
  mockSalonRepo,
  mockServiceRepo,
  mockCalendarService,
  mockExternalScheduler,
} from "../../../helpers/repository.mock"
import { IDS } from "../../../helpers/fixtures"

function makeSlots(count: number, baseDate = "2026-06-15"): TimeSlot[] {
  const slots: TimeSlot[] = []
  for (let i = 0; i < count; i++) {
    const hour = 9 + i
    slots.push(
      new TimeSlot({
        start: new Date(`${baseDate}T${String(hour).padStart(2, "0")}:00:00Z`),
        end: new Date(`${baseDate}T${String(hour + 1).padStart(2, "0")}:00:00Z`),
        available: true,
        professionalId: IDS.professionalId,
      })
    )
  }
  return slots
}

function makeSalon(): Salon {
  return Salon.create({
    id: IDS.salonId,
    ownerId: "owner-1",
    name: "Barbearia Teste",
    workingHours: {
      1: { start: "09:00", end: "18:00" },
      2: { start: "09:00", end: "18:00" },
      3: { start: "09:00", end: "18:00" },
      4: { start: "09:00", end: "18:00" },
      5: { start: "09:00", end: "18:00" },
    },
  })
}

function makeService(): Service {
  return Service.create({
    id: IDS.serviceId,
    salonId: IDS.salonId,
    name: "Corte",
    duration: 30,
    price: 50,
    isActive: true,
  })
}

describe("CheckAvailabilityUseCase", () => {
  let useCase: CheckAvailabilityUseCase
  let appointmentRepo: ReturnType<typeof mockAppointmentRepo>
  let availabilityRepo: ReturnType<typeof mockAvailabilityRepo>
  let salonRepo: ReturnType<typeof mockSalonRepo>
  let serviceRepo: ReturnType<typeof mockServiceRepo>
  let calendarService: ReturnType<typeof mockCalendarService>
  let externalScheduler: ReturnType<typeof mockExternalScheduler>

  beforeEach(() => {
    appointmentRepo = mockAppointmentRepo()
    availabilityRepo = mockAvailabilityRepo()
    salonRepo = mockSalonRepo()
    serviceRepo = mockServiceRepo()
    calendarService = mockCalendarService()
    externalScheduler = mockExternalScheduler()

    useCase = new CheckAvailabilityUseCase(
      appointmentRepo as any,
      availabilityRepo as any,
      salonRepo as any,
      serviceRepo as any,
      calendarService as any,
      externalScheduler as any
    )
  })

  it("gera slots a partir do profissional via availabilityRepo", async () => {
    const slots = makeSlots(3)
    availabilityRepo.generateSlots.mockResolvedValue(slots)

    const result = await useCase.execute({
      salonId: IDS.salonId,
      date: "2026-06-15T12:00:00Z",
      professionalId: IDS.professionalId,
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.slots.length).toBe(3)
      expect(result.data.totalAvailable).toBe(3)
    }
    expect(availabilityRepo.generateSlots).toHaveBeenCalledWith(
      IDS.professionalId,
      expect.any(Date),
      15 // SLOT_DURATION padrão
    )
  })

  it("usa duração do serviço quando serviceId é fornecido", async () => {
    const service = makeService()
    serviceRepo.findById.mockResolvedValue(service)
    availabilityRepo.generateSlots.mockResolvedValue(makeSlots(2))

    await useCase.execute({
      salonId: IDS.salonId,
      date: "2026-06-15T12:00:00Z",
      professionalId: IDS.professionalId,
      serviceId: IDS.serviceId,
    })

    expect(availabilityRepo.generateSlots).toHaveBeenCalledWith(
      IDS.professionalId,
      expect.any(Date),
      30 // duração do serviço
    )
  })

  it("faz fallback para horários do salão quando profissional não tem slots", async () => {
    availabilityRepo.generateSlots.mockResolvedValue([])
    salonRepo.findById.mockResolvedValue(makeSalon())

    const result = await useCase.execute({
      salonId: IDS.salonId,
      date: "2026-06-15T12:00:00Z",
      professionalId: IDS.professionalId,
    })

    expect(result.success).toBe(true)
    expect(salonRepo.findById).toHaveBeenCalledWith(IDS.salonId)
    if (result.success) {
      expect(result.data.slots.length).toBeGreaterThan(0)
    }
  })

  it("marca slots como ocupados quando há agendamentos existentes", async () => {
    const slots = makeSlots(3)
    availabilityRepo.generateSlots.mockResolvedValue(slots)

    const conflictingAppointment = Appointment.create({
      id: "apt-conflict",
      salonId: IDS.salonId,
      customerId: "cust-1",
      professionalId: IDS.professionalId,
      serviceId: IDS.serviceId,
      startsAt: new Date("2026-06-15T09:00:00Z"),
      endsAt: new Date("2026-06-15T10:00:00Z"),
      status: "confirmed",
    })
    appointmentRepo.findByProfessionalAndDate.mockResolvedValue([conflictingAppointment])

    const result = await useCase.execute({
      salonId: IDS.salonId,
      date: "2026-06-15T12:00:00Z",
      professionalId: IDS.professionalId,
    })

    expect(result.success).toBe(true)
    if (result.success) {
      // O primeiro slot (09:00-10:00 UTC) deve estar indisponível por conflito
      expect(result.data.slots[0].available).toBe(false)
      // Os demais devem continuar disponíveis
      expect(result.data.slots[1].available).toBe(true)
    }
  })

  it("marca slots como ocupados via Google Calendar FreeBusy", async () => {
    const slots = makeSlots(3)
    availabilityRepo.generateSlots.mockResolvedValue(slots)
    calendarService.isConfigured.mockResolvedValue(true)
    calendarService.getFreeBusy.mockResolvedValue([
      new DateRange(
        new Date("2026-06-15T10:00:00Z"),
        new Date("2026-06-15T11:00:00Z")
      ),
    ])

    const result = await useCase.execute({
      salonId: IDS.salonId,
      date: "2026-06-15T12:00:00Z",
      professionalId: IDS.professionalId,
    })

    expect(result.success).toBe(true)
    if (result.success) {
      // O segundo slot (10:00-11:00 UTC) deve estar indisponível via Google Calendar
      expect(result.data.slots[1].available).toBe(false)
      // Os demais devem continuar disponíveis
      expect(result.data.slots[0].available).toBe(true)
    }
  })

  it("marca slots como ocupados via external scheduler (Trinks)", async () => {
    const slots = makeSlots(3)
    availabilityRepo.generateSlots.mockResolvedValue(slots)
    externalScheduler.isConfigured.mockResolvedValue(true)
    externalScheduler.getBusySlots.mockResolvedValue([
      new TimeSlot({
        start: new Date("2026-06-15T11:00:00Z"),
        end: new Date("2026-06-15T12:00:00Z"),
        available: false,
      }),
    ])

    const result = await useCase.execute({
      salonId: IDS.salonId,
      date: "2026-06-15T12:00:00Z",
      professionalId: IDS.professionalId,
    })

    expect(result.success).toBe(true)
    if (result.success) {
      // O terceiro slot (11:00-12:00 UTC) deve estar indisponível via Trinks
      expect(result.data.slots[2].available).toBe(false)
      // Os demais devem continuar disponíveis
      expect(result.data.slots[0].available).toBe(true)
    }
  })

  it("trata erros do Google Calendar graciosamente (não quebra)", async () => {
    const slots = makeSlots(3)
    availabilityRepo.generateSlots.mockResolvedValue(slots)
    calendarService.isConfigured.mockResolvedValue(true)
    calendarService.getFreeBusy.mockRejectedValue(new Error("Google API error"))

    const result = await useCase.execute({
      salonId: IDS.salonId,
      date: "2026-06-15T12:00:00Z",
      professionalId: IDS.professionalId,
    })

    // Deve retornar sucesso mesmo com erro do Google
    expect(result.success).toBe(true)
    if (result.success) {
      // Todos os slots devem permanecer disponíveis
      expect(result.data.totalAvailable).toBe(3)
    }
  })

  it("trata erros do Trinks graciosamente (não quebra)", async () => {
    const slots = makeSlots(3)
    availabilityRepo.generateSlots.mockResolvedValue(slots)
    externalScheduler.isConfigured.mockResolvedValue(true)
    externalScheduler.getBusySlots.mockRejectedValue(new Error("Trinks API error"))

    const result = await useCase.execute({
      salonId: IDS.salonId,
      date: "2026-06-15T12:00:00Z",
      professionalId: IDS.professionalId,
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.totalAvailable).toBe(3)
    }
  })

  it("retorna mensagem de 'sem horários' quando todos slots são indisponíveis", async () => {
    const slots = makeSlots(1)
    slots[0].markUnavailable()
    availabilityRepo.generateSlots.mockResolvedValue(slots)

    const result = await useCase.execute({
      salonId: IDS.salonId,
      date: "2026-06-15T12:00:00Z",
      professionalId: IDS.professionalId,
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.totalAvailable).toBe(0)
      expect(result.data.message).toContain("Não há horários disponíveis")
    }
  })

  it("não busca agendamentos/calendário quando professionalId não é fornecido", async () => {
    salonRepo.findById.mockResolvedValue(makeSalon())

    await useCase.execute({
      salonId: IDS.salonId,
      date: "2026-06-15T12:00:00Z",
    })

    expect(appointmentRepo.findByProfessionalAndDate).not.toHaveBeenCalled()
    expect(calendarService.isConfigured).not.toHaveBeenCalled()
  })

  it("retorna slots vazios quando salão não tem horário definido para o dia", async () => {
    availabilityRepo.generateSlots.mockResolvedValue([])
    // Salão sem horários para domingo (0)
    const salon = Salon.create({
      id: IDS.salonId,
      ownerId: "owner-1",
      name: "Barbearia",
      workingHours: {},
    })
    salonRepo.findById.mockResolvedValue(salon)

    const result = await useCase.execute({
      salonId: IDS.salonId,
      date: "2026-06-14T12:00:00Z", // Um domingo
      professionalId: IDS.professionalId,
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.slots.length).toBe(0)
      expect(result.data.totalAvailable).toBe(0)
    }
  })
})
