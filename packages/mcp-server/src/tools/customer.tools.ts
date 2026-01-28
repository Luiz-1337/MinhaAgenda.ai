/**
 * CustomerTools - Operações relacionadas a clientes
 * 
 * Responsabilidades:
 * - Identificar clientes existentes
 * - Criar novos clientes
 * - Atualizar dados de clientes
 */

import { and, eq } from "drizzle-orm"
import { db, profiles, customers } from "@repo/db"

export class CustomerTools {
    /**
     * Identifica ou cria um cliente pelo telefone
     */
    async identifyCustomer(phone: string, name?: string, salonId?: string): Promise<string> {
        // Busca cliente existente
        const existing = await db.query.profiles.findFirst({
            where: eq(profiles.phone, phone),
            columns: { id: true, fullName: true, phone: true },
        })

        let profileId: string
        let created = false

        if (existing) {
            profileId = existing.id
        } else if (name) {
            // Se não encontrado e nome fornecido, cria novo cliente
            // Email temporário baseado no telefone (schema requer email notNull)
            const [newProfile] = await db
                .insert(profiles)
                .values({
                    phone,
                    fullName: name,
                    email: `${phone.replace(/\D/g, '')}@temp.com`,
                })
                .returning({ id: profiles.id, fullName: profiles.fullName, phone: profiles.phone })

            profileId = newProfile.id
            created = true
        } else {
            // Cliente não encontrado e sem nome para criar
            return JSON.stringify({ found: false })
        }

        return JSON.stringify({
            id: profileId,
            name: existing?.fullName || name,
            phone: existing?.phone || phone,
            found: !created,
            created: created,
        })
    }

    /**
     * Cria um novo cliente explicitamente
     */
    async createCustomer(phone: string, name: string, salonId?: string): Promise<string> {
        // Verifica se o cliente já existe
        const existing = await db.query.profiles.findFirst({
            where: eq(profiles.phone, phone),
            columns: { id: true, fullName: true, phone: true },
        })

        let profileId: string
        let alreadyExists = false

        if (existing) {
            profileId = existing.id
            alreadyExists = true
        } else {
            // Cria novo cliente
            const [newProfile] = await db
                .insert(profiles)
                .values({
                    phone,
                    fullName: name,
                    email: `${phone.replace(/\D/g, '')}@temp.com`,
                })
                .returning({ id: profiles.id, fullName: profiles.fullName, phone: profiles.phone })

            profileId = newProfile.id
        }

        // Se salonId foi fornecido, garante que existe customer
        if (salonId && phone) {
            const normalizedPhone = phone.replace(/\D/g, "")
            const existingCustomer = await db.query.customers.findFirst({
                where: and(
                    eq(customers.salonId, salonId),
                    eq(customers.phone, normalizedPhone)
                ),
                columns: { id: true },
            })

            if (!existingCustomer) {
                await db.insert(customers).values({
                    salonId,
                    name: existing?.fullName || name,
                    phone: normalizedPhone,
                })
            }
        }

        return JSON.stringify({
            id: profileId,
            name: existing?.fullName || name,
            phone: existing?.phone || phone,
            alreadyExists: alreadyExists,
            created: !alreadyExists,
            message: alreadyExists
                ? "Cliente já existe no sistema"
                : "Cliente criado com sucesso",
        })
    }

    /**
     * Atualiza o nome de um cliente
     */
    async updateCustomerName(customerId: string, name: string): Promise<string> {
        if (!name || name.trim() === "") {
            throw new Error("Nome não pode ser vazio")
        }

        const trimmedName = name.trim()

        const customer = await db.query.customers.findFirst({
            where: eq(customers.id, customerId),
            columns: { id: true, name: true, phone: true },
        })

        if (!customer) {
            throw new Error(`Cliente com ID ${customerId} não encontrado`)
        }

        const [updatedCustomer] = await db
            .update(customers)
            .set({
                name: trimmedName,
                updatedAt: new Date(),
            })
            .where(eq(customers.id, customerId))
            .returning({
                id: customers.id,
                name: customers.name,
                phone: customers.phone,
            })

        return JSON.stringify({
            id: updatedCustomer.id,
            name: updatedCustomer.name,
            phone: updatedCustomer.phone,
            message: "Nome atualizado com sucesso",
        })
    }
}
