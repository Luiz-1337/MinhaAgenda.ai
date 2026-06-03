import { db, adminAuditLogs } from "@repo/db"
import type { AdminContext } from "@/app/actions/admin/_guard"

export type AdminAuditAction =
    | "user.create"
    | "user.update"
    | "user.email_change"
    | "user.reset_password"
    | "user.delete"
    | "user.bulk_delete"
    | "user.bulk_plan_update"
    | "credits.limit_update"
    | "credits.grant"
    | "credits.reset_usage"
    | "salon.ai_retention"

interface LogAdminActionParams {
    admin: AdminContext
    action: AdminAuditAction
    targetType?: "user" | "salon"
    targetId?: string | null
    targetLabel?: string | null
    details?: Record<string, unknown> | null
}

/**
 * Registra uma ação administrativa na tabela admin_audit_logs.
 *
 * IMPORTANTE: nunca lança. Auditoria é secundária à ação principal — se o
 * insert falhar, apenas logamos no console para não quebrar o fluxo do admin.
 */
export async function logAdminAction(params: LogAdminActionParams): Promise<void> {
    try {
        await db.insert(adminAuditLogs).values({
            adminId: params.admin.id,
            adminEmail: params.admin.email,
            action: params.action,
            targetType: params.targetType ?? null,
            targetId: params.targetId ?? null,
            targetLabel: params.targetLabel ?? null,
            details: params.details ?? null,
        })
    } catch (error) {
        console.error("Falha ao registrar auditoria admin:", error)
    }
}
