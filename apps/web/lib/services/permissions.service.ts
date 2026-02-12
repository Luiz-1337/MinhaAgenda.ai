import { db, salons, professionals, profiles, eq, and, or, inArray } from "@repo/db"

/**
 * Verifica se o usuário tem permissão de gerenciamento no salão.
 * Permite acesso para:
 * 1. Dono do salão (salon.ownerId) - SEMPRE tem acesso total se tier for SOLO
 * 2. Profissionais com cargo de MANAGER ou OWNER
 */
export async function hasSalonPermission(salonId: string, userId: string): Promise<boolean> {
  const salon = await db.query.salons.findFirst({
    where: eq(salons.id, salonId),
    columns: { id: true, ownerId: true }
  })

  if (!salon) return false

  // Se é o owner, verificar se tem tier SOLO para dar acesso total
  if (salon.ownerId === userId) {
    const ownerProfile = await db.query.profiles.findFirst({
      where: eq(profiles.id, userId),
      columns: { tier: true }
    })

    // Se o owner tem tier SOLO, sempre retorna true (acesso total como administrador)
    if (ownerProfile?.tier === 'SOLO') {
      return true
    }

    // Owner de outros planos também tem acesso
    return true
  }

  const pro = await db.query.professionals.findFirst({
    where: and(
      eq(professionals.salonId, salonId),
      eq(professionals.userId, userId),
      inArray(professionals.role, ['MANAGER', 'OWNER'])
    )
  })

  return !!pro
}

