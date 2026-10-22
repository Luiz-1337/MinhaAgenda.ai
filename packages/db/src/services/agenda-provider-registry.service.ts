import { and, eq, inArray } from 'drizzle-orm'

import { db } from '../index'
import { salonIntegrations } from '../schema'
import type { AgendaProvider, AgendaProviderId } from '../domain/integrations/interfaces/agenda-provider.interface'
import {
  openAgendaCredentials,
  type AgendaCredentials,
} from '../infrastructure/integrations/agenda/agenda-credentials'
import { createBelasisAgendaProvider } from '../infrastructure/integrations/belasis/belasis-agenda-provider'

export type AgendaProviderFactory = (ctx: {
  salonId: string
  credentials: AgendaCredentials
  /** Trabalho sem pressa (sincronização): o provedor pode usar um ritmo mais lento. */
  background?: boolean
}) => AgendaProvider

/**
 * Provedores de agenda oficial com cliente HTTP implementado — cada um escrito
 * contra a documentação real da API (o Trinks foi escrito contra um contrato
 * imaginado e nunca autenticou uma única vez).
 *
 * Estar aqui não liga nada sozinho: o caminho de agenda oficial em
 * `appointments.ts` e na disponibilidade só roda para o salão que conectou E
 * ativou (linha em `salon_integrations` com `is_active = true`). A conexão nasce
 * inativa; ativa depois do vínculo de profissionais e serviços, que mora na
 * tabela da migration 034.
 */
const FACTORIES: Partial<Record<AgendaProviderId, AgendaProviderFactory>> = {
  belasis: ({ credentials, background }) => createBelasisAgendaProvider(credentials.token, { background }),
}

function availableProviderIds(): AgendaProviderId[] {
  return Object.keys(FACTORIES) as AgendaProviderId[]
}

export function isAgendaProviderAvailable(id: AgendaProviderId): boolean {
  return FACTORIES[id] !== undefined
}

export function getAgendaProviderFactory(id: AgendaProviderId): AgendaProviderFactory | null {
  return FACTORIES[id] ?? null
}

export interface ResolvedAgendaProvider {
  providerId: AgendaProviderId
  salonId: string
  integrationId: string
  provider: AgendaProvider
}

type ActiveAgendaRow = { id: string; provider: string; refreshToken: string }

/**
 * A linha ativa de cada salão, por alguns segundos. Sem isto, TODO salão — com ou
 * sem agenda oficial — pagaria uma ida ao banco a mais por profissional em cada
 * sugestão de horário, e o banco está longe (ver diagnóstico de lentidão de jul/26).
 * Ativar/pausar/trocar token limpam a entrada no processo que fez a mudança; nos
 * outros (worker × painel) vale em até 30 s.
 */
const ACTIVE_ROW_TTL_MS = 30_000
const activeRowCache = new Map<string, { expiresAt: number; row: ActiveAgendaRow | null }>()

export function forgetActiveAgendaProvider(salonId: string): void {
  activeRowCache.delete(salonId)
}

async function findActiveAgendaRow(salonId: string): Promise<ActiveAgendaRow | null> {
  const cached = activeRowCache.get(salonId)
  if (cached && cached.expiresAt > Date.now()) return cached.row

  // O filtro por provider fica escrito aqui, e não num helper: a guarda
  // salon-integrations-provider-scope.test.ts lê cada consulta.
  const rows = await db.query.salonIntegrations.findMany({
    where: and(
      eq(salonIntegrations.salonId, salonId),
      inArray(salonIntegrations.provider, availableProviderIds()),
      eq(salonIntegrations.isActive, true)
    ),
    columns: { id: true, provider: true, refreshToken: true },
  })
  if (rows.length > 1) {
    // "O horário está livre?" não tem resposta com duas agendas oficiais. A
    // conexão de um segundo provedor precisa ser recusada na tela de integrações.
    throw new Error(
      `Salão ${salonId} tem ${rows.length} agendas oficiais ativas (${rows.map((r) => r.provider).join(', ')})`
    )
  }
  const row = rows[0] ?? null
  activeRowCache.set(salonId, { expiresAt: Date.now() + ACTIVE_ROW_TTL_MS, row })
  return row
}

/** Só o banco (com cache curto), sem decifrar nada — para quem só precisa saber se existe. */
export async function hasActiveAgendaProvider(salonId: string): Promise<boolean> {
  if (availableProviderIds().length === 0) return false
  return (await findActiveAgendaRow(salonId)) !== null
}

/**
 * A agenda oficial ativa do salão, pronta para uso, ou null se não houver.
 *
 * Lança se a credencial não decifrar (ENCRYPTION_KEY trocada, linha adulterada)
 * ou se houver mais de uma agenda oficial ativa: nos dois casos o salão TEM
 * agenda oficial e não dá para consultá-la — quem chama decide se isso trava
 * (agendar) ou não (sugerir horários).
 */
export async function resolveAgendaProvider(
  salonId: string,
  options: { background?: boolean } = {}
): Promise<ResolvedAgendaProvider | null> {
  if (availableProviderIds().length === 0) return null

  const row = await findActiveAgendaRow(salonId)
  if (!row) return null

  const providerId = row.provider as AgendaProviderId
  const factory = FACTORIES[providerId]
  if (!factory) return null

  const credentials = openAgendaCredentials(row.refreshToken)
  return {
    providerId,
    salonId,
    integrationId: row.id,
    provider: factory({ salonId, credentials, background: options.background }),
  }
}

/** Salões com agenda oficial ATIVA — a sincronização automática passa por eles. */
export async function listSalonsWithActiveAgenda(): Promise<string[]> {
  if (availableProviderIds().length === 0) return []
  const rows = await db.query.salonIntegrations.findMany({
    where: and(
      inArray(salonIntegrations.provider, availableProviderIds()),
      eq(salonIntegrations.isActive, true)
    ),
    columns: { salonId: true },
  })
  return [...new Set(rows.map((r) => r.salonId))]
}

/** Monta o provedor para uma credencial AINDA NÃO salva — testar antes de gravar. */
export function buildAgendaProvider(
  providerId: AgendaProviderId,
  salonId: string,
  credentials: AgendaCredentials
): AgendaProvider | null {
  const factory = FACTORIES[providerId]
  return factory ? factory({ salonId, credentials }) : null
}

/**
 * Para a tela de integração: a agenda do salão MESMO INATIVA (conectada e ainda
 * sem vínculos). Nunca use no fluxo de agendamento — lá vale `resolveAgendaProvider`,
 * que só enxerga a agenda ativada.
 */
export async function resolveAgendaProviderForSetup(
  salonId: string,
  providerId: AgendaProviderId
): Promise<(ResolvedAgendaProvider & { isActive: boolean }) | null> {
  const factory = FACTORIES[providerId]
  if (!factory) return null

  const row = await db.query.salonIntegrations.findFirst({
    where: and(eq(salonIntegrations.salonId, salonId), eq(salonIntegrations.provider, providerId)),
    columns: { id: true, refreshToken: true, isActive: true },
  })
  if (!row) return null

  return {
    providerId,
    salonId,
    integrationId: row.id,
    isActive: row.isActive,
    provider: factory({ salonId, credentials: openAgendaCredentials(row.refreshToken) }),
  }
}
