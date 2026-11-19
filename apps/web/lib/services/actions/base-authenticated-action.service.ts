/**
 * Base class para server actions autenticadas (APPLICATION LAYER)
 */

import { getSessionUserId } from "@/lib/supabase/auth"
import { hasSalonPermission } from "@/lib/services/permissions.service"
import type { ActionResult } from "@/lib/types/common"

interface AuthResult {
  userId: string
}

interface PermissionResult extends AuthResult {
  hasAccess: boolean
}

export abstract class BaseAuthenticatedAction {
  /**
   * Valida autenticação do usuário
   */
  public static async authenticate(): Promise<ActionResult<AuthResult>> {
    const userId = await getSessionUserId()

    if (!userId) {
      return { error: "Unauthorized" }
    }

    return { success: true, data: { userId } }
  }

  /**
   * Valida autenticação e permissão no salão
   */
  public static async authenticateAndAuthorize(
    salonId: string
  ): Promise<ActionResult<PermissionResult>> {
    const authResult = await this.authenticate()
    if ("error" in authResult) {
      return authResult
    }

    // authenticate() sempre devolve data no sucesso; sem userId, nega acesso.
    const userId = authResult.data?.userId
    const hasAccess = userId ? await hasSalonPermission(salonId, userId) : false

    if (!userId || !hasAccess) {
      return { error: "Acesso negado a este salão" }
    }

    return {
      success: true,
      data: {
        userId,
        hasAccess: true,
      },
    }
  }

  /**
   * Valida que salonId está presente
   */
  public static validateSalonId(salonId: string | undefined | null): void {
    if (!salonId) {
      throw new Error("salonId é obrigatório")
    }
  }
}
