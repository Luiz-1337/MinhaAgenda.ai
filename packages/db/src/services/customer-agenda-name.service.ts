/**
 * O nome da cliente serve para criar o cadastro dela na agenda oficial?
 *
 * O cliente nasce aqui com o nome do perfil do WhatsApp. Com agenda oficial
 * (Belasis), o primeiro agendamento cadastra a cliente LÁ com esse nome — em
 * 07/nov/2026 uma cliente foi cadastrada só como "Sil" e a recepção
 * teve de pedir o sobrenome por mensagem três dias depois.
 *
 * Regra: a IA só cria cadastro na agenda oficial com nome que uma PESSOA informou
 * (`customers.name_confirmed_at`). Enquanto não houver, ela pergunta o nome
 * completo. Quem já tem cadastro lá (vínculo guardado) não é perguntado: o
 * cadastro é reaproveitado com o nome que está lá.
 *
 * Vive em @repo/db porque é lida por dois lugares que não podem divergir: a trava
 * das tools (mcp-server) e o bloco do prompt (apps/web).
 */
import { and, eq, sql } from 'drizzle-orm'

import { db } from '../index'
import { customers, integrationExternalRefs } from '../schema'
import { getActiveAgendaProviderId } from './agenda-provider-registry.service'

/**
 * True = antes de agendar, pergunte o nome completo. Só pode dar true em salão
 * com agenda oficial ativa; sem ela, nada muda.
 *
 * Lança se não der para saber qual é a agenda oficial (duas ativas): quem chama
 * trata como "não precisa" — o agendamento trava sozinho mais adiante.
 */
export async function customerNeedsNameForAgenda(input: {
  salonId: string
  customerId: string
}): Promise<boolean> {
  const providerId = await getActiveAgendaProviderId(input.salonId)
  if (!providerId) return false

  const [row] = await db
    .select({
      nameConfirmedAt: customers.nameConfirmedAt,
      linkedThere: sql<boolean>`exists (
        select 1 from ${integrationExternalRefs}
         where ${integrationExternalRefs.salonId} = ${input.salonId}
           and ${integrationExternalRefs.provider} = ${providerId}
           and ${integrationExternalRefs.entityType} = 'customer'
           and ${integrationExternalRefs.internalId} = ${customers.id}
      )`,
    })
    .from(customers)
    .where(and(eq(customers.id, input.customerId), eq(customers.salonId, input.salonId)))
    .limit(1)

  if (!row) return false
  return row.nameConfirmedAt === null && row.linkedThere !== true
}

/**
 * Registra que o nome foi informado por uma pessoa (a própria cliente, pela IA,
 * ou alguém no painel). Não reescreve a data de quem já estava confirmado.
 */
export async function markCustomerNameConfirmed(input: { salonId?: string; customerId: string }): Promise<void> {
  await db
    .update(customers)
    .set({ nameConfirmedAt: new Date() })
    .where(
      and(
        eq(customers.id, input.customerId),
        sql`${customers.nameConfirmedAt} is null`,
        ...(input.salonId ? [eq(customers.salonId, input.salonId)] : [])
      )
    )
}
