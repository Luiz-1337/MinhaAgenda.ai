import type {
  AppointmentDTO,
  AppointmentListDTO,
  AvailabilityDTO,
  CustomerDTO,
  IdentifyCustomerResultDTO,
  ProductListDTO,
  ProfessionalAvailabilityRulesDTO,
  ProfessionalListDTO,
  QualifyLeadResultDTO,
  SalonDTO,
  ServiceListDTO,
} from "../../src/application/dtos"

export const IDS = {
  salonId: "11111111-1111-4111-8111-111111111111",
  customerId: "22222222-2222-4222-8222-222222222222",
  appointmentId: "33333333-3333-4333-8333-333333333333",
  appointmentId2: "44444444-4444-4444-8444-444444444444",
  professionalId: "55555555-5555-4555-8555-555555555555",
  serviceId: "66666666-6666-4666-8666-666666666666",
  productId: "77777777-7777-4777-8777-777777777777",
  leadId: "88888888-8888-4888-8888-888888888888",
} as const

export const FIXED = {
  clientPhone: "5511999999999",
  isoDateWithoutTimezone: "2026-04-10T09:30",
  isoDateWithTimezone: "2026-04-10T09:30:00-03:00",
  isoDateOnly: "2026-04-10",
} as const

export function makeAppointmentDTO(overrides: Partial<AppointmentDTO> = {}): AppointmentDTO {
  return {
    id: IDS.appointmentId,
    customerName: "Cliente Teste",
    customerId: IDS.customerId,
    serviceName: "Corte",
    serviceId: IDS.serviceId,
    professionalName: "João",
    professionalId: IDS.professionalId,
    startsAt: "10/04/2026 às 09:30",
    endsAt: "10/04/2026 às 10:30",
    startsAtISO: "2026-04-10T09:30:00-03:00",
    endsAtISO: "2026-04-10T10:30:00-03:00",
    status: "pending",
    notes: "Trazer referência",
    ...overrides,
  }
}

export function makeAppointmentListDTO(
  overrides: Partial<AppointmentListDTO> = {}
): AppointmentListDTO {
  const appointments = overrides.appointments ?? [makeAppointmentDTO()]

  return {
    appointments,
    total: appointments.length,
    message: "Agendamentos encontrados",
    ...overrides,
  }
}

export function makeAvailabilityDTO(overrides: Partial<AvailabilityDTO> = {}): AvailabilityDTO {
  return {
    date: "10/04/2026",
    dateISO: "2026-04-10",
    professional: "João",
    professionalId: IDS.professionalId,
    slots: [
      { time: "09:00", available: true },
      { time: "09:30", available: false },
      { time: "10:00", available: true },
    ],
    totalAvailable: 2,
    message: "Horários disponíveis",
    ...overrides,
  }
}

export function makeRulesDTO(
  overrides: Partial<ProfessionalAvailabilityRulesDTO> = {}
): ProfessionalAvailabilityRulesDTO {
  return {
    professionalId: IDS.professionalId,
    professionalName: "João",
    rules: [
      {
        dayOfWeek: 2,
        dayName: "Terça-feira",
        startTime: "09:00",
        endTime: "18:00",
        isBreak: false,
      },
    ],
    message: "Regras carregadas",
    ...overrides,
  }
}

export function makeCustomerDTO(overrides: Partial<CustomerDTO> = {}): CustomerDTO {
  return {
    id: IDS.customerId,
    phone: "(11) 99999-9999",
    phoneNormalized: FIXED.clientPhone,
    name: "Cliente Teste",
    email: "cliente@teste.com",
    isNew: false,
    isIdentified: true,
    ...overrides,
  }
}

export function makeIdentifyResultDTO(
  overrides: Partial<IdentifyCustomerResultDTO> = {}
): IdentifyCustomerResultDTO {
  return {
    id: IDS.customerId,
    name: "Cliente Teste",
    phone: FIXED.clientPhone,
    found: true,
    created: false,
    message: "Cliente encontrado",
    ...overrides,
  }
}

export function makeServiceListDTO(overrides: Partial<ServiceListDTO> = {}): ServiceListDTO {
  const services =
    overrides.services ??
    [
      {
        id: IDS.serviceId,
        name: "Corte",
        description: "Corte completo",
        duration: 60,
        durationFormatted: "1h",
        price: 50,
        priceFormatted: "R$ 50,00",
        isActive: true,
      },
    ]

  return {
    services,
    total: services.length,
    message: "Serviços carregados",
    ...overrides,
  }
}

export function makeProductListDTO(overrides: Partial<ProductListDTO> = {}): ProductListDTO {
  const products =
    overrides.products ??
    [
      {
        id: IDS.productId,
        name: "Pomada",
        description: "Modeladora",
        price: 35,
        priceFormatted: "R$ 35,00",
        isActive: true,
      },
    ]

  return {
    products,
    total: products.length,
    message: "Produtos carregados",
    ...overrides,
  }
}

export function makeProfessionalListDTO(
  overrides: Partial<ProfessionalListDTO> = {}
): ProfessionalListDTO {
  const professionals =
    overrides.professionals ??
    [
      {
        id: IDS.professionalId,
        name: "João",
        isActive: true,
        services: ["Corte"],
        serviceIds: [IDS.serviceId],
      },
    ]

  return {
    professionals,
    total: professionals.length,
    message: "Profissionais carregados",
    ...overrides,
  }
}

export function makeSalonDTO(overrides: Partial<SalonDTO> = {}): SalonDTO {
  return {
    id: IDS.salonId,
    name: "Barbearia Teste",
    address: "Rua Teste, 123",
    phone: "1133334444",
    whatsapp: "5511999999999",
    description: "Descrição",
    cancellationPolicy: "Cancelar com 2h de antecedência",
    businessHours: {
      1: { start: "09:00", end: "18:00" },
    },
    settings: {},
    message: "Informações carregadas",
    ...overrides,
  }
}

export function makeQualifyLeadResultDTO(
  overrides: Partial<QualifyLeadResultDTO> = {}
): QualifyLeadResultDTO {
  return {
    leadId: IDS.leadId,
    status: "qualified",
    message: "Lead qualificado",
    ...overrides,
  }
}
