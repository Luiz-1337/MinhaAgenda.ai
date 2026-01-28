/**
 * Funções compartilhadas entre as classes de tools
 */

import { and, eq } from "drizzle-orm"
import { db, salonIntegrations } from "@repo/db"

/**
 * Tipo de retorno para integrações ativas
 */
export interface ActiveIntegrations {
    google: { isActive: boolean; email?: string } | null
    trinks: { isActive: boolean } | null
}

/**
 * Verifica quais integrações estão ativas para um salão
 */
export async function getActiveIntegrations(salonId: string): Promise<ActiveIntegrations> {
    const [googleIntegration, trinksIntegration] = await Promise.all([
        db.query.salonIntegrations.findFirst({
            where: and(
                eq(salonIntegrations.salonId, salonId),
                eq(salonIntegrations.provider, 'google')
            ),
            columns: { isActive: true, email: true }
        }),
        db.query.salonIntegrations.findFirst({
            where: and(
                eq(salonIntegrations.salonId, salonId),
                eq(salonIntegrations.provider, 'trinks')
            ),
            columns: { isActive: true }
        })
    ])

    return {
        google: googleIntegration?.isActive ? { isActive: true, email: googleIntegration.email || undefined } : null,
        trinks: trinksIntegration?.isActive ? { isActive: true } : null
    }
}
