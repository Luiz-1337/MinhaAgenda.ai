import { db, salons, professionals } from "@repo/db"
import { eq, and, or, inArray } from "drizzle-orm"

/**
 * Verifica se o usuário tem permissão de gerenciamento no salão.
 * Permite acesso para:
 * 1. Dono do salão (salon.ownerId)
 * 2. Profissionais com cargo de MANAGER ou OWNER
 */
export async function hasSalonPermission(salonId: string, userId: string): Promise<boolean> {
  const salon = await db.query.salons.findFirst({
    where: eq(salons.id, salonId),
    columns: { id: true, ownerId: true }
  })

  if (!salon) return false

  if (salon.ownerId === userId) return true

  const pro = await db.query.professionals.findFirst({
    where: and(
      eq(professionals.salonId, salonId),
      eq(professionals.userId, userId),
      inArray(professionals.role, ['MANAGER', 'OWNER'])
    )
  })

  return !!pro
}

