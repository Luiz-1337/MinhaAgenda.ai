import { eq } from "drizzle-orm"

import { db, professionals } from "../index"

/**
 * Resolve todos os `professionals.id` que representam a MESMA pessoa física
 * a partir de um `person_key`, inclusive em salões diferentes (e contas diferentes).
 *
 * Usado para unir livre/ocupado e travar o booking por pessoa, evitando
 * double-booking de um profissional que atende em mais de um salão.
 *
 * Se `personKey` for nulo (profissional legado / sem vínculo), retorna apenas o
 * `fallbackProfessionalId` — comportamento idêntico ao anterior (sem união cross-salão).
 *
 * @param personKey - person_key do profissional (pode ser null)
 * @param fallbackProfessionalId - id usado quando não há personKey
 * @returns Lista de professionals.id da pessoa (sempre contém ao menos o fallback)
 */
export async function getPersonProfessionalIdsByKey(
  personKey: string | null | undefined,
  fallbackProfessionalId: string
): Promise<string[]> {
  if (!personKey) {
    return [fallbackProfessionalId]
  }

  const rows = await db
    .select({ id: professionals.id })
    .from(professionals)
    .where(eq(professionals.personKey, personKey))

  const ids = rows.map((r) => r.id)
  return ids.length > 0 ? ids : [fallbackProfessionalId]
}

/**
 * Carrega o `person_key` de um profissional e resolve todos os `professionals.id`
 * da mesma pessoa. Conveniência para chamadores que só têm o `professionalId`.
 *
 * @param professionalId - id do profissional
 * @returns Lista de professionals.id da pessoa (fallback: `[professionalId]`)
 */
export async function getPersonProfessionalIds(professionalId: string): Promise<string[]> {
  const prof = await db.query.professionals.findFirst({
    where: eq(professionals.id, professionalId),
    columns: { id: true, personKey: true },
  })

  if (!prof) {
    return [professionalId]
  }

  return getPersonProfessionalIdsByKey(prof.personKey, prof.id)
}
