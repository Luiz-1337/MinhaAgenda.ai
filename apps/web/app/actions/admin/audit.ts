"use server"

import { db, adminAuditLogs, eq, desc, sql } from "@repo/db"
import { requireAdmin } from "./_guard"

interface GetAuditLogsParams {
    page?: number
    limit?: number
    action?: string
}

export async function getAuditLogs(params: GetAuditLogsParams = {}) {
    try {
        const auth = await requireAdmin()
        if ("error" in auth) return { error: auth.error }

        const { page = 1, limit = 20, action } = params
        const offset = (page - 1) * limit
        const whereClause = action ? eq(adminAuditLogs.action, action) : undefined

        const logs = await db.query.adminAuditLogs.findMany({
            where: whereClause,
            limit,
            offset,
            orderBy: [desc(adminAuditLogs.createdAt)],
        })

        const totalResult = await db
            .select({ count: sql<number>`count(*)` })
            .from(adminAuditLogs)
            .where(whereClause)

        const total = Number(totalResult[0]?.count || 0)

        return {
            logs,
            pagination: {
                total,
                pages: Math.ceil(total / limit),
                page,
                limit,
            },
        }
    } catch (error) {
        console.error("Error fetching audit logs:", error)
        return { error: "Erro ao buscar registros de auditoria" }
    }
}
