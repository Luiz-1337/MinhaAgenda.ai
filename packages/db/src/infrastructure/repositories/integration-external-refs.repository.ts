import { and, count, eq, inArray } from 'drizzle-orm'

import { db } from '../../index'
import { integrationExternalRefs } from '../../schema'

/** Tipos de entidade com de-para (CHECK na migration 034). */
export type ExternalRefEntity = 'professional' | 'service' | 'customer' | 'appointment'

/** Todo acesso é por salão + provedor: um de-para nunca vaza entre tenants. */
export interface ExternalRefsScope {
  salonId: string
  provider: string
}

function scoped(scope: ExternalRefsScope, entityType: ExternalRefEntity) {
  return and(
    eq(integrationExternalRefs.salonId, scope.salonId),
    eq(integrationExternalRefs.provider, scope.provider),
    eq(integrationExternalRefs.entityType, entityType)
  )
}

export async function findExternalRefId(
  scope: ExternalRefsScope,
  entityType: ExternalRefEntity,
  internalId: string
): Promise<string | null> {
  const row = await db.query.integrationExternalRefs.findFirst({
    where: and(scoped(scope, entityType), eq(integrationExternalRefs.internalId, internalId)),
    columns: { externalId: true },
  })
  return row?.externalId ?? null
}

export async function findInternalRefId(
  scope: ExternalRefsScope,
  entityType: ExternalRefEntity,
  externalId: string
): Promise<string | null> {
  const row = await db.query.integrationExternalRefs.findFirst({
    where: and(scoped(scope, entityType), eq(integrationExternalRefs.externalId, externalId)),
    columns: { internalId: true },
  })
  return row?.internalId ?? null
}

/**
 * Grava (ou troca) o ID externo de uma entidade local. Lança na violação do
 * índice externo — o mesmo ID de lá já vinculado a OUTRA entidade daqui —, que é
 * erro de cadastro e não pode ser engolido em silêncio.
 */
export async function upsertExternalRef(
  scope: ExternalRefsScope,
  entityType: ExternalRefEntity,
  internalId: string,
  externalId: string
): Promise<void> {
  const now = new Date()
  await db
    .insert(integrationExternalRefs)
    .values({
      salonId: scope.salonId,
      provider: scope.provider,
      entityType,
      internalId,
      externalId,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [
        integrationExternalRefs.salonId,
        integrationExternalRefs.provider,
        integrationExternalRefs.entityType,
        integrationExternalRefs.internalId,
      ],
      set: { externalId, updatedAt: now },
    })
}

export async function deleteExternalRef(
  scope: ExternalRefsScope,
  entityType: ExternalRefEntity,
  internalId: string
): Promise<void> {
  await db
    .delete(integrationExternalRefs)
    .where(and(scoped(scope, entityType), eq(integrationExternalRefs.internalId, internalId)))
}

export async function listExternalRefs(
  scope: ExternalRefsScope,
  entityType: ExternalRefEntity
): Promise<Array<{ internalId: string; externalId: string }>> {
  return db.query.integrationExternalRefs.findMany({
    where: scoped(scope, entityType),
    columns: { internalId: true, externalId: true },
  })
}

export async function countExternalRefs(scope: ExternalRefsScope, entityType: ExternalRefEntity): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(integrationExternalRefs)
    .where(scoped(scope, entityType))
  return Number(row?.n ?? 0)
}

/**
 * Troca de uma vez os vínculos das entidades informadas (externalId null =
 * desvincular). Apaga e regrava na mesma transação: permutar dois vínculos
 * (A→1, B→2 virando A→2, B→1) violaria o índice único se fosse linha a linha.
 * Um id externo atribuído aqui sai de quem o tinha antes (ex.: um profissional
 * desativado que ainda segurava o vínculo).
 */
export async function replaceExternalRefs(
  scope: ExternalRefsScope,
  entityType: ExternalRefEntity,
  pairs: Array<{ internalId: string; externalId: string | null }>
): Promise<void> {
  if (pairs.length === 0) return
  const now = new Date()
  const assigned = pairs
    .map((p) => p.externalId)
    .filter((id): id is string => id !== null)
  await db.transaction(async (tx) => {
    await tx.delete(integrationExternalRefs).where(
      and(
        scoped(scope, entityType),
        inArray(
          integrationExternalRefs.internalId,
          pairs.map((p) => p.internalId)
        )
      )
    )
    if (assigned.length > 0) {
      await tx
        .delete(integrationExternalRefs)
        .where(and(scoped(scope, entityType), inArray(integrationExternalRefs.externalId, assigned)))
    }
    const rows = pairs
      .filter((p): p is { internalId: string; externalId: string } => p.externalId !== null)
      .map((p) => ({
        salonId: scope.salonId,
        provider: scope.provider,
        entityType,
        internalId: p.internalId,
        externalId: p.externalId,
        createdAt: now,
        updatedAt: now,
      }))
    if (rows.length > 0) await tx.insert(integrationExternalRefs).values(rows)
  })
}

/** Ao desconectar: some todo o de-para do salão com aquele provedor. */
export async function deleteAllExternalRefs(scope: ExternalRefsScope): Promise<void> {
  await db
    .delete(integrationExternalRefs)
    .where(
      and(
        eq(integrationExternalRefs.salonId, scope.salonId),
        eq(integrationExternalRefs.provider, scope.provider)
      )
    )
}
