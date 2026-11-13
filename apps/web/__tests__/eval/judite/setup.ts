/**
 * Preparo do salão de TESTE onde os cenários da Judite rodam.
 *
 * Os cenários usam o bot de verdade (modelo, tools, banco). Por isso:
 *  - NUNCA rodam no salão do Fabiano: o id de produção é recusado, e o salão
 *    informado precisa ter "teste" no nome;
 *  - a agenda oficial é a Belasis SIMULADA (fake-belasis.ts) — nenhuma chamada
 *    sai para api.belasis.com.br.
 *
 * O que este módulo garante antes dos cenários, sempre no salão de teste:
 *  1. o agente ativo usa o prompt de `system-prompt.txt` (o mesmo texto que vai
 *     para produção) e se chama "Judite";
 *  2. o corte feminino custa R$ 450 e a descrição não fala em cabelo curto;
 *  3. existe um serviço "Hidratação" (com valor DE TESTE — o valor real ainda
 *     não foi informado pelo salão) para o cenário de dois serviços;
 *  4. a integração `belasis` está ativa com um token de mentira, e profissional e
 *     serviços estão vinculados a ids da Belasis simulada.
 */

import { readFileSync } from "node:fs"
import path from "node:path"
import {
  db,
  agents,
  appointments,
  customers,
  integrationExternalRefs,
  professionals,
  professionalServices,
  salonIntegrations,
  salons,
  services,
  and,
  eq,
  inArray,
  ne,
  domainServices,
} from "@repo/db"
import { sealAgendaCredentials } from "@repo/db/src/infrastructure/integrations/agenda/agenda-credentials"
import {
  clearBelasisFreeTimesCache,
  clearBelasisLookupCaches,
} from "@repo/db/src/infrastructure/integrations/belasis/belasis-agenda-provider"
import type { EvalEnv } from "../runner/env"
import { createFakeBelasis, type FakeBelasis, type FakeBelasisOptions } from "./fake-belasis"

/** Salões REAIS da Judite/Fabiano. Os cenários se recusam a rodar neles. */
const PRODUCTION_SALON_IDS = new Set(["d4067a85-0c76-42d0-94c8-448f0ed21fcd"])

/** Valor e duração DE TESTE da hidratação. Não é o valor do salão. */
export const HIDRATACAO_TEST_PRICE = 180
const HIDRATACAO_TEST_DURATION = 60

const CORTE_FEMININO_PRICE = "450.00"
const CORTE_FEMININO_DESCRIPTION =
  "Valor único, para qualquer cabelo. Inclui lavagem, finalização e visagismo. Retorno recomendado: 60 a 90 dias."

/** Ids do lado de lá (Belasis simulada). */
export const FAKE_EMPLOYEE_ID = 7
export const FAKE_TRAFFIC_COLOR_ID = 17

export interface JuditeEvalContext {
  env: EvalEnv
  professionalId: string
  corteFemininoId: string
  hidratacaoId: string
  /** Serviço daqui → id do serviço na Belasis simulada. */
  fakeServiceIds: Map<string, number>
}

const DEFAULT_CLIENT_PHONE = "5511900000001"

/** `null` = a suíte não foi configurada (ela se pula, não falha). */
export function juditeSalonIdFromEnv(): string | null {
  return process.env.JUDITE_EVAL_SALON_ID?.trim() || null
}

/** O texto que vai para `agents.system_prompt`, como está no arquivo versionado. */
export function loadJuditePrompt(): string {
  const file = path.resolve(__dirname, "system-prompt.txt")
  return readFileSync(file, "utf8").replace(/\r\n/g, "\n").trim()
}

// ----------------------------------------------------------------------------
// Belasis simulada: uma por conversa, atrás de um único `fetch` trocado
// ----------------------------------------------------------------------------

let currentFake: FakeBelasis = createFakeBelasis()
let realFetch: typeof fetch | null = null

/** Troca o `fetch` global uma vez; as conversas só trocam o estado por trás. */
function installFakeBelasisFetch(): void {
  if (realFetch) return
  realFetch = globalThis.fetch
  const original = realFetch
  globalThis.fetch = ((input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) =>
    currentFake.wrapFetch(original)(input, init)) as typeof fetch
}

function uninstallFakeBelasisFetch(): void {
  if (!realFetch) return
  globalThis.fetch = realFetch
  realFetch = null
}

/**
 * Começa uma conversa com a agenda oficial no estado pedido e sem nada lembrado
 * da conversa anterior (cliente não achada, cor resolvida, consulta recente).
 */
export function resetFakeBelasis(ctx: JuditeEvalContext, options: FakeBelasisOptions = {}): FakeBelasis {
  currentFake = createFakeBelasis({
    employees: [{ id: FAKE_EMPLOYEE_ID, name: "Fabiano Eber" }],
    ...options,
  })
  clearBelasisFreeTimesCache()
  clearBelasisLookupCaches()
  domainServices.clearAgendaCustomerRefreshMemo()
  domainServices.forgetActiveAgendaProvider(ctx.env.salonId)
  return currentFake
}

// ----------------------------------------------------------------------------
// Preparo do salão de teste
// ----------------------------------------------------------------------------

async function assertTestSalon(salonId: string): Promise<void> {
  if (PRODUCTION_SALON_IDS.has(salonId)) {
    throw new Error(
      `JUDITE_EVAL_SALON_ID aponta para o salão REAL da Judite (${salonId}). ` +
        `Os cenários criam clientes e agendamentos: use um salão de teste.`
    )
  }
  const salon = await db.query.salons.findFirst({
    where: eq(salons.id, salonId),
    columns: { id: true, name: true },
  })
  if (!salon) throw new Error(`JUDITE_EVAL_SALON_ID=${salonId} não existe`)
  if (!/teste/i.test(salon.name)) {
    throw new Error(
      `O salão ${salonId} ("${salon.name}") não tem "teste" no nome. ` +
        `Por segurança, os cenários só rodam em salão marcado como de teste.`
    )
  }
}

async function findServiceByName(salonId: string, pattern: RegExp) {
  const all = await db.query.services.findMany({
    where: and(eq(services.salonId, salonId), eq(services.isActive, true)),
    columns: { id: true, name: true },
  })
  return all.find((s) => pattern.test(s.name)) ?? null
}

export async function setupJuditeSalon(salonId: string): Promise<JuditeEvalContext> {
  await assertTestSalon(salonId)

  // 1. O agente com o prompt e o nome novos.
  const agent = await db.query.agents.findFirst({
    where: and(eq(agents.salonId, salonId), eq(agents.isActive, true)),
    columns: { id: true },
  })
  if (!agent) throw new Error(`O salão de teste ${salonId} não tem agente ativo`)
  await db
    .update(agents)
    .set({ name: "Judite", systemPrompt: loadJuditePrompt(), updatedAt: new Date() })
    .where(eq(agents.id, agent.id))

  // 2. Profissional (o salão do Fabiano tem um só).
  const professional = await db.query.professionals.findFirst({
    where: and(eq(professionals.salonId, salonId), eq(professionals.isActive, true)),
    columns: { id: true },
  })
  if (!professional) throw new Error(`O salão de teste ${salonId} não tem profissional ativo`)

  // 3. Corte feminino no valor novo.
  const corte = await findServiceByName(salonId, /^corte feminino$/i)
  if (!corte) throw new Error(`O salão de teste ${salonId} não tem o serviço "Corte feminino"`)
  await db
    .update(services)
    .set({ price: CORTE_FEMININO_PRICE, description: CORTE_FEMININO_DESCRIPTION })
    .where(eq(services.id, corte.id))

  // 4. Hidratação, com valor de teste, feita pelo mesmo profissional.
  let hidratacao = await findServiceByName(salonId, /^hidrata[cç][aã]o$/i)
  if (!hidratacao) {
    const [created] = await db
      .insert(services)
      .values({
        salonId,
        name: "Hidratação",
        description: "SERVIÇO DE TESTE: valor e duração fictícios.",
        duration: HIDRATACAO_TEST_DURATION,
        price: HIDRATACAO_TEST_PRICE.toFixed(2),
        isActive: true,
      })
      .returning({ id: services.id, name: services.name })
    hidratacao = created ?? null
  }
  if (!hidratacao) throw new Error("Não foi possível criar o serviço de teste Hidratação")
  await db
    .insert(professionalServices)
    .values({ professionalId: professional.id, serviceId: hidratacao.id })
    .onConflictDoNothing()

  // 5. Agenda oficial simulada: integração ativa + vínculos.
  await db
    .insert(salonIntegrations)
    .values({
      salonId,
      provider: "belasis",
      refreshToken: sealAgendaCredentials({ token: "bpk_eval_simulada" }),
      isActive: true,
    })
    .onConflictDoUpdate({
      target: [salonIntegrations.salonId, salonIntegrations.provider],
      set: {
        refreshToken: sealAgendaCredentials({ token: "bpk_eval_simulada" }),
        isActive: true,
        updatedAt: new Date(),
      },
    })

  const activeServices = await db.query.services.findMany({
    where: and(eq(services.salonId, salonId), eq(services.isActive, true)),
    columns: { id: true },
  })
  const fakeServiceIds = new Map(activeServices.map((s, index) => [s.id, 30 + index]))
  const scope = and(eq(integrationExternalRefs.salonId, salonId), eq(integrationExternalRefs.provider, "belasis"))
  await db
    .delete(integrationExternalRefs)
    .where(and(scope, inArray(integrationExternalRefs.entityType, ["professional", "service"])))
  await db.insert(integrationExternalRefs).values([
    {
      salonId,
      provider: "belasis",
      entityType: "professional",
      internalId: professional.id,
      externalId: String(FAKE_EMPLOYEE_ID),
    },
    ...activeServices.map((s) => ({
      salonId,
      provider: "belasis",
      entityType: "service",
      internalId: s.id,
      externalId: String(fakeServiceIds.get(s.id)),
    })),
  ])

  // 6. A cor de tráfego, como estará configurada em produção.
  process.env.BELASIS_TRAFFIC_COLOR = "Marrom"

  installFakeBelasisFetch()
  domainServices.forgetActiveAgendaProvider(salonId)

  return {
    env: {
      salonId,
      professionalId: professional.id,
      serviceId: corte.id,
      clientPhone: (process.env.JUDITE_EVAL_CLIENT_PHONE || DEFAULT_CLIENT_PHONE).trim(),
    },
    professionalId: professional.id,
    corteFemininoId: corte.id,
    hidratacaoId: hidratacao.id,
    fakeServiceIds,
  }
}

/** Desliga a agenda simulada: fora dos cenários, o token de mentira só geraria erro. */
export async function teardownJuditeSalon(salonId: string): Promise<void> {
  uninstallFakeBelasisFetch()
  await db
    .update(salonIntegrations)
    .set({ isActive: false, updatedAt: new Date() })
    .where(and(eq(salonIntegrations.salonId, salonId), eq(salonIntegrations.provider, "belasis")))
  domainServices.forgetActiveAgendaProvider(salonId)
}

// ----------------------------------------------------------------------------
// Leituras para o `verify` das conversas
// ----------------------------------------------------------------------------

export async function loadCustomer(customerId: string) {
  return db.query.customers.findFirst({
    where: eq(customers.id, customerId),
    columns: { id: true, name: true, nameConfirmedAt: true, leadSource: true },
  })
}

/** Agendamentos da cliente que ainda valem (não cancelados), do mais próximo ao mais distante. */
export async function loadActiveAppointments(salonId: string, customerId: string) {
  return db.query.appointments.findMany({
    where: and(
      eq(appointments.salonId, salonId),
      eq(appointments.clientId, customerId),
      ne(appointments.status, "cancelled")
    ),
    columns: { id: true, serviceId: true, date: true, endTime: true, leadSource: true },
    orderBy: (table, { asc }) => [asc(table.date)],
  })
}
