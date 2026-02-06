import { and, eq, gt, lt, ne } from "drizzle-orm"
import { z } from "zod"

import { db, appointments, availability, professionals, professionalServices, services } from "../index"
import { formatZodError } from "../utils/validation.utils"
import { parseBrazilianDateTime, createBrazilDateTimeFromComponents, type DateComponents } from "../utils/date-parsing.utils"
import { fireAndForgetCreate, fireAndForgetUpdate, fireAndForgetDelete } from "./integration-sync"

/**
 * Tipo de resultado padronizado para operações de serviço.
 * Usado para garantir consistência nas respostas de sucesso/erro.
 */
export type ActionResult<T = void> =
  | { success: true; data: T }
  | { success: false; error: string }

/**
 * Cria um novo agendamento no sistema.
 *
 * **Regras de Negócio:**
 * - Valida que o serviço existe, está ativo e pertence ao salão
 * - Valida que o profissional existe, está ativo e pertence ao salão
 * - Verifica se o profissional executa o serviço solicitado
 * - Verifica se o horário solicitado está dentro do expediente do profissional (considerando timezone do Brasil)
 * - Verifica conflitos com agendamentos existentes (exceto cancelados) usando transação
 * - Converte a data/hora do horário de Brasília para UTC antes de salvar
 *
 * @param input - Dados do agendamento a ser criado
 * @param input.salonId - ID do salão (UUID)
 * @param input.professionalId - ID do profissional (UUID)
 * @param input.clientId - ID do cliente (UUID)
 * @param input.serviceId - ID do serviço (UUID)
 * @param input.date - Data/hora do agendamento (string ISO ou Date) - interpretada como horário de Brasília
 * @param input.notes - Notas opcionais do agendamento (máx. 1000 caracteres)
 *
 * @returns Resultado da operação com o ID do agendamento criado em caso de sucesso
 *
 * @throws Não lança exceções, retorna erro via ActionResult
 */
export async function createAppointmentService(input: {
  salonId: string
  professionalId: string
  clientId: string
  serviceId: string
  date: string | Date
  notes?: string
}): Promise<ActionResult<{ appointmentId: string }>> {
  const schema = z.object({
    salonId: z.string().uuid(),
    professionalId: z.string().uuid(),
    clientId: z.string().uuid(),
    serviceId: z.string().uuid(),
    date: z.union([
      z.string().refine((v) => !Number.isNaN(new Date(v).getTime()), "Data inválida"),
      z.date(),
    ]),
    notes: z.string().max(1000).optional(),
  })

  const parse = schema.safeParse(input)
  if (!parse.success) {
    return { success: false, error: formatZodError(parse.error) }
  }
  const { salonId, professionalId, clientId, serviceId } = parse.data

  // Valida serviço e profissional em paralelo
  const [service, professional] = await Promise.all([
    db.query.services.findFirst({
      where: eq(services.id, serviceId),
      columns: { id: true, salonId: true, duration: true, isActive: true },
    }),
    db.query.professionals.findFirst({
      where: eq(professionals.id, professionalId),
      columns: { id: true, salonId: true, isActive: true },
    }),
  ])

  if (!service || service.salonId !== salonId || !service.isActive) {
    return { success: false, error: "Serviço inválido ou inativo" }
  }
  if (!professional || professional.salonId !== salonId || !professional.isActive) {
    return { success: false, error: "Profissional inválido ou inativo" }
  }

  const proService = await db.query.professionalServices.findFirst({
    where: and(eq(professionalServices.professionalId, professionalId), eq(professionalServices.serviceId, serviceId)),
    columns: { id: true },
  })
  if (!proService) {
    return { success: false, error: "Profissional não executa este serviço" }
  }

  // Parse da data usando o módulo centralizado
  const parseResult = parseBrazilianDateTime(parse.data.date)
  if (!parseResult.success) {
    return { success: false, error: parseResult.error }
  }
  const { utcDate: startUtc, brazilComponents } = parseResult

  // Calcula horário de término
  const endUtc = new Date(startUtc.getTime() + service.duration * 60 * 1000)

  // Cria um Date com os componentes para validações (getDay, etc)
  const requestedStartBrazil = new Date(
    brazilComponents.year,
    brazilComponents.month,
    brazilComponents.day,
    brazilComponents.hour,
    brazilComponents.minute,
    brazilComponents.second
  )
  const dayOfWeek = requestedStartBrazil.getDay()

  // Valida se o horário está dentro do expediente do profissional
  const proDayRules = await db
    .select({ startTime: availability.startTime, endTime: availability.endTime, isBreak: availability.isBreak })
    .from(availability)
    .where(and(eq(availability.professionalId, professionalId), eq(availability.dayOfWeek, dayOfWeek)))

  const workSpans = proDayRules.filter((r) => !r.isBreak)

  if (workSpans.length === 0) {
    return { success: false, error: "Profissional não possui horários cadastrados neste dia" }
  }

  const withinWork = workSpans.some((span) => {
    const startSpanUtc = createBrazilDateTimeFromComponents(brazilComponents, String(span.startTime))
    const endSpanUtc = createBrazilDateTimeFromComponents(brazilComponents, String(span.endTime))

    if (!startSpanUtc || !endSpanUtc) return false

    return startUtc.getTime() >= startSpanUtc.getTime() && endUtc.getTime() <= endSpanUtc.getTime()
  })

  if (!withinWork) {
    return { success: false, error: "Horário fora do expediente do profissional" }
  }

  // TRANSAÇÃO: Verificação de conflito + inserção atômica
  // Isso previne race conditions onde dois agendamentos poderiam ser criados no mesmo horário
  try {
    const result = await db.transaction(async (tx) => {
      // Verifica conflitos com agendamentos existentes (dentro da transação)
      const overlappingAppointment = await tx.query.appointments.findFirst({
        where: and(
          eq(appointments.professionalId, professionalId),
          ne(appointments.status, 'cancelled'),
          lt(appointments.date, endUtc),
          gt(appointments.endTime, startUtc)
        ),
      })

      if (overlappingAppointment) {
        throw new Error("Horário indisponível (conflito de agenda)")
      }

      // Insere o agendamento
      const [newAppointment] = await tx.insert(appointments).values({
        salonId,
        clientId,
        professionalId,
        serviceId: service.id,
        date: startUtc,
        endTime: endUtc,
        status: 'pending',
        notes: parse.data.notes
      }).returning({ id: appointments.id })

      return { appointmentId: newAppointment.id }
    })

    // Fire-and-forget: Sync to external calendars (Google Calendar, Trinks)
    fireAndForgetCreate(result.appointmentId, salonId)

    return { success: true, data: result }
  } catch (error) {
    // Se o erro veio da verificação de conflito, retorna mensagem amigável
    if (error instanceof Error && error.message === "Horário indisponível (conflito de agenda)") {
      return { success: false, error: error.message }
    }
    // Outros erros (ex: banco indisponível)
    throw error
  }
}

/**
 * Atualiza um agendamento existente no sistema.
 *
 * **Regras de Negócio:**
 * - Valida que o agendamento existe e não está cancelado
 * - Se professionalId for fornecido: valida que o profissional existe, está ativo e pertence ao salão
 * - Se serviceId for fornecido: valida que o serviço existe, está ativo e pertence ao salão
 * - Se serviceId mudar: verifica se o novo profissional executa o serviço
 * - Se date for fornecido: verifica se o horário está dentro do expediente do profissional
 * - Se date for fornecido: verifica conflitos com agendamentos existentes usando transação
 * - Converte a data/hora do horário de Brasília para UTC antes de salvar
 *
 * @param input - Dados do agendamento a ser atualizado
 * @param input.appointmentId - ID do agendamento (UUID)
 * @param input.professionalId - ID do profissional (UUID, opcional)
 * @param input.serviceId - ID do serviço (UUID, opcional)
 * @param input.date - Data/hora do agendamento (string ISO ou Date, opcional) - interpretada como horário de Brasília
 * @param input.notes - Notas opcionais do agendamento (máx. 1000 caracteres, opcional)
 *
 * @returns Resultado da operação com o ID do agendamento atualizado em caso de sucesso
 *
 * @throws Não lança exceções, retorna erro via ActionResult
 */
export async function updateAppointmentService(input: {
  appointmentId: string
  professionalId?: string
  serviceId?: string
  date?: string | Date
  notes?: string
}): Promise<ActionResult<{ appointmentId: string }>> {
  const schema = z.object({
    appointmentId: z.string().uuid(),
    professionalId: z.string().uuid().optional(),
    serviceId: z.string().uuid().optional(),
    date: z.union([
      z.string().refine((v) => !Number.isNaN(new Date(v).getTime()), "Data inválida"),
      z.date(),
    ]).optional(),
    notes: z.string().max(1000).optional(),
  })

  const parse = schema.safeParse(input)
  if (!parse.success) {
    return { success: false, error: formatZodError(parse.error) }
  }

  // Busca agendamento existente
  const existingAppointment = await db.query.appointments.findFirst({
    where: eq(appointments.id, parse.data.appointmentId),
    columns: {
      id: true,
      salonId: true,
      professionalId: true,
      serviceId: true,
      date: true,
      endTime: true,
      status: true,
      notes: true,
    },
  })

  if (!existingAppointment) {
    return { success: false, error: "Agendamento não encontrado" }
  }

  if (existingAppointment.status === "cancelled") {
    return { success: false, error: "Não é possível atualizar um agendamento cancelado" }
  }

  // Determina os valores finais (usa novos se fornecidos, senão mantém os existentes)
  const finalProfessionalId = parse.data.professionalId || existingAppointment.professionalId
  const finalServiceId = parse.data.serviceId || existingAppointment.serviceId
  const finalNotes = parse.data.notes !== undefined ? parse.data.notes : existingAppointment.notes

  // Busca serviço para obter duração
  const service = await db.query.services.findFirst({
    where: eq(services.id, finalServiceId),
    columns: { id: true, salonId: true, duration: true, isActive: true },
  })

  if (!service || service.salonId !== existingAppointment.salonId || !service.isActive) {
    return { success: false, error: "Serviço inválido ou inativo" }
  }

  // Valida o profissional
  const professional = await db.query.professionals.findFirst({
    where: eq(professionals.id, finalProfessionalId),
    columns: { id: true, salonId: true, isActive: true },
  })

  if (!professional || professional.salonId !== existingAppointment.salonId || !professional.isActive) {
    return { success: false, error: "Profissional inválido ou inativo" }
  }

  // Verifica se o profissional executa o serviço (se mudou serviço ou profissional)
  if (finalServiceId !== existingAppointment.serviceId || finalProfessionalId !== existingAppointment.professionalId) {
    const proService = await db.query.professionalServices.findFirst({
      where: and(eq(professionalServices.professionalId, finalProfessionalId), eq(professionalServices.serviceId, finalServiceId)),
      columns: { id: true },
    })
    if (!proService) {
      return { success: false, error: "Profissional não executa este serviço" }
    }
  }

  // Determina datas de início e fim
  let startUtc: Date = existingAppointment.date
  let endUtc: Date = existingAppointment.endTime
  let brazilComponents: DateComponents | null = null

  if (parse.data.date !== undefined) {
    // Parse da nova data usando o módulo centralizado
    const parseResult = parseBrazilianDateTime(parse.data.date)
    if (!parseResult.success) {
      return { success: false, error: parseResult.error }
    }
    startUtc = parseResult.utcDate
    brazilComponents = parseResult.brazilComponents
    endUtc = new Date(startUtc.getTime() + service.duration * 60 * 1000)
  } else if (finalServiceId !== existingAppointment.serviceId) {
    // Se date não mudou mas serviceId mudou, recalcula endTime
    endUtc = new Date(startUtc.getTime() + service.duration * 60 * 1000)
  }

  // Se date foi fornecido, valida horário dentro do expediente
  if (parse.data.date !== undefined && brazilComponents) {
    const requestedStartBrazil = new Date(
      brazilComponents.year,
      brazilComponents.month,
      brazilComponents.day,
      brazilComponents.hour,
      brazilComponents.minute,
      brazilComponents.second
    )
    const dayOfWeek = requestedStartBrazil.getDay()

    const proDayRules = await db
      .select({ startTime: availability.startTime, endTime: availability.endTime, isBreak: availability.isBreak })
      .from(availability)
      .where(and(eq(availability.professionalId, finalProfessionalId), eq(availability.dayOfWeek, dayOfWeek)))

    const workSpans = proDayRules.filter((r) => !r.isBreak)

    if (workSpans.length === 0) {
      return { success: false, error: "Profissional não possui horários cadastrados neste dia" }
    }

    const withinWork = workSpans.some((span) => {
      const startSpanUtc = createBrazilDateTimeFromComponents(brazilComponents!, String(span.startTime))
      const endSpanUtc = createBrazilDateTimeFromComponents(brazilComponents!, String(span.endTime))

      if (!startSpanUtc || !endSpanUtc) return false

      return startUtc.getTime() >= startSpanUtc.getTime() && endUtc.getTime() <= endSpanUtc.getTime()
    })

    if (!withinWork) {
      return { success: false, error: "Horário fora do expediente do profissional" }
    }
  }

  // TRANSAÇÃO: Verificação de conflito + atualização atômica
  try {
    await db.transaction(async (tx) => {
      // Verifica conflitos se data ou profissional mudou
      const needsConflictCheck = parse.data.date !== undefined ||
        finalProfessionalId !== existingAppointment.professionalId

      if (needsConflictCheck) {
        const overlappingAppointment = await tx.query.appointments.findFirst({
          where: and(
            eq(appointments.professionalId, finalProfessionalId),
            ne(appointments.id, parse.data.appointmentId),
            ne(appointments.status, 'cancelled'),
            lt(appointments.date, endUtc),
            gt(appointments.endTime, startUtc)
          ),
        })

        if (overlappingAppointment) {
          throw new Error("Horário indisponível (conflito de agenda)")
        }
      }

      // Atualiza o agendamento
      await tx
        .update(appointments)
        .set({
          professionalId: finalProfessionalId,
          serviceId: finalServiceId,
          date: startUtc,
          endTime: endUtc,
          notes: finalNotes,
          updatedAt: new Date(),
        })
        .where(eq(appointments.id, parse.data.appointmentId))
    })

    // Fire-and-forget: Sync updates to external calendars
    fireAndForgetUpdate(parse.data.appointmentId, existingAppointment.salonId)

    return { success: true, data: { appointmentId: parse.data.appointmentId } }
  } catch (error) {
    if (error instanceof Error && error.message === "Horário indisponível (conflito de agenda)") {
      return { success: false, error: error.message }
    }
    throw error
  }
}

/**
 * Deleta um agendamento do sistema.
 *
 * **Regras de Negócio:**
 * - Valida que o agendamento existe
 * - Deleta completamente do banco de dados (não apenas cancela)
 *
 * @param input - Dados do agendamento a ser deletado
 * @param input.appointmentId - ID do agendamento (UUID)
 *
 * @returns Resultado da operação em caso de sucesso
 *
 * @throws Não lança exceções, retorna erro via ActionResult
 */
export async function deleteAppointmentService(input: {
  appointmentId: string
}): Promise<ActionResult<void>> {
  const schema = z.object({
    appointmentId: z.string().uuid(),
  })

  const parse = schema.safeParse(input)
  if (!parse.success) {
    return { success: false, error: formatZodError(parse.error) }
  }

  // Verifica se o agendamento existe
  const existingAppointment = await db.query.appointments.findFirst({
    where: eq(appointments.id, parse.data.appointmentId),
    columns: { id: true, salonId: true },
  })

  if (!existingAppointment) {
    return { success: false, error: "Agendamento não encontrado" }
  }

  // Fire-and-forget: Sync deletion to external calendars BEFORE deleting from DB
  fireAndForgetDelete(parse.data.appointmentId, existingAppointment.salonId)

  // Deleta o agendamento
  await db.delete(appointments).where(eq(appointments.id, parse.data.appointmentId))

  return { success: true, data: undefined }
}
