/**
 * Serviço para contexto do salão (APPLICATION LAYER)
 */

import { db, salons, eq } from "@repo/db"
import { SALON_CONSTANTS } from "@/lib/constants/ai.constants"

export class SalonContextService {
  /**
   * Busca o nome do salão
   */
  static async getSalonName(salonId: string): Promise<string> {
    const salon = await db.query.salons.findFirst({
      where: eq(salons.id, salonId),
      columns: { name: true },
    })

    return salon?.name || SALON_CONSTANTS.DEFAULT_SALON_NAME
  }
}
