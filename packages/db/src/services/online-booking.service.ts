import { and, asc, count, eq, gt, inArray, lt, ne } from "drizzle-orm"

import {
  appointments,
  availability,
  customers,
  db,
  professionalServices,
  professionals,
  salons,
  scheduleOverrides,
  services,
} from "../index"
import {
  bookingDayOfWeek,
  bookingDayStart,
  clockToMinutes,
  computeDaySlots,
  isBookingDay,
  minutesToClock,
  MINUTES_PER_DAY,
  onlineBookingLimitError,
  onlineBookingNotBefore,
  onlineBookingWindow,
  planOnlineBookingCustomer,
  toDayMinutes,
  type MinuteRange,
} from "../domain/booking-slots"
import { parseSalonModules } from "../domain/permissions"
import { getBlockingDuration, parseAllowedStartTimes, parseAllowedWeekdays, isWeekdayAllowed } from "../utils/service-schedule.utils"
import { parseAdvancePayment, type AdvancePaymentConfig } from "../domain/appointment-deposits"
import { createAppointmentDepositService } from "./appointment-deposits.service"
import { getAgendaBusyIntervals } from "./agenda-sync.service"
import { createAppointmentService, type ActionResult } from "./appointments"
import { canonicalCustomerPhone, findCustomerByPhoneAnyFormat } from "./customer-phone.service"
import { getGoogleFreeBusyForProfessional } from "./google-calendar"
import { getPersonProfessionalIds } from "./person"

/**
 * Agendamento online (docs/ROADMAP.md, fase 7, fatia 7f).
 *
 * Duas partes:
 *
 *  1. `listProfessionalDaySlotsService` — os horários livres de UM profissional num
 *     dia, para um serviço. Junta TUDO o que ocupa: expediente, intervalos,
 *     agendamentos da pessoa (em qualquer salão), folgas e bloqueios
 *     (`schedule_overrides`), Google e agenda oficial. A conta é de
 *     domain/booking-slots.ts.
 *
 *  2. As funções da página PÚBLICA. Não há sessão: quem chama é qualquer pessoa na
 *     internet. Por isso só respondem para salão com o módulo `online_booking`
 *     ligado, só devolvem o que um cliente precisa para marcar (nomes de serviço e
 *     de profissional, horários livres) e nunca dizem se um telefone já é
 *     cliente.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value)
}

function pgErrorCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null) return undefined
  const direct = error as { code?: string; cause?: unknown }
  const cause = (typeof direct.cause === "object" && direct.cause !== null ? direct.cause : {}) as { code?: string }
  return direct.code ?? cause.code
}

// ============================================================================
// 1. Horários livres de um profissional num dia
// ============================================================================

/**
 * Os inícios livres ("HH:mm", Brasília) de um profissional num dia, para um
 * serviço. Vazio quando o serviço não é feito no dia, o profissional não trabalha
 * ou está tudo ocupado.
 *
 * Só oferece o que `createAppointmentService` aceita gravar: por isso NÃO usa o
 * horário de funcionamento do salão quando o profissional não tem expediente
 * cadastrado (a criação recusaria).
 *
 * Google e agenda oficial são consultados sem travar: se não responderem, o
 * horário aparece, e quem barra é a criação (que confere de novo).
 */
export async function listProfessionalDaySlotsService(input: {
  salonId: string
  professionalId: string
  serviceId: string
  /** "AAAA-MM-DD", em Brasília. */
  day: string
  /** Não oferecer nada antes deste minuto do dia. NULL = sem corte. */
  notBefore?: number | null
}): Promise<string[]> {
  const { salonId, professionalId, serviceId, day } = input
  if (!isBookingDay(day)) return []

  const [service, professional, link] = await Promise.all([
    db.query.services.findFirst({
      where: and(eq(services.id, serviceId), eq(services.salonId, salonId)),
      columns: { duration: true, durationMax: true, allowedWeekdays: true, allowedStartTimes: true, isActive: true, isSystem: true },
    }),
    db.query.professionals.findFirst({
      where: and(eq(professionals.id, professionalId), eq(professionals.salonId, salonId)),
      columns: { id: true, isActive: true },
    }),
    db.query.professionalServices.findFirst({
      where: and(eq(professionalServices.professionalId, professionalId), eq(professionalServices.serviceId, serviceId)),
      columns: { id: true },
    }),
  ])
  if (!service || !service.isActive || service.isSystem) return []
  if (!professional || !professional.isActive || !link) return []

  const dayOfWeek = bookingDayOfWeek(day)
  if (!isWeekdayAllowed(parseAllowedWeekdays(service.allowedWeekdays), dayOfWeek)) return []

  const rules = await db
    .select({ startTime: availability.startTime, endTime: availability.endTime, isBreak: availability.isBreak })
    .from(availability)
    .where(and(eq(availability.professionalId, professionalId), eq(availability.dayOfWeek, dayOfWeek)))

  const workSpans: MinuteRange[] = []
  const breaks: MinuteRange[] = []
  for (const rule of rules) {
    const start = clockToMinutes(String(rule.startTime))
    const end = clockToMinutes(String(rule.endTime))
    if (start === null || end === null) continue
    ;(rule.isBreak ? breaks : workSpans).push({ start, end })
  }
  if (workSpans.length === 0) return []

  const dayStart = bookingDayStart(day)
  const dayEnd = new Date(dayStart.getTime() + MINUTES_PER_DAY * 60000)
  const personProfessionalIds = await getPersonProfessionalIds(professionalId)

  const [booked, overrides, googleBusy, agendaBusy] = await Promise.all([
    db
      .select({ start: appointments.date, end: appointments.endTime })
      .from(appointments)
      .where(
        and(
          inArray(appointments.professionalId, personProfessionalIds),
          ne(appointments.status, "cancelled"),
          lt(appointments.date, dayEnd),
          gt(appointments.endTime, dayStart)
        )
      ),
    db
      .select({ start: scheduleOverrides.startTime, end: scheduleOverrides.endTime })
      .from(scheduleOverrides)
      .where(
        and(
          inArray(scheduleOverrides.professionalId, personProfessionalIds),
          lt(scheduleOverrides.startTime, dayEnd),
          gt(scheduleOverrides.endTime, dayStart)
        )
      ),
    getGoogleFreeBusyForProfessional(salonId, professionalId, dayStart, dayEnd).catch((error) => {
      console.warn("[online-booking] Google indisponível — horários seguem sem ele:", error)
      return [] as { start: Date; end: Date }[]
    }),
    getAgendaBusyIntervals(salonId, professionalId, dayStart, dayEnd).catch((error) => {
      console.warn("[online-booking] agenda oficial indisponível — horários seguem sem ela:", error)
      return [] as { start: Date; end: Date }[]
    }),
  ])

  const busy = [...booked, ...overrides, ...googleBusy, ...agendaBusy].map((range) =>
    toDayMinutes(dayStart, { start: new Date(range.start), end: new Date(range.end) })
  )

  const discrete = parseAllowedStartTimes(service.allowedStartTimes)
  const discreteStarts = discrete
    ? discrete.map((time) => clockToMinutes(time)).filter((minutes): minutes is number => minutes !== null)
    : null

  return computeDaySlots({
    workSpans,
    breaks,
    busy,
    duration: getBlockingDuration(service.duration, service.durationMax),
    discreteStarts,
    notBefore: input.notBefore ?? null,
  }).map(minutesToClock)
}

// ============================================================================
// 2. Página pública
// ============================================================================

export type OnlineBookingService = {
  id: string
  name: string
  description: string | null
  /** Minutos que o atendimento reserva. */
  duration: number
  /** "R$ 80,00", "R$ 80,00 a R$ 120,00", "Sob avaliação" ou NULL (sem preço). */
  priceLabel: string | null
  professionals: { id: string; name: string }[]
}

export type OnlineBookingSalon = {
  salonName: string
  services: OnlineBookingService[]
  firstDay: string
  lastDay: string
  /** O sinal que o salão pede (valor e chave PIX). NULL = não pede. */
  deposit: AdvancePaymentConfig | null
}

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" })

function priceLabel(service: {
  price: string
  priceType: string
  priceMin: string | null
  priceMax: string | null
  priceOnRequest: boolean
}): string | null {
  if (service.priceOnRequest) return "Sob avaliação"
  const min = Number(service.priceMin)
  const max = Number(service.priceMax)
  if (service.priceType === "range" && min > 0 && max > 0) return `${money.format(min)} a ${money.format(max)}`
  const price = Number(service.price)
  return price > 0 ? money.format(price) : null
}

async function loadOnlineBookingSalon(
  salonId: unknown
): Promise<{ id: string; name: string; deposit: AdvancePaymentConfig | null } | null> {
  if (!isUuid(salonId)) return null
  const salon = await db.query.salons.findFirst({
    where: eq(salons.id, salonId),
    columns: { id: true, name: true, settings: true },
  })
  if (!salon || !parseSalonModules(salon.settings).includes("online_booking")) return null
  return { id: salon.id, name: salon.name, deposit: parseAdvancePayment(salon.settings) }
}

/**
 * O que a página pública mostra de um salão. NULL = salão desconhecido OU sem o
 * agendamento online ligado (mesma resposta para os dois, de propósito).
 *
 * Só entram serviços ativos que têm ao menos um profissional ativo que os faz.
 */
export async function getOnlineBookingSalonService(salonId: unknown, now: Date): Promise<OnlineBookingSalon | null> {
  const salon = await loadOnlineBookingSalon(salonId)
  if (!salon) return null

  const rows = await db
    .select({
      serviceId: services.id,
      serviceName: services.name,
      description: services.description,
      duration: services.duration,
      durationMax: services.durationMax,
      price: services.price,
      priceType: services.priceType,
      priceMin: services.priceMin,
      priceMax: services.priceMax,
      priceOnRequest: services.priceOnRequest,
      professionalId: professionals.id,
      professionalName: professionals.name,
    })
    .from(services)
    .innerJoin(professionalServices, eq(professionalServices.serviceId, services.id))
    .innerJoin(
      professionals,
      and(
        eq(professionals.id, professionalServices.professionalId),
        eq(professionals.salonId, salon.id),
        eq(professionals.isActive, true)
      )
    )
    .where(and(eq(services.salonId, salon.id), eq(services.isActive, true), eq(services.isSystem, false)))
    .orderBy(asc(services.name), asc(professionals.name))

  const byService = new Map<string, OnlineBookingService>()
  for (const row of rows) {
    let service = byService.get(row.serviceId)
    if (!service) {
      service = {
        id: row.serviceId,
        name: row.serviceName,
        description: row.description,
        duration: getBlockingDuration(row.duration, row.durationMax),
        priceLabel: priceLabel(row),
        professionals: [],
      }
      byService.set(row.serviceId, service)
    }
    service.professionals.push({ id: row.professionalId, name: row.professionalName })
  }

  return { salonName: salon.name, services: [...byService.values()], ...onlineBookingWindow(now), deposit: salon.deposit }
}

/** Os horários livres que a página oferece. Vazio para qualquer entrada que não feche. */
export async function listOnlineBookingSlotsService(input: {
  salonId: unknown
  serviceId: unknown
  professionalId: unknown
  day: unknown
  now: Date
}): Promise<string[]> {
  if (!isUuid(input.serviceId) || !isUuid(input.professionalId) || !isBookingDay(input.day)) return []
  const salon = await loadOnlineBookingSalon(input.salonId)
  if (!salon) return []

  const notBefore = onlineBookingNotBefore(input.day, input.now)
  if (notBefore === null) return []

  return listProfessionalDaySlotsService({
    salonId: salon.id,
    professionalId: input.professionalId,
    serviceId: input.serviceId,
    day: input.day,
    notBefore,
  })
}

const SLOT_TAKEN = "Este horário acabou de ser ocupado. Escolha outro"

/**
 * Marca o horário pela página pública.
 *
 * O horário pedido tem que estar ENTRE os que a página oferece agora: a lista é
 * recalculada aqui, e é isso que impede marcar fora do expediente, em cima do
 * almoço ou além do que a página mostra, mesmo com o pedido montado à mão. Quem
 * grava é `createAppointmentService`, com a trava de conflito e a agenda oficial.
 *
 * O cadastro do cliente é achado pelo telefone ou criado. Cadastro que já existe
 * NÃO tem o nome trocado: quem digita o telefone de outra pessoa não renomeia o
 * cliente do salão.
 */
export async function createOnlineBookingService(input: {
  salonId: unknown
  serviceId: unknown
  professionalId: unknown
  day: unknown
  time: unknown
  name: unknown
  phone: unknown
  now: Date
}): Promise<ActionResult<{ day: string; time: string; deposit: AdvancePaymentConfig | null }>> {
  const unavailable = { success: false as const, error: "Agendamento online indisponível" }
  if (!isUuid(input.serviceId) || !isUuid(input.professionalId)) return unavailable
  const day = input.day
  const time = input.time
  if (!isBookingDay(day) || typeof time !== "string" || clockToMinutes(time) === null) {
    return { success: false, error: "Escolha um dia e um horário" }
  }

  const salon = await loadOnlineBookingSalon(input.salonId)
  if (!salon) return unavailable

  const customerPlan = planOnlineBookingCustomer({ name: input.name, phone: input.phone })
  if (!customerPlan.ok) return { success: false, error: customerPlan.error }

  const slots = await listOnlineBookingSlotsService({
    salonId: salon.id,
    serviceId: input.serviceId,
    professionalId: input.professionalId,
    day,
    now: input.now,
  })
  if (!slots.includes(time)) return { success: false, error: SLOT_TAKEN }

  // O cadastro: pelo telefone, em qualquer formato; senão, um novo.
  const phone = canonicalCustomerPhone(`55${customerPlan.phoneDigits}`)
  let customerId = (await findCustomerByPhoneAnyFormat({ salonId: salon.id, phone }))?.id ?? null

  if (customerId) {
    const [future] = await db
      .select({ value: count() })
      .from(appointments)
      .where(
        and(
          eq(appointments.salonId, salon.id),
          eq(appointments.clientId, customerId),
          inArray(appointments.status, ["pending", "confirmed"]),
          gt(appointments.date, input.now)
        )
      )
    const limitError = onlineBookingLimitError(Number(future?.value ?? 0))
    if (limitError) return { success: false, error: limitError }
  } else {
    try {
      const [created] = await db
        .insert(customers)
        .values({ salonId: salon.id, name: customerPlan.name, phone, nameConfirmedAt: input.now })
        .returning({ id: customers.id })
      customerId = created.id
    } catch (error) {
      // Dois pedidos do mesmo telefone ao mesmo tempo: o cadastro já nasceu.
      if (pgErrorCode(error) !== "23505") throw error
      customerId = (await findCustomerByPhoneAnyFormat({ salonId: salon.id, phone }))?.id ?? null
      if (!customerId) throw error
    }
  }

  const result = await createAppointmentService({
    salonId: salon.id,
    professionalId: input.professionalId,
    clientId: customerId,
    serviceId: input.serviceId,
    date: `${day}T${time}:00-03:00`,
    notes: "Agendado pelo cliente na página de agendamento online",
  })
  if (!result.success) {
    const taken = result.code === "APPOINTMENT_CONFLICT" || result.code === "PROFESSIONAL_NOT_AVAILABLE"
    // Não repassa mensagem interna (nome de integração, regra do serviço) a quem não tem login.
    return { success: false, error: taken ? SLOT_TAKEN : "Não foi possível marcar este horário. Escolha outro ou fale com o salão" }
  }

  // Salão que pede sinal: o agendamento nasce com o sinal "aguardando". O cliente
  // paga por PIX direto ao salão, que marca o recebimento no painel. Se o registro
  // do sinal falhar, o horário continua marcado — o salão lança o sinal à mão.
  if (salon.deposit) {
    const deposit = await createAppointmentDepositService({
      salonId: salon.id,
      appointmentId: result.data.appointmentId,
      amountCents: salon.deposit.amountCents,
      source: "online",
    })
    if (!deposit.success) console.error("[online-booking] sinal não registrado:", deposit.error)
  }

  return { success: true, data: { day, time, deposit: salon.deposit } }
}
