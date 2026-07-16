import { cache } from "react"
import { db, salons, professionals, eq, and, inArray } from "@repo/db"

/**
 * Verifica se o usuário tem permissão de gerenciamento no salão.
 * Permite acesso para:
 * 1. Dono do salão (salon.ownerId)
 * 2. Profissionais com cargo de MANAGER ou OWNER
 *
 * Memoizada por request (React.cache): checagens repetidas do mesmo
 * (salonId, userId) dentro de um request custam uma única ida ao banco.
 */
export const hasSalonPermission = cache(
  async (salonId: string, userId: string): Promise<boolean> => {
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
)
