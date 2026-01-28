/**
 * CatalogTools - Operações relacionadas ao catálogo (serviços, produtos, profissionais)
 * 
 * Responsabilidades:
 * - Listar serviços do salão
 * - Listar produtos do salão
 * - Listar profissionais do salão
 */

import { and, eq } from "drizzle-orm"
import { db, services, products, professionals, professionalServices } from "@repo/db"

export class CatalogTools {
    /**
     * Lista serviços do salão
     */
    async getServices(salonId: string, includeInactive?: boolean): Promise<string> {
        const servicesList = await db
            .select({
                id: services.id,
                name: services.name,
                description: services.description,
                duration: services.duration,
                price: services.price,
                isActive: services.isActive,
            })
            .from(services)
            .where(
                and(
                    eq(services.salonId, salonId),
                    includeInactive ? undefined : eq(services.isActive, true)
                )
            )

        return JSON.stringify({
            services: servicesList.map((s) => ({
                ...s,
                price: s.price.toString(),
            })),
            message: `Encontrados ${servicesList.length} serviço(s) disponível(is)`,
        })
    }

    /**
     * Lista produtos do salão
     */
    async getProducts(salonId: string, includeInactive?: boolean): Promise<string> {
        const productsList = await db
            .select({
                id: products.id,
                name: products.name,
                description: products.description,
                price: products.price,
                isActive: products.isActive,
            })
            .from(products)
            .where(
                and(
                    eq(products.salonId, salonId),
                    includeInactive ? undefined : eq(products.isActive, true)
                )
            )

        return JSON.stringify({
            products: productsList.map((p) => ({
                ...p,
                price: p.price.toString(),
            })),
            message: `Encontrados ${productsList.length} produto(s) disponível(is)`,
        })
    }

    /**
     * Lista profissionais do salão com seus serviços
     */
    async getProfessionals(salonId: string, includeInactive?: boolean): Promise<string> {
        const professionalsWithServices = await db
            .select({
                id: professionals.id,
                name: professionals.name,
                isActive: professionals.isActive,
                serviceName: services.name,
            })
            .from(professionals)
            .leftJoin(professionalServices, eq(professionals.id, professionalServices.professionalId))
            .leftJoin(services, eq(professionalServices.serviceId, services.id))
            .where(
                and(
                    eq(professionals.salonId, salonId),
                    includeInactive ? undefined : eq(professionals.isActive, true)
                )
            )

        // Agrupa serviços por profissional
        const professionalsMap = new Map<
            string,
            { id: string; name: string; services: string[]; isActive: boolean }
        >()

        for (const row of professionalsWithServices) {
            if (!professionalsMap.has(row.id)) {
                professionalsMap.set(row.id, {
                    id: row.id,
                    name: row.name,
                    services: [],
                    isActive: row.isActive,
                })
            }

            const professional = professionalsMap.get(row.id)!
            if (row.serviceName) {
                professional.services.push(row.serviceName)
            }
        }

        const professionalsList = Array.from(professionalsMap.values())

        return JSON.stringify({
            professionals: professionalsList,
            message: `Encontrados ${professionalsList.length} profissional(is)`,
        })
    }
}
