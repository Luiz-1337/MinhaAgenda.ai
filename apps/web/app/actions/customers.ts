"use server"

import { createClient } from "@/lib/supabase/server"
import { db, customers, customerNotes, customerTagAssignments, chats, profiles, eq, desc, and, inArray, sql } from "@repo/db"
import { evaluateNoShowRisk } from "@repo/db/src/services/no-show-predictor.service"
import { ActionResult } from "@/lib/types/common"
import { CUSTOMERS_PAGE_SIZE } from "@/lib/types/customer"
import type { CustomerDetail, CustomerAppointmentRow, CustomerNoteRow } from "@/lib/types/customer"

import { hasSalonPermission, canReadCrm } from "@/lib/services/permissions.service"

export type CustomerRow = {
  id: string
  salonId: string
  name: string
  email: string | null
  phone: string | null
  preferences: Record<string, unknown> | null
  tags: { id: string; name: string; color: string }[]
  createdAt: string
  updatedAt: string
}

// Achata as atribuições de tags (com a tag aninhada) em {id,name,color}[],
// ordenadas pela position do catálogo.
type TagAssignmentWithTag = {
  tag: { id: string; name: string; color: string; position: number }
}
function mapCustomerTags(
  assignments: TagAssignmentWithTag[]
): { id: string; name: string; color: string }[] {
  return [...assignments]
    .sort((a, b) => a.tag.position - b.tag.position)
    .map((a) => ({ id: a.tag.id, name: a.tag.name, color: a.tag.color }))
}

/**
 * Filtros da listagem, resolvidos no SERVIDOR.
 *
 * Antes busca, filtro por tag e paginação eram todos client-side sobre a base
 * INTEIRA: `findMany` sem limit, com join de tags por contato, e o array completo
 * viajava no HTML do RSC e no cache do react-query para renderizar 20 linhas.
 */
export type SalonCustomersQuery = {
  /** Busca por nome, e-mail ou telefone (dígitos). */
  q?: string
  /** Contato precisa ter TODAS estas tags. */
  tagIds?: string[]
  page?: number
  pageSize?: number
}

export type SalonCustomersPage = {
  rows: CustomerRow[]
  total: number
  page: number
  pageSize: number
}

/**
 * Uma página de contatos do salão.
 *
 * As tags vêm em SEGUNDA query, só para os ids da página — mais barato que o join
 * sobre a partição inteira do salão, que era o que a versão anterior fazia.
 *
 * O `ORDER BY updated_at DESC` é coberto pelo índice parcial
 * `customers_salon_updated_idx` (migration 030); sem ele, ordenar com LIMIT faria o
 * Postgres ordenar todos os contatos do salão para devolver 20.
 */
export async function getSalonCustomers(
  salonId: string,
  query: SalonCustomersQuery = {}
): Promise<ActionResult<SalonCustomersPage>> {
  try {
    if (!salonId) {
      return { error: "salonId é obrigatório" }
    }

    // 1. Auth Check
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return { error: "Não autenticado" }
    }

    // 2. Permission Check
    // LEITURA: inclui STAFF ativo. Quem atende no balcão precisa saber quem é o
    // cliente — até aqui esta tela vinha vazia justamente para essa pessoa.
    // Criar/editar/excluir abaixo seguem em hasSalonPermission (Owner/Manager).
    const hasAccess = await canReadCrm(salonId, user.id)

    if (!hasAccess) {
      return { error: "Acesso negado a este salão" }
    }

    const pageSize = Math.min(Math.max(query.pageSize ?? CUSTOMERS_PAGE_SIZE, 1), 100)
    const page = Math.max(query.page ?? 1, 1)
    const offset = (page - 1) * pageSize

    const conditions = [
      sql`c.salon_id = ${salonId}`,
      // Exclui placeholders internos (ex.: contato "Google Calendar" da sync).
      sql`c.is_system = false`,
    ]

    const term = query.q?.trim()
    if (term) {
      const like = `%${term}%`
      // Telefone casa por dígitos: o usuário digita "(11) 98765" e a coluna guarda
      // só dígitos, então comparar o texto cru nunca acharia.
      const digits = term.replace(/\D/g, "")
      const phoneMatch = digits
        ? sql`or regexp_replace(c.phone, '[^0-9]', '', 'g') like ${`%${digits}%`}`
        : sql``
      conditions.push(sql`(
        c.name ilike ${like}
        or c.email ilike ${like}
        ${phoneMatch}
      )`)
    }

    const tagIds = (query.tagIds ?? []).filter((id) => typeof id === "string" && id.length > 0)
    if (tagIds.length > 0) {
      // TODAS as tags, não qualquer uma: filtrar por "VIP" + "Coloração" tem que
      // devolver quem é os dois.
      conditions.push(sql`(
        select count(distinct a.tag_id)
          from customer_tag_assignments a
         where a.customer_id = c.id
           and a.tag_id in ${tagIds}
      ) = ${tagIds.length}`)
    }

    const where = sql.join(conditions, sql` and `)

    const [rowsResult, countResult] = await Promise.all([
      db.execute(sql`
        select c.id, c.salon_id, c.name, c.email, c.phone, c.preferences,
               c.created_at, c.updated_at
          from customers c
         where ${where}
         order by c.updated_at desc
         limit ${pageSize} offset ${offset}
      `),
      db.execute(sql`select count(*)::int as total from customers c where ${where}`),
    ])

    const pageIds = rowsResult.map((r) => String(r.id))

    // Tags só dos contatos desta página.
    const assignmentsByCustomer = new Map<string, TagAssignmentWithTag[]>()
    if (pageIds.length > 0) {
      const assignments = await db.query.customerTagAssignments.findMany({
        where: inArray(customerTagAssignments.customerId, pageIds),
        with: { tag: true },
      })
      for (const a of assignments) {
        const list = assignmentsByCustomer.get(a.customerId) ?? []
        list.push({ tag: a.tag })
        assignmentsByCustomer.set(a.customerId, list)
      }
    }

    const rows: CustomerRow[] = rowsResult.map((r) => {
      const id = String(r.id)
      const assignments = assignmentsByCustomer.get(id) ?? []
      return {
        id,
        salonId: String(r.salon_id),
        name: String(r.name),
        email: r.email ? String(r.email) : null,
        phone: r.phone ? String(r.phone) : null,
        preferences: (r.preferences ?? null) as Record<string, unknown> | null,
        tags: mapCustomerTags(assignments),
        createdAt: new Date(String(r.created_at)).toISOString(),
        updatedAt: new Date(String(r.updated_at)).toISOString(),
      }
    })

    return {
      success: true,
      data: { rows, total: Number(countResult[0]?.total ?? 0), page, pageSize },
    }
  } catch (error) {
    console.error("Erro ao buscar clientes:", error)
    return { error: "Falha ao buscar clientes." }
  }
}

/** Teto do export. Acima disso o CSV vira um job, não uma Server Action. */
const CSV_EXPORT_LIMIT = 5000

/**
 * Exporta os contatos em CSV, RESPEITANDO os filtros da tela.
 *
 * Precisou virar servidor porque o cliente já não tem a base — só a página atual.
 * E de quebra conserta um bug que existia antes: o export montava o CSV a partir do
 * array completo, ignorando busca e filtro de tag ativos. Quem filtrava por "VIP" e
 * clicava em Exportar levava todo mundo, sem nenhum aviso.
 *
 * Devolve a string; quem baixa é o cliente (o navegador precisa do Blob de todo
 * jeito, e Server Action não faz download).
 */
export async function exportSalonCustomersCsv(
  salonId: string,
  query: Pick<SalonCustomersQuery, "q" | "tagIds"> = {}
): Promise<ActionResult<{ csv: string; rowCount: number; truncated: boolean }>> {
  try {
    // Reusa a mesma paginação: um único caminho de filtro para tela e export,
    // então não há como divergirem.
    const first = await getSalonCustomers(salonId, { ...query, page: 1, pageSize: 100 })
    if ("error" in first) return { error: first.error }

    const total = first.data!.total
    const rows = [...first.data!.rows]
    const limit = Math.min(total, CSV_EXPORT_LIMIT)

    for (let page = 2; rows.length < limit; page++) {
      const next = await getSalonCustomers(salonId, { ...query, page, pageSize: 100 })
      if ("error" in next) return { error: next.error }
      if (next.data!.rows.length === 0) break
      rows.push(...next.data!.rows)
    }

    const headers = ["Nome", "Telefone", "E-mail", "Tags", "Preferências"]
    const escape = (v: string) => `"${v.replace(/"/g, '""')}"`
    const body = rows.slice(0, limit).map((c) => {
      const prefs = c.preferences?.notes
        ? String(c.preferences.notes)
        : c.preferences
          ? JSON.stringify(c.preferences)
          : ""
      return [
        c.name,
        c.phone ?? "",
        c.email ?? "",
        (c.tags ?? []).map((t) => t.name).join("; "),
        prefs,
      ].map(escape).join(",")
    })

    return {
      success: true,
      data: {
        csv: [headers.join(","), ...body].join("\n"),
        rowCount: body.length,
        truncated: total > limit,
      },
    }
  } catch (error) {
    console.error("Erro ao exportar contatos:", error)
    return { error: "Falha ao exportar contatos." }
  }
}

/** Opção de cliente para seletor (diálogo de novo agendamento). */
export type CustomerOption = { id: string; name: string; phone: string }

/** Teto do seletor. Acima disso, a lista precisa virar busca — ver comentário. */
const CUSTOMER_OPTIONS_LIMIT = 1000

/**
 * Clientes do salão para SELETOR: só id, nome e telefone.
 *
 * Existe separado de `getSalonCustomers` porque as duas telas querem coisas
 * diferentes. A listagem é paginada em 20 e precisa de tags; um `<select>` precisa
 * de TODOS os nomes de uma vez, senão o dono não consegue escolher um cliente que
 * não esteja na primeira página — foi o que quase aconteceu quando a paginação
 * entrou, em silêncio.
 *
 * Três colunas e nenhum join: bem mais barato que a linha completa da listagem.
 *
 * ⚠️ Teto de 1000. Um `<select>` já é a UI errada muito antes disso (o maior salão
 * em produção tem 66 clientes); quando alguém encostar no teto, o certo é trocar o
 * seletor por um campo de busca com consulta no servidor, não subir o número.
 */
export async function getSalonCustomerOptions(
  salonId: string
): Promise<ActionResult<CustomerOption[]>> {
  try {
    if (!salonId) return { error: "salonId é obrigatório" }

    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) return { error: "Não autenticado" }
    if (!(await canReadCrm(salonId, user.id))) {
      return { error: "Acesso negado a este salão" }
    }

    const rows = await db.query.customers.findMany({
      where: and(eq(customers.salonId, salonId), eq(customers.isSystem, false)),
      columns: { id: true, name: true, phone: true },
      orderBy: customers.name,
      limit: CUSTOMER_OPTIONS_LIMIT,
    })

    return { success: true, data: rows }
  } catch (error) {
    console.error("Erro ao listar clientes para seleção:", error)
    return { error: "Falha ao carregar clientes." }
  }
}

/**
 * A ficha do cliente: tudo numa chamada.
 *
 * Um único `Promise.all`. Com o banco em us-west-2 o custo dominante é o NÚMERO de
 * idas, não o peso de cada uma — cascata de queries é o que faz a tela parecer
 * lenta.
 *
 * Deliberadamente NÃO usa `GetUpcomingAppointmentsUseCase` do mcp-server: ele é N+1
 * por construção (faz `findById` de customer, professional e service por
 * agendamento). Numa ficha isso viraria 3-10 viagens para o que um join resolve.
 *
 * Guard: `canReadCrm` — STAFF lê (é quem atende no balcão).
 */
export async function getCustomerDetail(
  salonId: string,
  customerId: string
): Promise<ActionResult<CustomerDetail>> {
  try {
    if (!salonId || !customerId) {
      return { error: "Parâmetros obrigatórios ausentes" }
    }

    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) return { error: "Não autenticado" }
    if (!(await canReadCrm(salonId, user.id))) {
      return { error: "Acesso negado a este salão" }
    }

    const [customer, appointmentRows, metricRows, noteRows] = await Promise.all([
      // Cadastro + tags + Trinks numa só: as relations já existem no schema.
      db.query.customers.findFirst({
        where: and(eq(customers.id, customerId), eq(customers.salonId, salonId)),
        with: {
          tagAssignments: { with: { tag: true } },
          trinksProfile: true,
        },
      }),

      // Histórico — a única query que não existia no repo. Passado E futuro na
      // mesma passada (a separação é feita na tela), usando appt_client_idx.
      db.execute(sql`
        select a.id, a.date, a.end_time, a.status,
               -- Mesma regra do agregado: valor de linha 'legacy' é 0 por
               -- desconhecimento, não por cortesia. Vira null e a tela mostra "—".
               case when coalesce(a.outcome_source, '') = 'legacy'
                    then null else a.price_charged end as price_charged,
               a.completed_at, a.cancelled_at, a.cancel_reason,
               sv.name as service_name, p.name as professional_name
          from appointments a
          join services sv on sv.id = a.service_id
          join professionals p on p.id = a.professional_id
         where a.client_id = ${customerId}
           and a.salon_id = ${salonId}
         order by a.date desc
         limit 30
      `),

      // Métricas. On-demand é aceitável para UM cliente — a proibição do roadmap
      // (tabela agregada + job) é para a LISTA, onde seria por linha.
      db.execute(sql`
        select
          -- Dinheiro EXCLUI outcome_source='legacy': são as 45 linhas que a migration
          -- 027 backfillou com price_charged = 0 porque o valor real é desconhecido
          -- (nenhum código gravava 'completed' antes dela). Contá-las mostraria
          -- "R$ 0,00 de total gasto" para quem de fato gastou — pior que mostrar "—".
          -- A VISITA continua contando: ela aconteceu, só não sabemos o valor.
          sum(a.price_charged) filter (
            where a.status = 'completed' and coalesce(a.outcome_source, '') <> 'legacy'
          ) as total_spent,
          avg(a.price_charged) filter (
            where a.status = 'completed' and coalesce(a.outcome_source, '') <> 'legacy'
          ) as avg_ticket,
          count(*)             filter (where a.status = 'completed')::int       as completed_count,
          count(*)             filter (where a.status = 'no_show')::int         as no_show_count,
          count(*)             filter (where a.status = 'cancelled')::int       as cancelled_count,
          min(a.date)          filter (where a.status = 'completed')            as first_visit,
          max(a.date)          filter (where a.status = 'completed')            as last_visit,
          count(*) filter (
            where a.status = 'completed' and a.date > now() - interval '90 days'
          )::int as visits_90,
          count(*) filter (
            where a.status = 'completed' and a.date > now() - interval '365 days'
          )::int as visits_365
        from appointments a
        where a.client_id = ${customerId}
          and a.salon_id = ${salonId}
      `),

      db.query.customerNotes.findMany({
        where: and(
          eq(customerNotes.customerId, customerId),
          eq(customerNotes.salonId, salonId)
        ),
        orderBy: desc(customerNotes.createdAt),
        limit: 50,
        with: { author: { columns: { firstName: true, fullName: true, email: true } } },
      }),
    ])

    if (!customer) {
      return { error: "Contato não encontrado" }
    }

    // Risco de falta e o chat vêm depois porque dependem do customer resolvido
    // (id e telefone). Duas idas, em paralelo.
    const digits = (customer.phone ?? "").replace(/\D/g, "")
    const [risk, chatRow] = await Promise.all([
      evaluateNoShowRisk(customer.id, salonId),
      digits
        ? db.query.chats.findFirst({
            where: and(
              eq(chats.salonId, salonId),
              // Casamento por string, com fallback pelo sufixo de 8 dígitos: há
              // contatos gravados sem o DDI 55 que nunca batem no formato cheio.
              // É dívida da Onda 2 (chats.customer_id por FK); até lá, se não achar,
              // a tela simplesmente não mostra o botão "Abrir conversa".
              sql`regexp_replace(${chats.clientPhone}, '[^0-9]', '', 'g')
                    in (${digits}, ${digits.slice(-8)})
                  or right(regexp_replace(${chats.clientPhone}, '[^0-9]', '', 'g'), 8) = ${digits.slice(-8)}`
            ),
            columns: { id: true },
            orderBy: desc(chats.updatedAt),
          })
        : Promise.resolve(undefined),
    ])

    const m = metricRows[0] ?? {}
    const iso = (v: unknown) => (v ? new Date(String(v)).toISOString() : null)
    const str = (v: unknown) => (v === null || v === undefined ? null : String(v))

    const trinks = customer.trinksProfile
    return {
      success: true,
      data: {
        id: customer.id,
        salonId: customer.salonId,
        name: customer.name,
        phone: customer.phone,
        email: customer.email || null,
        preferences: customer.preferences as Record<string, unknown> | null,
        optedOutAt: customer.optedOutAt ? customer.optedOutAt.toISOString() : null,
        optOutReason: customer.optOutReason ?? null,
        createdAt: customer.createdAt.toISOString(),
        tags: mapCustomerTags(customer.tagAssignments),
        metrics: {
          totalSpent: str(m.total_spent),
          averageTicket: str(m.avg_ticket),
          completedCount: Number(m.completed_count ?? 0),
          noShowCount: Number(m.no_show_count ?? 0),
          cancelledCount: Number(m.cancelled_count ?? 0),
          firstVisitAt: iso(m.first_visit),
          lastVisitAt: iso(m.last_visit),
          visits90: Number(m.visits_90 ?? 0),
          visits365: Number(m.visits_365 ?? 0),
        },
        appointments: appointmentRows.map((r) => ({
          id: String(r.id),
          date: new Date(String(r.date)).toISOString(),
          endTime: new Date(String(r.end_time)).toISOString(),
          status: String(r.status) as CustomerAppointmentRow["status"],
          serviceName: String(r.service_name),
          professionalName: String(r.professional_name),
          priceCharged: str(r.price_charged),
          completedAt: iso(r.completed_at),
          cancelledAt: iso(r.cancelled_at),
          cancelReason: r.cancel_reason ? String(r.cancel_reason) : null,
        })),
        notes: noteRows.map((n) => ({
          id: n.id,
          body: n.body,
          authorName:
            n.author?.firstName ||
            n.author?.fullName?.split(" ")[0] ||
            n.author?.email?.split("@")[0] ||
            null,
          createdAt: n.createdAt.toISOString(),
        })),
        // Só mostra o bloco do Trinks quando o cliente foi ENCONTRADO lá. Em
        // produção são 25/25 perfis com trinks_not_found=true, então hoje o bloco
        // não aparece — que é o correto, e melhor que exibir zeros.
        trinks:
          trinks && !trinks.trinksNotFound
            ? {
                totalSpent: str(trinks.totalSpent),
                averageTicket: str(trinks.averageTicket),
                visitCount90Days: trinks.visitCount90Days ?? null,
                visitCount365Days: trinks.visitCount365Days ?? null,
                lastVisitAt: trinks.lastVisitAt ? trinks.lastVisitAt.toISOString() : null,
                vipScore: trinks.vipScore ?? null,
                syncedAt: trinks.syncedAt ? trinks.syncedAt.toISOString() : null,
              }
            : null,
        noShowRisk: {
          isHighRisk: risk.isHighRisk,
          ratio: risk.cancellationRatio,
          sampleSize: risk.totalAppointments,
        },
        chatId: chatRow?.id ?? null,
      },
    }
  } catch (error) {
    console.error("Erro ao buscar ficha do cliente:", error)
    return { error: "Falha ao carregar a ficha do cliente." }
  }
}

/**
 * Adiciona uma nota de atendimento.
 *
 * Mutação: exige `hasSalonPermission` (Owner/Manager). STAFF LÊ a ficha mas não
 * escreve na v1 — decisão do dono. Vale revisitar: quem atende no balcão é
 * justamente quem tem a informação para anotar.
 */
export async function addCustomerNote(
  salonId: string,
  customerId: string,
  body: string
): Promise<ActionResult<CustomerNoteRow>> {
  try {
    const text = body?.trim()
    if (!salonId || !customerId) return { error: "Parâmetros obrigatórios ausentes" }
    if (!text) return { error: "Escreva algo na nota" }
    if (text.length > 2000) return { error: "A nota é longa demais (máximo 2000 caracteres)" }

    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) return { error: "Não autenticado" }
    if (!(await hasSalonPermission(salonId, user.id))) {
      return { error: "Acesso negado a este salão" }
    }

    // Confirma que o contato é DESTE salão antes de escrever — sem isso, um
    // customerId de outro tenant gravaria nota no salão errado.
    const target = await db.query.customers.findFirst({
      where: and(eq(customers.id, customerId), eq(customers.salonId, salonId)),
      columns: { id: true },
    })
    if (!target) return { error: "Contato não encontrado neste salão" }

    const [created] = await db
      .insert(customerNotes)
      .values({ salonId, customerId, authorProfileId: user.id, body: text })
      .returning({ id: customerNotes.id, createdAt: customerNotes.createdAt })

    const author = await db.query.profiles.findFirst({
      where: eq(profiles.id, user.id),
      columns: { firstName: true, fullName: true, email: true },
    })

    return {
      success: true,
      data: {
        id: created.id,
        body: text,
        authorName:
          author?.firstName ||
          author?.fullName?.split(" ")[0] ||
          author?.email?.split("@")[0] ||
          null,
        createdAt: created.createdAt.toISOString(),
      },
    }
  } catch (error) {
    console.error("Erro ao adicionar nota:", error)
    return { error: "Falha ao salvar a nota." }
  }
}

export type CreateSalonCustomerInput = {
  salonId: string
  name: string
  phone: string
  email?: string
  preferences?: string
}

/**
 * Cria um novo contato no salão
 */
export async function createSalonCustomer(
  input: CreateSalonCustomerInput
): Promise<ActionResult<CustomerRow>> {
  try {
    // 1. Validação de entrada
    if (!input.salonId || !input.name || !input.phone) {
      return { error: "Salão, nome e telefone são obrigatórios" }
    }

    if (input.name.trim().length < 2) {
      return { error: "Nome deve ter pelo menos 2 caracteres" }
    }

    // Validação básica de email se fornecido
    if (input.email && input.email.trim() && !input.email.includes("@")) {
      return { error: "E-mail inválido" }
    }

    // 2. Auth Check
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return { error: "Não autenticado" }
    }

    // 3. Permission Check
    const hasAccess = await hasSalonPermission(input.salonId, user.id)

    if (!hasAccess) {
      return { error: "Acesso negado a este salão" }
    }

    // 4. Normaliza telefone
    const normalizedPhone = input.phone.replace(/\D/g, "") // Remove caracteres não numéricos

    // 5. Prepara preferências
    const preferencesData: Record<string, unknown> | null = input.preferences?.trim()
      ? { notes: input.preferences.trim() }
      : null

    // 6. Verifica se já existe customer com este telefone no salão
    const existingCustomer = await db.query.customers.findFirst({
      where: and(
        eq(customers.salonId, input.salonId),
        eq(customers.phone, normalizedPhone)
      ),
      columns: { id: true, name: true, email: true, preferences: true },
    })

    let customerId: string

    if (existingCustomer) {
      // Cliente já existe, atualiza os dados
      const updates: {
        name?: string
        email?: string | null
        preferences?: Record<string, unknown> | null
      } = {}

      if (input.name.trim() !== existingCustomer.name) {
        updates.name = input.name.trim()
      }

      const emailToSet = input.email?.trim() || null
      if (emailToSet !== existingCustomer.email) {
        updates.email = emailToSet
      }

      if (preferencesData) {
        const currentPreferences = (existingCustomer.preferences as Record<string, unknown>) || {}
        updates.preferences = {
          ...currentPreferences,
          ...preferencesData,
        }
      }

      if (Object.keys(updates).length > 0) {
        await db
          .update(customers)
          .set({
            ...updates,
            updatedAt: new Date(),
          })
          .where(eq(customers.id, existingCustomer.id))
      }

      customerId = existingCustomer.id
    } else {
      // Cria novo customer
      const [newCustomer] = await db
        .insert(customers)
        .values({
          salonId: input.salonId,
          name: input.name.trim(),
          phone: normalizedPhone,
          email: input.email?.trim() || null,
          preferences: preferencesData,
        })
        .returning({ id: customers.id })

      customerId = newCustomer.id
    }

    // 7. Busca o cliente criado/atualizado para retornar
    const createdCustomer = await db.query.customers.findFirst({
      where: eq(customers.id, customerId),
      columns: {
        id: true,
        salonId: true,
        name: true,
        email: true,
        phone: true,
        preferences: true,
        createdAt: true,
        updatedAt: true,
      },
      with: { tagAssignments: { with: { tag: true } } },
    })

    if (!createdCustomer) {
      return { error: "Falha ao recuperar contato criado" }
    }

    const mappedCustomer: CustomerRow = {
      id: createdCustomer.id,
      salonId: createdCustomer.salonId,
      name: createdCustomer.name,
      email: createdCustomer.email || null,
      phone: createdCustomer.phone || null,
      preferences: createdCustomer.preferences as Record<string, unknown> | null,
      tags: mapCustomerTags(createdCustomer.tagAssignments),
      createdAt: createdCustomer.createdAt.toISOString(),
      updatedAt: createdCustomer.updatedAt.toISOString(),
    }

    return { success: true, data: mappedCustomer }
  } catch (error) {
    console.error("Erro ao criar contato:", error)
    return { error: "Falha ao criar contato." }
  }
}

/**
 * Remove um contato do salão
 */
export async function deleteSalonCustomer(
  customerId: string,
  salonId: string
): Promise<ActionResult> {
  try {
    // 1. Validação de entrada
    if (!customerId || !salonId) {
      return { error: "ID do contato e do salão são obrigatórios" }
    }

    // 2. Auth Check
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return { error: "Não autenticado" }
    }

    // 3. Permission Check
    const hasAccess = await hasSalonPermission(salonId, user.id)

    if (!hasAccess) {
      return { error: "Acesso negado a este salão" }
    }

    // 4. Verifica se o contato existe e pertence ao salão
    const existingCustomer = await db.query.customers.findFirst({
      where: and(
        eq(customers.id, customerId),
        eq(customers.salonId, salonId)
      ),
      columns: { id: true },
    })

    if (!existingCustomer) {
      return { error: "Contato não encontrado ou não pertence a este salão" }
    }

    // 5. Remove o registro de customers
    await db.delete(customers).where(eq(customers.id, customerId))

    return { success: true }
  } catch (error) {
    console.error("Erro ao remover contato:", error)
    return { error: "Falha ao remover contato." }
  }
}

export type UpdateSalonCustomerInput = {
  customerId: string
  salonId: string
  name?: string
  phone?: string
  email?: string
  preferences?: string
}

/**
 * Atualiza um contato existente no salão
 */
export async function updateSalonCustomer(
  input: UpdateSalonCustomerInput
): Promise<ActionResult<CustomerRow>> {
  try {
    // 1. Validação de entrada
    if (!input.customerId || !input.salonId) {
      return { error: "ID do contato e do salão são obrigatórios" }
    }

    // 2. Auth Check
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return { error: "Não autenticado" }
    }

    // 3. Permission Check
    const hasAccess = await hasSalonPermission(input.salonId, user.id)

    if (!hasAccess) {
      return { error: "Acesso negado a este salão" }
    }

    // 4. Verifica se o contato existe e pertence ao salão
    const existingCustomer = await db.query.customers.findFirst({
      where: and(
        eq(customers.id, input.customerId),
        eq(customers.salonId, input.salonId)
      ),
      columns: {
        id: true,
        name: true,
        phone: true,
        email: true,
        preferences: true,
      },
    })

    if (!existingCustomer) {
      return { error: "Contato não encontrado ou não pertence a este salão" }
    }

    // 5. Prepara os dados para atualização
    const updates: {
      name?: string
      phone?: string
      email?: string | null
      preferences?: Record<string, unknown> | null
      updatedAt?: Date
    } = {}

    if (input.name !== undefined && input.name.trim() !== existingCustomer.name) {
      if (input.name.trim().length < 2) {
        return { error: "Nome deve ter pelo menos 2 caracteres" }
      }
      updates.name = input.name.trim()
    }

    if (input.phone !== undefined) {
      const normalizedPhone = input.phone.replace(/\D/g, "")
      if (normalizedPhone !== existingCustomer.phone) {
        if (!normalizedPhone) {
          return { error: "Telefone é obrigatório" }
        }
        updates.phone = normalizedPhone
      }
    }

    if (input.email !== undefined) {
      const emailToSet = input.email.trim() || null
      if (emailToSet && !emailToSet.includes("@")) {
        return { error: "E-mail inválido" }
      }
      if (emailToSet !== existingCustomer.email) {
        updates.email = emailToSet
      }
    }

    if (input.preferences !== undefined) {
      const preferencesData: Record<string, unknown> | null = input.preferences.trim()
        ? { notes: input.preferences.trim() }
        : null

      // Mescla com preferências existentes se houver
      const currentPreferences = (existingCustomer.preferences as Record<string, unknown>) || {}
      updates.preferences = preferencesData
        ? { ...currentPreferences, ...preferencesData }
        : null
    }

    // 6. Atualiza apenas se houver mudanças
    if (Object.keys(updates).length > 0) {
      updates.updatedAt = new Date()
      await db
        .update(customers)
        .set(updates)
        .where(eq(customers.id, input.customerId))
    }

    // 7. Busca o contato atualizado para retornar
    const updatedCustomer = await db.query.customers.findFirst({
      where: eq(customers.id, input.customerId),
      columns: {
        id: true,
        salonId: true,
        name: true,
        email: true,
        phone: true,
        preferences: true,
        createdAt: true,
        updatedAt: true,
      },
      with: { tagAssignments: { with: { tag: true } } },
    })

    if (!updatedCustomer) {
      return { error: "Falha ao recuperar contato atualizado" }
    }

    const mappedCustomer: CustomerRow = {
      id: updatedCustomer.id,
      salonId: updatedCustomer.salonId,
      name: updatedCustomer.name,
      email: updatedCustomer.email || null,
      phone: updatedCustomer.phone || null,
      preferences: updatedCustomer.preferences as Record<string, unknown> | null,
      tags: mapCustomerTags(updatedCustomer.tagAssignments),
      createdAt: updatedCustomer.createdAt.toISOString(),
      updatedAt: updatedCustomer.updatedAt.toISOString(),
    }

    return { success: true, data: mappedCustomer }
  } catch (error) {
    console.error("Erro ao atualizar contato:", error)
    return { error: "Falha ao atualizar contato." }
  }
}