/**
 * Base class para server actions autenticadas (APPLICATION LAYER)
 */

import { createClient } from "@/lib/supabase/server"
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
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return { error: "Unauthorized" }
    }

    return { success: true, data: { userId: user.id } }
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

    const hasAccess = await hasSalonPermission(salonId, authResult.data?.userId!)

    if (!hasAccess) {
      return { error: "Acesso negado a este salão" }
    }

    return {
      success: true,
      data: {
        userId: authResult.data!.userId,
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
