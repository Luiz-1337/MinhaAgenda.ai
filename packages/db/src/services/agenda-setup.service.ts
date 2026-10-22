/**
 * Conexão e vínculo da agenda oficial externa (Belasis), o que a tela de
 * Integrações usa. As Server Actions só autenticam e chamam isto.
 *
 * O caminho de segurança: conectar NÃO muda nada para a IA. A conexão nasce
 * inativa; o dono vincula profissionais e serviços e só então ativa — a partir
 * daí a agenda oficial manda no agendamento (agenda-sync.service.ts).
 */
import { and, asc, eq, inArray } from 'drizzle-orm'

import { db } from '../index'
import { professionals, salonIntegrations, services } from '../schema'
import {
  AGENDA_PROVIDER_LABELS,
  type AgendaCatalogItem,
  type AgendaProviderId,
} from '../domain/integrations/interfaces/agenda-provider.interface'
import { isAgendaProviderError } from '../domain/errors/agenda-provider-error'
import {
  normalizePastedToken,
  sealAgendaCredentials,
} from '../infrastructure/integrations/agenda/agenda-credentials'
import {
  countExternalRefs,
  deleteAllExternalRefs,
  listExternalRefs,
  replaceExternalRefs,
} from '../infrastructure/repositories/integration-external-refs.repository'
import { suggestLinks } from '../utils/agenda-link.utils'
import {
  buildAgendaProvider,
  forgetActiveAgendaProvider,
  isAgendaProviderAvailable,
  resolveAgendaProviderForSetup,
} from './agenda-provider-registry.service'

export type AgendaSetupResult<T = void> = { ok: true; data: T } | { ok: false; error: string }

export interface AgendaSetupStatus {
  /** O código sabe falar com este provedor. */
  available: boolean
  connected: boolean
  isActive: boolean
  connectedAt: string | null
  linkedProfessionals: number
  linkedServices: number
  totalProfessionals: number
  totalServices: number
  /** Algo da estrutura falta (ex.: a migration 034 não aplicada). */
  setupError?: string
}

export interface AgendaLinkRow {
  internalId: string
  name: string
  durationMinutes?: number
  externalId: string | null
  /** O vínculo veio da sugestão por nome, ainda não salvo. */
  suggested: boolean
}

export interface AgendaLinkingData {
  professionals: AgendaLinkRow[]
  services: AgendaLinkRow[]
  externalProfessionals: AgendaCatalogItem[]
  externalServices: AgendaCatalogItem[]
}

export interface AgendaLinksInput {
  professionals: Array<{ internalId: string; externalId: string | null }>
  services: Array<{ internalId: string; externalId: string | null }>
}

const ok = <T>(data: T): AgendaSetupResult<T> => ({ ok: true, data })
const fail = (error: string): AgendaSetupResult<never> => ({ ok: false, error })

function providerErrorMessage(error: unknown, label: string, savedToken: boolean): string {
  if (isAgendaProviderError(error)) {
    if (error.kind === 'auth') {
      return savedToken
        ? `A ${label} recusou o token salvo (ele pode ter sido revogado). Cole um token novo.`
        : `A ${label} recusou esse token. Confira se copiou o token inteiro e se o recurso de API está ativo na sua conta ${label}.`
    }
    if (error.kind === 'unavailable' || error.kind === 'uncertain') {
      return `Não foi possível falar com a ${label} agora. Tente de novo em instantes.`
    }
  }
  return `Não foi possível concluir com a ${label}. Tente de novo em instantes.`
}

async function findRow(salonId: string, providerId: AgendaProviderId) {
  return db.query.salonIntegrations.findFirst({
    where: and(eq(salonIntegrations.salonId, salonId), eq(salonIntegrations.provider, providerId)),
    columns: { id: true, isActive: true, createdAt: true },
  })
}

async function localCatalog(salonId: string) {
  const [pros, servs] = await Promise.all([
    db.query.professionals.findMany({
      where: and(eq(professionals.salonId, salonId), eq(professionals.isActive, true)),
      columns: { id: true, name: true },
      orderBy: [asc(professionals.name)],
    }),
    db.query.services.findMany({
      where: and(eq(services.salonId, salonId), eq(services.isActive, true), eq(services.isSystem, false)),
      columns: { id: true, name: true, duration: true, durationMax: true },
      orderBy: [asc(services.name)],
    }),
  ])
  return { pros, servs }
}

export async function getAgendaSetupStatus(
  salonId: string,
  providerId: AgendaProviderId
): Promise<AgendaSetupStatus> {
  const available = isAgendaProviderAvailable(providerId)
  const [row, catalog] = await Promise.all([findRow(salonId, providerId), localCatalog(salonId)])
  const base: AgendaSetupStatus = {
    available,
    connected: row !== undefined,
    isActive: row?.isActive ?? false,
    connectedAt: row?.createdAt ? row.createdAt.toISOString() : null,
    linkedProfessionals: 0,
    linkedServices: 0,
    totalProfessionals: catalog.pros.length,
    totalServices: catalog.servs.length,
  }
  if (!row) return base

  try {
    const scope = { salonId, provider: providerId }
    const [linkedProfessionals, linkedServices] = await Promise.all([
      countExternalRefs(scope, 'professional'),
      countExternalRefs(scope, 'service'),
    ])
    return { ...base, linkedProfessionals, linkedServices }
  } catch {
    return { ...base, setupError: 'A tabela de vínculos ainda não existe no banco (migration 034 pendente).' }
  }
}

/**
 * Valida o token na API e guarda cifrado. Conexão nova nasce INATIVA. Token novo
 * num salão já conectado (o antigo foi revogado lá) só troca a credencial —
 * vínculos e ativação continuam.
 */
export async function connectAgenda(
  salonId: string,
  providerId: AgendaProviderId,
  rawToken: string
): Promise<AgendaSetupResult<{ reconnected: boolean }>> {
  const label = AGENDA_PROVIDER_LABELS[providerId]
  const token = normalizePastedToken(rawToken)
  if (!token) return fail('Cole o token para conectar.')
  if (providerId === 'belasis' && !token.startsWith('bpk_')) {
    return fail(
      'Esse não parece um token da Belasis: os tokens dela começam com "bpk_". Copie em Configurações → API → Visualizar Chave.'
    )
  }

  const provider = buildAgendaProvider(providerId, salonId, { token })
  if (!provider) return fail(`A integração com a ${label} não está disponível.`)

  try {
    await provider.testConnection()
  } catch (error) {
    return fail(providerErrorMessage(error, label, false))
  }

  const existing = await findRow(salonId, providerId)
  const sealed = sealAgendaCredentials({ token })
  await db
    .insert(salonIntegrations)
    .values({ salonId, provider: providerId, refreshToken: sealed, accessToken: null, isActive: false })
    .onConflictDoUpdate({
      target: [salonIntegrations.salonId, salonIntegrations.provider],
      // isActive fica de fora de propósito: trocar o token não desliga nada.
      set: { refreshToken: sealed, accessToken: null, updatedAt: new Date() },
    })
  forgetActiveAgendaProvider(salonId) // token novo tem que valer já

  return ok({ reconnected: existing !== undefined })
}

export async function getAgendaLinkingData(
  salonId: string,
  providerId: AgendaProviderId
): Promise<AgendaSetupResult<AgendaLinkingData>> {
  const label = AGENDA_PROVIDER_LABELS[providerId]
  const resolved = await resolveAgendaProviderForSetup(salonId, providerId)
  if (!resolved) return fail(`Conecte a ${label} primeiro.`)

  let externalProfessionals: AgendaCatalogItem[]
  let externalServices: AgendaCatalogItem[]
  try {
    ;[externalProfessionals, externalServices] = await Promise.all([
      resolved.provider.listProfessionals(),
      resolved.provider.listServices(),
    ])
  } catch (error) {
    return fail(providerErrorMessage(error, label, true))
  }

  const scope = { salonId, provider: providerId }
  const [catalog, proRefs, serviceRefs] = await Promise.all([
    localCatalog(salonId),
    listExternalRefs(scope, 'professional'),
    listExternalRefs(scope, 'service'),
  ])

  const build = (
    local: Array<{ id: string; name: string; durationMinutes?: number }>,
    refs: Array<{ internalId: string; externalId: string }>,
    external: AgendaCatalogItem[],
    matchFirstName: boolean
  ): AgendaLinkRow[] => {
    const saved = new Map(refs.map((r) => [r.internalId, r.externalId]))
    const suggestions = suggestLinks(
      local.filter((item) => !saved.has(item.id)),
      external,
      { matchFirstName, taken: saved.values() }
    )
    return local.map((item) => {
      const savedId = saved.get(item.id)
      const suggestedId = suggestions.get(item.id)
      return {
        internalId: item.id,
        name: item.name,
        ...(item.durationMinutes !== undefined ? { durationMinutes: item.durationMinutes } : {}),
        externalId: savedId ?? suggestedId ?? null,
        suggested: savedId === undefined && suggestedId !== undefined,
      }
    })
  }

  return ok({
    professionals: build(catalog.pros, proRefs, externalProfessionals, true),
    services: build(
      catalog.servs.map((s) => ({ id: s.id, name: s.name, durationMinutes: s.durationMax ?? s.duration })),
      serviceRefs,
      externalServices,
      false
    ),
    externalProfessionals,
    externalServices,
  })
}

function duplicated(ids: Array<string | null>): boolean {
  const present = ids.filter((id): id is string => id !== null)
  return new Set(present).size !== present.length
}

export async function saveAgendaLinks(
  salonId: string,
  providerId: AgendaProviderId,
  input: AgendaLinksInput
): Promise<AgendaSetupResult<{ professionals: number; services: number }>> {
  const label = AGENDA_PROVIDER_LABELS[providerId]
  if (!(await findRow(salonId, providerId))) return fail(`Conecte a ${label} primeiro.`)

  if (duplicated(input.professionals.map((p) => p.externalId))) {
    return fail(`O mesmo profissional da ${label} foi escolhido para duas pessoas daqui.`)
  }
  if (duplicated(input.services.map((s) => s.externalId))) {
    return fail(`O mesmo serviço da ${label} foi escolhido para dois serviços daqui.`)
  }

  // Só entidades deste salão — o salonId vem da sessão, os ids vêm do navegador.
  const proIds = input.professionals.map((p) => p.internalId)
  const serviceIds = input.services.map((s) => s.internalId)
  const [ownedPros, ownedServices] = await Promise.all([
    proIds.length
      ? db.query.professionals.findMany({
          where: and(eq(professionals.salonId, salonId), inArray(professionals.id, proIds)),
          columns: { id: true },
        })
      : Promise.resolve([]),
    serviceIds.length
      ? db.query.services.findMany({
          where: and(eq(services.salonId, salonId), inArray(services.id, serviceIds)),
          columns: { id: true },
        })
      : Promise.resolve([]),
  ])
  if (ownedPros.length !== new Set(proIds).size || ownedServices.length !== new Set(serviceIds).size) {
    return fail('Há profissional ou serviço que não pertence a este salão.')
  }

  const scope = { salonId, provider: providerId }
  try {
    await replaceExternalRefs(scope, 'professional', input.professionals)
    await replaceExternalRefs(scope, 'service', input.services)
    const [professionalsLinked, servicesLinked] = await Promise.all([
      countExternalRefs(scope, 'professional'),
      countExternalRefs(scope, 'service'),
    ])
    return ok({ professionals: professionalsLinked, services: servicesLinked })
  } catch {
    return fail('Não foi possível salvar os vínculos (a migration 034 já foi aplicada no banco?).')
  }
}

export async function setAgendaActive(
  salonId: string,
  providerId: AgendaProviderId,
  active: boolean
): Promise<AgendaSetupResult> {
  const label = AGENDA_PROVIDER_LABELS[providerId]
  const row = await findRow(salonId, providerId)
  if (!row) return fail(`Conecte a ${label} primeiro.`)

  if (active) {
    const scope = { salonId, provider: providerId }
    let linked: [number, number]
    try {
      linked = await Promise.all([countExternalRefs(scope, 'professional'), countExternalRefs(scope, 'service')])
    } catch {
      return fail('Não foi possível conferir os vínculos (a migration 034 já foi aplicada no banco?).')
    }
    if (linked[0] === 0 || linked[1] === 0) {
      return fail('Vincule pelo menos um profissional e um serviço antes de ativar.')
    }
  }

  await db
    .update(salonIntegrations)
    .set({ isActive: active, updatedAt: new Date() })
    .where(eq(salonIntegrations.id, row.id))
  forgetActiveAgendaProvider(salonId)
  return ok(undefined)
}

export async function disconnectAgenda(salonId: string, providerId: AgendaProviderId): Promise<AgendaSetupResult> {
  try {
    await deleteAllExternalRefs({ salonId, provider: providerId })
  } catch {
    // A tabela de vínculos pode ainda não existir (migration 034): nada a apagar.
  }
  await db
    .delete(salonIntegrations)
    .where(and(eq(salonIntegrations.salonId, salonId), eq(salonIntegrations.provider, providerId)))
  forgetActiveAgendaProvider(salonId)
  return ok(undefined)
}
