/**
 * Um cliente por telefone — em qualquer formato.
 *
 * O WhatsApp entrega o número só com dígitos e com DDI ("5511900002222"). Quem
 * cadastra pelo painel digita como quer, e o número ia para o banco sem o 55
 * ("11900002222"). As duas buscas comparavam o texto exato, então a mesma pessoa
 * virava dois cadastros: o do painel, com os agendamentos, e o do WhatsApp, com a
 * conversa. A IA, falando com o segundo, não enxergava os agendamentos do
 * primeiro — "não encontrei nenhum agendamento futuro" — e criava outro.
 * Em 12/nov/2026 havia 9 pares assim em 4 salões.
 *
 * Aqui a comparação é pela chave DDD + 8 últimos dígitos (`phoneMatchKey`), a
 * mesma que a sincronização da agenda oficial já usa, e o número achado em outro
 * formato é regravado no formato do WhatsApp, para as buscas exatas do resto do
 * sistema (tools da IA, lembretes) passarem a achá-lo.
 */
import { and, eq, sql } from 'drizzle-orm'

import { db } from '../index'
import { customers } from '../schema'
import { phoneMatchKey, toE164Digits } from '../utils/phone-match.utils'

export interface CustomerPhoneMatch {
  id: string
  name: string
  phone: string
}

/**
 * O telefone como deve ser gravado: só dígitos, com DDI — o formato que o
 * WhatsApp entrega. O que não é telefone brasileiro reconhecível (id interno do
 * WhatsApp, número estrangeiro curto) fica só com os dígitos, como sempre foi.
 */
export function canonicalCustomerPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  return toE164Digits(digits) ?? digits
}

/**
 * Entre os candidatos, o cadastro que é deste telefone. Sem banco: é o que os
 * testes exercitam.
 *
 * Havendo mais de um (duplicados que já existem), a ordem é: o que tem o número
 * idêntico; depois o que já está no formato do WhatsApp; depois o mais antigo —
 * que é o que costuma ter o histórico.
 */
export function pickCustomerByPhone<T extends { phone: string; createdAt?: Date | null }>(
  candidates: T[],
  phone: string
): T | null {
  const digits = phone.replace(/\D/g, '')
  const key = phoneMatchKey(digits)
  if (!key) return candidates.find((c) => c.phone.replace(/\D/g, '') === digits) ?? null

  const same = candidates.filter((c) => phoneMatchKey(c.phone) === key)
  if (same.length === 0) return null

  const canonical = canonicalCustomerPhone(digits)
  const rank = (c: T) => {
    const stored = c.phone.replace(/\D/g, '')
    if (stored === digits) return 0
    if (stored === canonical || canonicalCustomerPhone(stored) === stored) return 1
    return 2
  }
  return [...same].sort(
    (a, b) => rank(a) - rank(b) || (a.createdAt?.getTime() ?? 0) - (b.createdAt?.getTime() ?? 0)
  )[0]
}

/**
 * O cliente deste salão que tem este telefone, mesmo guardado em outro formato
 * (sem o 55, sem o 9, com parênteses e hífen). Null se não houver.
 */
export async function findCustomerByPhoneAnyFormat(input: {
  salonId: string
  phone: string
}): Promise<CustomerPhoneMatch | null> {
  const digits = input.phone.replace(/\D/g, '')
  if (digits.length < 8) return null

  const candidates = await db
    .select({ id: customers.id, name: customers.name, phone: customers.phone, createdAt: customers.createdAt })
    .from(customers)
    .where(
      and(
        eq(customers.salonId, input.salonId),
        // Só o final: é o que resiste ao DDI, ao 9 e à formatação. Quem decide é
        // a comparação pela chave, logo abaixo.
        sql`regexp_replace(${customers.phone}, '\\D', '', 'g') like ${'%' + digits.slice(-8)}`
      )
    )
    .limit(20)

  const match = pickCustomerByPhone(candidates, digits)
  return match ? { id: match.id, name: match.name, phone: match.phone } : null
}

/**
 * `findCustomerByPhoneAnyFormat` + regrava o número no formato do WhatsApp quando
 * ele estava em outro. É o que a entrada de mensagem usa antes de criar um
 * cliente novo.
 *
 * Se regravar falhar (outro cadastro já tem o número canônico — um duplicado
 * antigo), o cliente achado é devolvido assim mesmo: melhor a conversa cair no
 * cadastro certo com o telefone em formato antigo do que nascer um terceiro.
 */
export async function adoptCustomerByPhone(input: {
  salonId: string
  phone: string
}): Promise<CustomerPhoneMatch | null> {
  const match = await findCustomerByPhoneAnyFormat(input)
  if (!match) return null

  const canonical = canonicalCustomerPhone(input.phone)
  if (match.phone === canonical) return match

  try {
    await db
      .update(customers)
      .set({ phone: canonical, updatedAt: new Date() })
      .where(and(eq(customers.id, match.id), eq(customers.salonId, input.salonId)))
    return { ...match, phone: canonical }
  } catch {
    return match
  }
}
