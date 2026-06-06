import { and, eq, gt, inArray, lt, ne, sql } from "drizzle-orm"
import { z } from "zod"

import { db, appointments, availability, professionals, professionalServices, services, customers } from "../index"
import { formatZodError } from "../utils/validation.utils"
import { parseBrazilianDateTime, createBrazilDateTimeFromComponents, type DateComponents } from "../utils/date-parsing.utils"
import { getPersonProfessionalIdsByKey } from "./person"
import { needsConflictCheck, isPastBooking } from "./appointment-rules"
import { fireAndForgetCreate, fireAndForgetUpdate, fireAndForgetDelete } from "./integration-sync"
import { processVacantSlot } from "./slot-filler.service"
import { getGoogleFreeBusyForProfessional } from "./google-calendar"
import { GOOGLE_BLOCKED_TIME_SERVICE_NAME, GOOGLE_CALENDAR_PLACEHOLDER_PHONE } from "../domain/constants"

/**
 * Tipo de resultado padronizado para operações de serviço.
 * Usado para garantir consistência nas respostas de sucesso/erro.
 */
export type ActionResult<T = void> =
  | { success: true; data: T }
  | { success: false; error: string; code?: string }

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
  skipExternalSync?: boolean
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
      columns: { id: true, salonId: true, isActive: true, personKey: true },
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

  // Bloqueia criação de agendamento no passado (bug C3).
  if (isPastBooking(startUtc)) {
    return { success: false, error: "Não é possível agendar em um horário que já passou" }
  }

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

  // Trava de conflito com o Google Calendar (FreeBusy ao vivo).
  // Fecha o gap em que um evento criado direto no Google ainda não foi
  // sincronizado como linha local. Fail-open: só bloqueia se o Google
  // responder explicitamente que o horário está ocupado; ausência de
  // integração ([]) ou instabilidade do Google (exceção) NÃO trava o cliente.
  // Pulado quando o próprio agendamento vem de um sync do Google.
  if (!input.skipExternalSync) {
    try {
      const googleBusy = await getGoogleFreeBusyForProfessional(salonId, professionalId, startUtc, endUtc)
      const overlapsGoogle = googleBusy.some(
        (b) => b.start.getTime() < endUtc.getTime() && b.end.getTime() > startUtc.getTime()
      )
      if (overlapsGoogle) {
        return { success: false, error: "Horário indisponível (conflito com Google Calendar)" }
      }
    } catch (error) {
      console.warn(
        "[createAppointmentService] FreeBusy do Google indisponível — seguindo sem checagem (fail-open):",
        error
      )
    }
  }

  // Chave de lock por PESSOA (cross-salão). A LISTA de profissionais da pessoa é
  // resolvida DENTRO da transação, após o lock (ver abaixo), para fechar a janela
  // TOCTOU em que um profissional recém-criado com o mesmo person_key escaparia
  // da checagem de conflito (bug A1).
  const personLockKey = professional.personKey ?? professionalId

  // TRANSAÇÃO: Advisory lock + verificação de conflito + inserção atômica
  // O advisory lock garante que apenas uma transação por vez pode criar/modificar
  // agendamentos para a mesma PESSOA, prevenindo race conditions entre salões
  try {
    const result = await db.transaction(async (tx) => {
      // Advisory lock na pessoa — previne criações concorrentes (em qualquer salão)
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${personLockKey}))`)

      // Resolve as linhas de profissional da mesma pessoa JÁ sob o lock (bug A1).
      const personProfessionalIds = await getPersonProfessionalIdsByKey(
        professional.personKey,
        professionalId
      )

      // Verifica conflitos com agendamentos existentes da pessoa (dentro da transação)
      const overlappingAppointment = await tx.query.appointments.findFirst({
        where: and(
          inArray(appointments.professionalId, personProfessionalIds),
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
        syncSource: input.skipExternalSync ? 'google' : 'app',
        notes: parse.data.notes
      }).returning({ id: appointments.id })

      return { appointmentId: newAppointment.id }
    })

    // Fire-and-forget: Sync to external calendars (Google Calendar, Trinks)
    fireAndForgetCreate(result.appointmentId, salonId, input.skipExternalSync)

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
  salonId?: string
  professionalId?: string
  serviceId?: string
  date?: string | Date
  notes?: string
  skipExternalSync?: boolean
}): Promise<ActionResult<{ appointmentId: string }>> {
  const schema = z.object({
    appointmentId: z.string().uuid(),
    salonId: z.string().uuid().optional(),
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

  // Busca agendamento existente — quando salonId é fornecido, restringe ao salão
  // do contexto (isolamento multi-tenant, bug C1: defesa em profundidade).
  const existingAppointment = await db.query.appointments.findFirst({
    where: parse.data.salonId
      ? and(eq(appointments.id, parse.data.appointmentId), eq(appointments.salonId, parse.data.salonId))
      : eq(appointments.id, parse.data.appointmentId),
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
    return { success: false, error: "Agendamento não encontrado", code: "APPOINTMENT_NOT_FOUND" }
  }

  if (existingAppointment.status === "cancelled") {
    return { success: false, error: "Não é possível atualizar um agendamento cancelado", code: "APPOINTMENT_CANCELLED" }
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
    columns: { id: true, salonId: true, isActive: true, personKey: true },
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
      return { success: false, error: "Profissional não executa este serviço", code: "PROFESSIONAL_CANNOT_PERFORM_SERVICE" }
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

    // Bloqueia reagendamento para o passado (bug C3).
    if (isPastBooking(startUtc)) {
      return { success: false, error: "Não é possível reagendar para um horário que já passou", code: "PAST_APPOINTMENT" }
    }
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
      return { success: false, error: "Profissional não possui horários cadastrados neste dia", code: "PROFESSIONAL_NOT_AVAILABLE" }
    }

    const withinWork = workSpans.some((span) => {
      const startSpanUtc = createBrazilDateTimeFromComponents(brazilComponents!, String(span.startTime))
      const endSpanUtc = createBrazilDateTimeFromComponents(brazilComponents!, String(span.endTime))

      if (!startSpanUtc || !endSpanUtc) return false

      return startUtc.getTime() >= startSpanUtc.getTime() && endUtc.getTime() <= endSpanUtc.getTime()
    })

    if (!withinWork) {
      return { success: false, error: "Horário fora do expediente do profissional", code: "PROFESSIONAL_NOT_AVAILABLE" }
    }
  }

  // Chave de lock por PESSOA (cross-salão). A LISTA de profissionais da pessoa é
  // resolvida DENTRO da transação, após o lock, para fechar a janela TOCTOU (bug A1).
  const personLockKey = professional.personKey ?? finalProfessionalId

  // TRANSAÇÃO: Advisory lock + verificação de conflito + atualização atômica
  try {
    await db.transaction(async (tx) => {
      // Verifica conflitos se a data, o profissional OU o serviço mudou.
      // Incluir a mudança de serviço é essencial: a nova duração altera o
      // horário de término e pode invadir o próximo agendamento (bug C2).
      const needsCheck = needsConflictCheck({
        dateChanged: parse.data.date !== undefined,
        professionalChanged: finalProfessionalId !== existingAppointment.professionalId,
        serviceChanged: finalServiceId !== existingAppointment.serviceId,
      })

      if (needsCheck) {
        // Advisory lock na pessoa — previne modificações concorrentes (em qualquer salão)
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${personLockKey}))`)

        // Resolve as linhas da mesma pessoa JÁ sob o lock (TOCTOU, bug A1).
        const personProfessionalIds = await getPersonProfessionalIdsByKey(
          professional.personKey,
          finalProfessionalId
        )

        const overlappingAppointment = await tx.query.appointments.findFirst({
          where: and(
            inArray(appointments.professionalId, personProfessionalIds),
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
          syncSource: input.skipExternalSync ? 'google' : 'app',
          updatedAt: new Date(),
        })
        .where(
          parse.data.salonId
            ? and(eq(appointments.id, parse.data.appointmentId), eq(appointments.salonId, parse.data.salonId))
            : eq(appointments.id, parse.data.appointmentId)
        )
    })

    // Fire-and-forget: Sync updates to external calendars
    fireAndForgetUpdate(parse.data.appointmentId, existingAppointment.salonId, input.skipExternalSync)

    return { success: true, data: { appointmentId: parse.data.appointmentId } }
  } catch (error) {
    if (error instanceof Error && error.message === "Horário indisponível (conflito de agenda)") {
      return { success: false, error: error.message, code: "APPOINTMENT_CONFLICT" }
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
  salonId?: string
  skipExternalSync?: boolean
}): Promise<ActionResult<void>> {
  const schema = z.object({
    appointmentId: z.string().uuid(),
    salonId: z.string().uuid().optional(),
  })

  const parse = schema.safeParse(input)
  if (!parse.success) {
    return { success: false, error: formatZodError(parse.error) }
  }

  // Verifica se o agendamento existe — quando salonId é fornecido, restringe ao
  // salão do contexto (isolamento multi-tenant, bug C1: defesa em profundidade).
  const existingAppointment = await db.query.appointments.findFirst({
    where: parse.data.salonId
      ? and(eq(appointments.id, parse.data.appointmentId), eq(appointments.salonId, parse.data.salonId))
      : eq(appointments.id, parse.data.appointmentId),
    columns: { id: true, salonId: true, professionalId: true, serviceId: true, date: true },
  })

  if (!existingAppointment) {
    return { success: false, error: "Agendamento não encontrado", code: "APPOINTMENT_NOT_FOUND" }
  }

  // Fire-and-forget: Sync deletion to external calendars BEFORE deleting from DB
  fireAndForgetDelete(parse.data.appointmentId, existingAppointment.salonId, input.skipExternalSync)

  // Deleta o agendamento (escopado ao salão quando fornecido)
  await db.delete(appointments).where(
    parse.data.salonId
      ? and(eq(appointments.id, parse.data.appointmentId), eq(appointments.salonId, parse.data.salonId))
      : eq(appointments.id, parse.data.appointmentId)
  )

  // Tenta preencher a vaga (não trava o processo)
  processVacantSlot({
    salonId: existingAppointment.salonId,
    professionalId: existingAppointment.professionalId,
    serviceId: existingAppointment.serviceId,
    dateUtc: existingAppointment.date
  }).catch(console.error)

  return { success: true, data: undefined }
}

/**
 * Cria um "bloqueio de horário" a partir de um evento do Google Calendar.
 *
 * Diferente do createAppointmentService, este NÃO valida disponibilidade
 * nem executa sync de volta para o Google Calendar (evita loop).
 * Cria automaticamente servico/cliente placeholder se necessário.
 */
export async function createBlockedTimeService(input: {
  salonId: string
  professionalId: string
  startTime: Date
  endTime: Date
  googleEventId: string
  summary?: string | null
}): Promise<ActionResult<{ appointmentId: string }>> {
  const { salonId, professionalId, startTime, endTime, googleEventId, summary } = input

  // Buscar ou criar serviço placeholder "Bloqueio de Horário"
  let blockedService = await db.query.services.findFirst({
    where: and(
      eq(services.salonId, salonId),
      eq(services.name, GOOGLE_BLOCKED_TIME_SERVICE_NAME)
    ),
    columns: { id: true },
  })

  if (!blockedService) {
    const durationMinutes = Math.max(1, Math.round((endTime.getTime() - startTime.getTime()) / (60 * 1000)))
    const [created] = await db.insert(services).values({
      salonId,
      name: GOOGLE_BLOCKED_TIME_SERVICE_NAME,
      duration: durationMinutes,
      price: '0',
      isActive: true,
    }).returning({ id: services.id })
    blockedService = created
  }

  // Buscar ou criar cliente placeholder "Google Calendar"
  let placeholderCustomer = await db.query.customers.findFirst({
    where: and(
      eq(customers.salonId, salonId),
      eq(customers.phone, GOOGLE_CALENDAR_PLACEHOLDER_PHONE)
    ),
    columns: { id: true },
  })

  if (!placeholderCustomer) {
    const [created] = await db.insert(customers).values({
      salonId,
      name: 'Google Calendar',
      phone: GOOGLE_CALENDAR_PLACEHOLDER_PHONE,
    }).returning({ id: customers.id })
    placeholderCustomer = created
  }

  // Verificar se já existe appointment com este googleEventId
  const existing = await db.query.appointments.findFirst({
    where: eq(appointments.googleEventId, googleEventId),
    columns: { id: true },
  })

  if (existing) {
    return { success: true, data: { appointmentId: existing.id } }
  }

  // Criar o bloqueio (sem validação de disponibilidade, sem sync externo)
  const [newAppointment] = await db.insert(appointments).values({
    salonId,
    professionalId,
    clientId: placeholderCustomer.id,
    serviceId: blockedService.id,
    date: startTime,
    endTime,
    status: 'confirmed',
    syncSource: 'google',
    syncStatus: 'synced',
    googleEventId,
    notes: summary ? `Evento do Google Calendar: ${summary}` : 'Evento do Google Calendar',
  }).returning({ id: appointments.id })

  return { success: true, data: { appointmentId: newAppointment.id } }
}
