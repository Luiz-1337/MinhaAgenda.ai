/**
 * SalonTools - Operações relacionadas ao salão
 * 
 * Responsabilidades:
 * - Informações do salão
 * - Preferências de clientes
 * - Qualificação de leads
 * - Verificação de integrações
 */

import { and, eq } from "drizzle-orm"
import { db, salons, customers, leads, salonIntegrations } from "@repo/db"

export class SalonTools {
    /**
     * Busca detalhes do salão
     */
    async getSalonDetails(salonId?: string): Promise<string> {
        if (!salonId) {
            throw new Error("salonId é obrigatório. Forneça como parâmetro.")
        }

        const salon = await db.query.salons.findFirst({
            where: eq(salons.id, salonId),
            columns: {
                id: true,
                name: true,
                address: true,
                phone: true,
                description: true,
                settings: true,
                workHours: true,
            },
        })

        if (!salon) {
            throw new Error(`Salão com ID ${salonId} não encontrado`)
        }

        const settings = (salon.settings as Record<string, unknown>) || {}
        const workHours = (salon.workHours as Record<string, { start: string; end: string }> | null) || null
        const cancellationPolicy = settings.cancellation_policy as string | undefined

        return JSON.stringify({
            id: salon.id,
            name: salon.name,
            address: salon.address || null,
            phone: salon.phone || null,
            description: salon.description || null,
            cancellationPolicy,
            businessHours: workHours,
            settings,
            message: "Informações do salão recuperadas com sucesso",
        })
    }

    /**
     * Salva preferência do cliente
     */
    async saveCustomerPreference(
        salonId: string, 
        customerId: string, 
        key: string, 
        value: string | number | boolean
    ): Promise<string> {
        let customer = await db.query.customers.findFirst({
            where: and(
                eq(customers.salonId, salonId),
                eq(customers.id, customerId)
            ),
            columns: { id: true, preferences: true },
        })

        if (!customer) {
            customer = await db.query.customers.findFirst({
                where: and(
                    eq(customers.salonId, salonId),
                    eq(customers.phone, customerId.replace(/\D/g, ""))
                ),
                columns: { id: true, preferences: true },
            })
        }

        const currentPreferences = (customer?.preferences as Record<string, unknown>) || {}

        const updatedPreferences = {
            ...currentPreferences,
            [key]: value,
        }

        if (customer) {
            await db
                .update(customers)
                .set({ 
                    preferences: updatedPreferences,
                    updatedAt: new Date()
                })
                .where(eq(customers.id, customer.id))
        } else {
            return JSON.stringify({
                error: "Cliente não encontrado no salão",
            })
        }

        return JSON.stringify({
            message: `Preferência "${key}" salva com sucesso para o cliente`,
        })
    }

    /**
     * Qualifica um lead
     */
    async qualifyLead(
        salonId: string, 
        phoneNumber: string, 
        interest: "high" | "medium" | "low" | "none", 
        notes?: string
    ): Promise<string> {
        let lead = await db.query.leads.findFirst({
            where: and(
                eq(leads.salonId, salonId),
                eq(leads.phoneNumber, phoneNumber)
            ),
            columns: { id: true },
        })

        const statusMap: Record<string, string> = {
            high: "recently_scheduled",
            medium: "new",
            low: "cold",
            none: "cold",
        }

        if (lead) {
            await db
                .update(leads)
                .set({
                    status: statusMap[interest] as any,
                    notes: notes || undefined,
                    lastContactAt: new Date(),
                })
                .where(eq(leads.id, lead.id))
        } else {
            await db.insert(leads).values({
                salonId,
                phoneNumber,
                status: statusMap[interest] as any,
                notes: notes || null,
                lastContactAt: new Date(),
            })
        }

        const interestMap: Record<string, string> = {
            high: "alto",
            medium: "médio",
            low: "baixo",
            none: "nenhum",
        }

        return JSON.stringify({
            message: `Lead qualificado com interesse ${interestMap[interest]}`,
        })
    }

    /**
     * Verifica se o salão tem integração com Google Calendar
     */
    async hasGoogleCalendarIntegration(salonId: string): Promise<boolean> {
        const integration = await db.query.salonIntegrations.findFirst({
            where: eq(salonIntegrations.salonId, salonId),
            columns: { id: true, refreshToken: true },
        })

        return !!integration && !!integration.refreshToken
    }
}
