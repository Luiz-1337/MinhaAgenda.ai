"use server"

import { db, domainServices as sharedServices, appointments, professionals, salons, profiles, and, eq, sql } from "@repo/db"
import { createClient } from "@/lib/supabase/server"
import { getSessionUserId } from "@/lib/supabase/auth"
import { canReadCrm } from "@/lib/services/permissions.service"
import { startOfDayBrazil } from "@/lib/utils/timezone.utils"
import type { ActionResult } from "@/lib/types/common"

import {
  getAppointmentsByRange,
  getSalonProfessionals,
  type AppointmentDTO,
  type ProfessionalDTO
} from "@/lib/repositories/appointment.repository"
import { ProfessionalService } from "@/lib/services/professional.service"
import { SalonPlanService } from "@/lib/services/services/salon-plan.service"
import { AvailabilityRepository } from "@/lib/services/availability/availability.repository"

/**
 * Resultado da busca de agendamentos.
 *
 * Os tipos públicos (AppointmentDTO, ProfessionalInfo, DailyAppointment) ficam em
 * "@/lib/types/appointments": um arquivo "use server" só pode exportar async
 * functions — re-exportar tipos daqui quebra o build do Turbopack (Next 16).
 */
interface AppointmentsResult {
  professionals: ProfessionalDTO[]
  appointments: AppointmentDTO[]
}

/**
 * Busca agendamentos e profissionais de um salão em um intervalo de datas.
 *
 * **Validações:**
 * - Verifica autenticação do usuário
 * - Verifica se o usuário é dono do salão OU profissional vinculado
 *
 * **Conversão de Timezone:**
 * - As datas são armazenadas em UTC no banco
 * - São convertidas para horário de Brasília antes de retornar no formato esperado pelo frontend
 */
export async function getAppointments(
  salonId: string,
  rangeStart: Date,
  rangeEnd: Date
): Promise<AppointmentsResult | { error: string }> {
  if (!salonId) {
    return { error: "salonId é obrigatório" }
  }

  const userId = await getSessionUserId()

  if (!userId) {
    return { error: "Não autenticado" }
  }

  // Verifica permissão (Dono do salão ou Profissional)
  const salon = await db.query.salons.findFirst({
    where: eq(salons.id, salonId),
    columns: { id: true, ownerId: true },
  })

  if (!salon) {
    return { error: "Salão não encontrado" }
  }

  const isOwner = salon.ownerId === userId
  let isProfessional = false

  if (!isOwner) {
    const pro = await db.query.professionals.findFirst({
      where: and(eq(professionals.salonId, salonId), eq(professionals.userId, userId))
    })
    if (pro) isProfessional = true
  }

  if (!isOwner && !isProfessional) {
    return { error: "Acesso negado a este salão" }
  }

  try {
    // Garante que salões SOLO tenham profissional criado automaticamente
    await ProfessionalService.ensureSoloProfessional(salonId)

    // No plano SOLO o agendamento é do cabeleireiro, não do salão: a agenda dele
    // junta todos os salões em que atende (via personKey). Nos demais planos a
    // agenda continua sendo do salão (escopo por salonId).
    const [isSolo, professionalsList] = await Promise.all([
      SalonPlanService.isSoloPlan(salonId),
      getSalonProfessionals(salonId),
    ])

    // Profissional "home" da pessoa neste salão (no SOLO, o próprio dono).
    const homePro =
      professionalsList.find((p) => p.userId === salon.ownerId) ?? professionalsList[0] ?? null

    let appointmentsList: AppointmentDTO[]
    if (isSolo && homePro) {
      // Resolve todas as linhas (uma por salão) da mesma pessoa pelo personKey
      // e busca os agendamentos por pessoa, em qualquer salão.
      const personProfessionalIds = await sharedServices.getPersonProfessionalIds(homePro.id)
      const personAppointments = await getAppointmentsByRange({
        professionalIds: personProfessionalIds,
        startDate: rangeStart,
        endDate: rangeEnd,
      })
      // A agenda é de coluna única e filtra por professionalId no front. Como as
      // linhas de outros salões têm professionalId diferente, normalizamos para o
      // profissional "home" para que TODOS os atendimentos da pessoa apareçam.
      appointmentsList = personAppointments.map((a) => ({
        ...a,
        professionalId: homePro.id,
        professionalName: homePro.name,
      }))
    } else {
      appointmentsList = await getAppointmentsByRange({
        salonId,
        startDate: rangeStart,
        endDate: rangeEnd,
      })
    }

    // Se for STAFF, filtrar agendamentos? O prompt diz "filtrar e mostrar apenas a coluna dele".
    // Mas a Action retorna TUDO e o Frontend filtra, ou a Action já filtra?
    // Se eu filtrar aqui, é mais seguro.
    // Prompt: "Se o usuário for STAFF, a agenda deve, por padrão, filtrar e mostrar apenas a coluna dele. (Opcional) Bloquear o dropdown..."
    // Se bloquear o dropdown, ele não consegue ver outros. Se eu retornar todos, ele pode "hackear" se eu só esconder no front.
    // Mas talvez STAFF precise ver agenda dos outros para encaixar? Geralmente não.
    // Vou retornar tudo se for Owner/Manager, e filtrar se for Staff.

    // Descobrir role atual
    let role = isOwner ? 'MANAGER' : 'STAFF'
    if (!isOwner) {
      const me = professionalsList.find(p => p.userId === userId)
      // Se o profissional tem role OWNER (banco antigo), tratamos como MANAGER
      if (me?.role === 'OWNER' || me?.role === 'MANAGER') role = 'MANAGER'
      else if (me?.role) role = me.role
    }

    let filteredAppointments = appointmentsList
    let filteredProfessionals = professionalsList

    if (role === 'STAFF') {
      // Staff vê apenas seus agendamentos e seu perfil profissional
      const myProId = professionalsList.find(p => p.userId === userId)?.id
      if (myProId) {
        filteredAppointments = appointmentsList.filter(a => a.professionalId === myProId)
        // Opcional: filtrar profissionais também para o dropdown só mostrar ele
        filteredProfessionals = professionalsList.filter(p => p.id === myProId)
      }
    }

    // Retorna os dados como vêm do banco (UTC).
    // O frontend usa funções de formatação (formatBrazilTime) para exibição correta
    // Não fazemos conversão aqui para evitar problemas de timezone entre ambientes (local vs Vercel)
    return {
      professionals: filteredProfessionals,
      appointments: filteredAppointments
    }
  } catch (error) {
    console.error("Erro na action getAppointments:", error)
    return { error: "Erro ao buscar agendamentos" }
  }
}

/**
 * Cria um novo agendamento no sistema.
 */
export async function createAppointment(input: {
  salonId: string
  professionalId: string
  clientId: string
  serviceId: string
  date: string | Date
  notes?: string
  /** Reserva manual pode furar a regra de dia/horário do serviço (após confirmação). */
  allowServiceRuleOverride?: boolean
}): Promise<ActionResult<{ appointmentId: string }>> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: "Não autenticado" }
  }

  // Verifica se o salão existe
  const salon = await db.query.salons.findFirst({
    where: eq(salons.id, input.salonId),
    columns: { id: true, ownerId: true },
  })
  if (!salon) {
    return { error: "Salão inválido" }
  }

  // Verifica autorização: dono do salão ou profissional ativo
  const isOwner = salon.ownerId === user.id
  let isProfessional = false

  if (!isOwner) {
    const pro = await db.query.professionals.findFirst({
      where: and(
        eq(professionals.salonId, input.salonId),
        eq(professionals.userId, user.id),
        eq(professionals.isActive, true)
      ),
      columns: { id: true },
    })
    isProfessional = !!pro
  }

  if (!isOwner && !isProfessional) {
    return { error: "Acesso negado" }
  }

  // Verifica se é plano SOLO e ajusta professionalId automaticamente
  const ownerProfile = await db.query.profiles.findFirst({
    where: eq(profiles.id, salon.ownerId),
    columns: { tier: true },
  })

  let finalProfessionalId = input.professionalId

  if (ownerProfile?.tier === 'SOLO') {
    // No plano SOLO, sempre usa o profissional do owner
    const userProfessional = await db.query.professionals.findFirst({
      where: and(
        eq(professionals.salonId, input.salonId),
        eq(professionals.userId, salon.ownerId)
      ),
      columns: { id: true },
    })

    if (userProfessional) {
      finalProfessionalId = userProfessional.id
    }
  }

  // Delega para o serviço centralizado (lógica de negócio)
  const result = await sharedServices.createAppointmentService({
    ...input,
    professionalId: finalProfessionalId,
    allowServiceRuleOverride: input.allowServiceRuleOverride,
  })

  if (!result.success) {
    // Propaga o code para a UI poder oferecer "marcar mesmo assim" em violação de regra.
    return result.code ? { error: result.error, code: result.code } : { error: result.error }
  }

  return { success: true, data: result.data }
}

/**
 * Extrai hora (0-23) de string "HH:mm"
 */
function parseHour(timeStr: string): number {
  const [h] = timeStr.split(":").map(Number)
  return Math.max(0, Math.min(23, h ?? 8))
}

/**
 * Retorna o intervalo de horas para exibição do calendário baseado na disponibilidade do salão/profissional.
 * - Solo: usa workHours do salão
 * - Pro: usa availability do profissional selecionado
 * - Padrão: 8-18 se não houver configuração
 */
export async function getSchedulerHours(
  salonId: string,
  professionalId: string | null
): Promise<{ startHour: number; endHour: number } | { error: string }> {
  if (!salonId) {
    return { error: "salonId é obrigatório" }
  }

  const userId = await getSessionUserId()
  if (!userId) {
    return { error: "Não autenticado" }
  }

  const salon = await db.query.salons.findFirst({
    where: eq(salons.id, salonId),
    columns: { id: true, ownerId: true, workHours: true },
  })
  if (!salon) {
    return { error: "Salão não encontrado" }
  }

  const isOwner = salon.ownerId === userId
  const pro = !isOwner
    ? await db.query.professionals.findFirst({
      where: and(eq(professionals.salonId, salonId), eq(professionals.userId, userId)),
      columns: { id: true },
    })
    : null
  if (!isOwner && !pro) {
    return { error: "Acesso negado" }
  }

  const DEFAULT = { startHour: 8, endHour: 22 }

  try {
    const isSolo = await SalonPlanService.isSoloPlan(salonId)

    if (isSolo) {
      const workHours = salon.workHours as Record<string, { start: string; end: string }> | null | undefined
      if (!workHours || typeof workHours !== "object") {
        return DEFAULT
      }
      let minH = 23
      let maxH = 0
      for (const dayKey of Object.keys(workHours)) {
        const day = workHours[dayKey]
        if (day?.start && day?.end) {
          minH = Math.min(minH, parseHour(day.start))
          maxH = Math.max(maxH, parseHour(day.end))
        }
      }
      if (minH <= maxH) {
        return { startHour: minH, endHour: maxH }
      }
      return DEFAULT
    }

    if (!professionalId) {
      return DEFAULT
    }

    const rows = await AvailabilityRepository.findActiveByProfessionalId(professionalId)
    if (rows.length === 0) {
      return DEFAULT
    }
    let minH = 23
    let maxH = 0
    for (const row of rows) {
      minH = Math.min(minH, parseHour(row.startTime))
      maxH = Math.max(maxH, parseHour(row.endTime))
    }
    if (minH <= maxH) {
      return { startHour: minH, endHour: maxH }
    }
    return DEFAULT
  } catch (err) {
    console.error("Erro em getSchedulerHours:", err)
    return DEFAULT
  }
}

/**
 * Autoriza uma ação de DESFECHO sobre um agendamento (cancelar, concluir, falta).
 *
 * Autoriza SEMPRE contra o salão REAL do agendamento, não contra o `salonId` que
 * veio do cliente — é a defesa contra IDOR entre tenants. O `salonId` do contexto
 * só serve para o erro genérico não contar a um estranho que aquele id existe.
 *
 * Regra de papel: dono e gerente agem sobre qualquer agendamento do salão; STAFF
 * só sobre os próprios. É o que faz sentido no balcão — a recepcionista fecha o
 * atendimento que ela mesma prestou.
 *
 * Extraído porque as três actions de desfecho precisam exatamente disto, e
 * duplicar 50 linhas de autorização é como se cria a quarta que esquece um pedaço.
 */
async function authorizeAppointmentOutcome(
  appointmentId: string,
  salonId: string
): Promise<
  | { userId: string; appointment: { id: string; salonId: string; professionalId: string } }
  | { error: string }
> {
  if (!appointmentId || !salonId) {
    return { error: "Parâmetros obrigatórios ausentes" }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: "Não autenticado" }
  }

  // Busca o agendamento pelo ID real (com seu salão e profissional reais).
  const appointment = await db.query.appointments.findFirst({
    where: eq(appointments.id, appointmentId),
    columns: { id: true, salonId: true, professionalId: true },
  })

  if (!appointment) {
    return { error: "Agendamento não encontrado" }
  }

  const salon = await db.query.salons.findFirst({
    where: eq(salons.id, appointment.salonId),
    columns: { id: true, ownerId: true },
  })
  if (!salon) {
    return { error: "Salão do agendamento não encontrado" }
  }

  let allowed = salon.ownerId === user.id // dono = gerente do próprio salão

  if (!allowed) {
    const me = await db.query.professionals.findFirst({
      where: and(
        eq(professionals.salonId, appointment.salonId),
        eq(professionals.userId, user.id)
      ),
      columns: { id: true, role: true },
    })
    if (me) {
      const isManager = me.role === "OWNER" || me.role === "MANAGER"
      allowed = isManager || me.id === appointment.professionalId
    }
  }

  if (!allowed) {
    return { error: "Você não tem permissão para alterar este agendamento" }
  }

  return { userId: user.id, appointment }
}

/**
 * CANCELA um agendamento a partir do painel.
 *
 * Não apaga mais a linha: reusa `cancelAppointmentService`, o mesmo caminho que a
 * IA usa. O evento espelhado sai do Google Calendar (o horário fica livre lá) e a
 * fila de espera é avisada da vaga.
 */
export async function cancelAppointment(
  appointmentId: string,
  salonId: string,
  /** Motivo opcional, digitado pelo dono na confirmação. Vai para o histórico. */
  reason?: string
): Promise<ActionResult<void>> {
  const auth = await authorizeAppointmentOutcome(appointmentId, salonId)
  if ("error" in auth) return { error: auth.error }

  const result = await sharedServices.cancelAppointmentService({
    appointmentId,
    salonId: auth.appointment.salonId,
    reason: reason?.trim() || undefined,
    // Quem cancelou, para o histórico do cliente poder dizer "cancelado pela
    // recepção" em vez de só "cancelado".
    cancelledBy: auth.userId,
    source: 'panel',
  })

  if (!result.success) {
    return { error: result.error }
  }

  return { success: true, data: undefined }
}

/**
 * Marca o atendimento como REALIZADO, com o valor cobrado.
 *
 * O valor é OBRIGATÓRIO e chega como número já interpretado pelo cliente
 * (lib/utils/money.utils → parseBRL). Revalidado aqui: o cliente é sugestão, não
 * autoridade. A rede final é o CHECK do banco
 * (appointments_completed_requires_price).
 *
 * Cortesia se registra com 0 EXPLÍCITO — por isso o `isCourtesy`. Sem essa
 * distinção, digitar 0 seria a rota de fuga do formulário e o KPI de receita
 * nasceria mentindo, sem ninguém perceber.
 */
export async function completeAppointment(
  appointmentId: string,
  salonId: string,
  priceCharged: number,
  isCourtesy = false
): Promise<ActionResult<void>> {
  const auth = await authorizeAppointmentOutcome(appointmentId, salonId)
  if ("error" in auth) return { error: auth.error }

  if (!Number.isFinite(priceCharged) || priceCharged < 0) {
    return { error: "Informe um valor válido para concluir o atendimento" }
  }

  // Zero só passa por cortesia declarada. Um 0 digitado sem marcar cortesia é, na
  // esmagadora maioria dos casos, alguém que não sabia o preço e queria seguir.
  if (priceCharged === 0 && !isCourtesy) {
    return {
      error: 'Para concluir sem cobrança, marque "Cortesia". Caso contrário, informe o valor cobrado.',
    }
  }

  const result = await sharedServices.completeAppointmentService({
    appointmentId,
    salonId: auth.appointment.salonId,
    priceCharged,
    source: 'panel',
  })

  if (!result.success) {
    return { error: result.error }
  }

  return { success: true, data: undefined }
}

/**
 * Quantos atendimentos passados estão sem desfecho — o número do selo na agenda.
 *
 * É a metade SEMPRE LIGADA do fechamento: o cron é opt-in por salão e só fecha
 * preço confiável, então sempre sobra o que uma pessoa precisa resolver. Sem este
 * contador, "aguardando fechamento" seria um estado invisível e a receita ficaria
 * incompleta sem ninguém saber.
 *
 * A janela aqui é 90 dias, DELIBERADAMENTE mais larga que a do cron (7 dias). As
 * duas existem por motivos diferentes:
 *
 * - No cron, 7 dias é uma TRAVA: fechar automaticamente o histórico inteiro daria a
 *   toda a base um `last_visit_at` antigo de uma vez e a primeira rodada de
 *   reengajamento sairia em massa.
 * - Aqui é uma pessoa clicando, uma a uma, por decisão própria. Esconder o atraso
 *   não protege ninguém — só faz a receita ficar incompleta em silêncio. Medido em
 *   produção: com janela de 7 dias este selo mostraria ZERO, com 48 atendimentos
 *   passados sem desfecho no banco. A feature nasceria parecendo quebrada e sem
 *   caminho para limpar o atraso.
 *
 * 90 dias e não "tudo" porque dois anos de pendência viram desânimo, não tarefa.
 *
 * Exclui placeholders internos, como o cron.
 */
export async function getPendingOutcomeCount(
  salonId: string
): Promise<ActionResult<{ count: number; oldestAt: Date | null }>> {
  if (!salonId) {
    return { error: "salonId é obrigatório" }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: "Não autenticado" }
  }

  // Leitura de operação da agenda: STAFF também vê (é quem fecha no balcão).
  if (!(await canReadCrm(salonId, user.id))) {
    return { error: "Acesso negado a este salão" }
  }

  const cutoff = startOfDayBrazil(new Date())
  const floor = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)

  // `oldestAt` alimenta o clique do selo: leva o dono direto ao dia mais antigo que
  // está esperando, em vez de deixá-lo caçar na agenda qual dia tem pendência.
  const rows = await db.execute(sql`
    select count(*)::int as n, min(a.date) as oldest
      from appointments a
      join services sv on sv.id = a.service_id
      join customers c on c.id = a.client_id
     where a.salon_id = ${salonId}
       and a.status in ('pending', 'confirmed')
       and a.end_time < ${cutoff}
       and a.end_time > ${floor}
       and sv.is_system = false
       and c.is_system = false
  `)

  const oldest = rows[0]?.oldest
  return {
    success: true,
    data: {
      count: Number(rows[0]?.n ?? 0),
      oldestAt: oldest ? new Date(String(oldest)) : null,
    },
  }
}

/**
 * Registra que o cliente NÃO COMPARECEU.
 *
 * Sem valor: não houve atendimento. Alimenta a taxa de falta e o preditor de
 * no-show, que até aqui era falso-negativo por construção.
 */
export async function markAppointmentNoShow(
  appointmentId: string,
  salonId: string
): Promise<ActionResult<void>> {
  const auth = await authorizeAppointmentOutcome(appointmentId, salonId)
  if ("error" in auth) return { error: auth.error }

  const result = await sharedServices.markNoShowService({
    appointmentId,
    salonId: auth.appointment.salonId,
    source: 'panel',
  })

  if (!result.success) {
    return { error: result.error }
  }

  return { success: true, data: undefined }
}
