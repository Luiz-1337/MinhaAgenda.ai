/**
 * Origem do lead no cliente (customers.lead_source, migration 035).
 *
 * Quem sabe a origem é o canal: a WhatsApp Cloud API manda `referral` na mensagem
 * que nasce de um clique em anúncio (messages.ad_referral, migration 031). A
 * entrada de mensagem classifica (`paid_traffic` × `organic`) e chama aqui.
 *
 * A marca só SOBE: orgânico que depois clica num anúncio vira tráfego; quem veio
 * de tráfego não volta a ser orgânico por mandar uma mensagem sem anúncio — toda
 * mensagem depois da primeira chega sem `referral`.
 *
 * Os agendamentos copiam a marca do cliente ao serem criados
 * (createAppointmentService), e é por ela que a agenda oficial pinta o
 * agendamento de tráfego.
 */
import { and, eq, isNull, or, sql, type SQL } from 'drizzle-orm'

import { db } from '../index'
import { customers } from '../schema'
import type { LeadSource } from '../domain/constants'

/**
 * Grava a origem. A regra de "só sobe" está no WHERE: é um UPDATE condicional e
 * idempotente, que pode ser chamado a cada mensagem — depois da primeira não
 * encontra o que mudar — e duas mensagens chegando juntas não conseguem rebaixar
 * tráfego para orgânico.
 */
export async function recordCustomerLeadSource(input: {
  salonId: string
  customerId: string
  source: LeadSource
}): Promise<void> {
  await db
    .update(customers)
    .set({ leadSource: input.source })
    .where(
      and(
        eq(customers.id, input.customerId),
        eq(customers.salonId, input.salonId),
        leadSourceMayBecome(input.source)
      )
    )
}

/**
 * Em que linhas a marca pode virar `source` — a regra de "só sobe", como condição
 * do UPDATE:
 * - para tráfego pago: quem está vazio ou é orgânico;
 * - para orgânico: só quem está vazio. Tráfego nunca volta a orgânico.
 */
export function leadSourceMayBecome(source: LeadSource): SQL {
  if (source === 'paid_traffic') {
    return or(isNull(customers.leadSource), sql`${customers.leadSource} <> 'paid_traffic'`) as SQL
  }
  return isNull(customers.leadSource)
}
