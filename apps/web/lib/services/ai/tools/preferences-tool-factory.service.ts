/**
 * Factory para criação da tool de preferências (APPLICATION LAYER)
 */

import { tool } from "ai"
import { z } from "zod"
import { and, eq } from "drizzle-orm"
import { db, customers, profiles } from "@repo/db"

export class PreferencesToolFactory {
  /**
   * Cria tool para salvar preferências do usuário proativamente
   */
  static create(salonId: string, clientId?: string) {
    const paramsSchema = z.object({
      key: z
        .string()
        .describe(
          "Tipo de preferência. Use: 'favoriteProfessional' para profissional preferido, 'favoriteService' para serviço preferido, 'allergies' para alergias, 'notes' para outras observações importantes."
        ),
      value: z
        .union([z.string(), z.array(z.string()), z.record(z.string(), z.unknown())])
        .describe(
          "Valor da preferência. Para favoriteProfessional, use o nome do profissional. Para allergies, use array de strings ou string. Para notes, use string."
        ),
    })

    return tool({
      description:
        "Salva preferências do cliente no CRM. Chame esta tool PROATIVAMENTE (em background) quando detectar que o usuário expressou uma preferência, como: preferência por profissional específico (ex: 'Só corto com o João'), alergias (ex: 'Tenho alergia a lâmina'), preferência por serviço, ou outras informações relevantes. Não é necessário informar ao usuário que está salvando - faça silenciosamente.",
      inputSchema: paramsSchema,
      execute: async ({ key, value }: z.infer<typeof paramsSchema>) => {
        if (!clientId) {
          return {
            success: false,
            message: "Preferência não salva: cliente não identificado",
          }
        }

        const profile = await db.query.profiles.findFirst({
          where: eq(profiles.id, clientId),
          columns: { phone: true },
        })

        if (!profile?.phone) {
          return {
            success: false,
            message: "Preferência não salva: telefone do cliente não encontrado",
          }
        }

        const normalizedPhone = profile.phone.replace(/\D/g, "")
        const customer = await db.query.customers.findFirst({
          where: and(eq(customers.salonId, salonId), eq(customers.phone, normalizedPhone)),
          columns: { id: true, preferences: true },
        })

        if (!customer) {
          return {
            success: false,
            message: "Preferência não salva: cliente não encontrado no salão",
          }
        }

        const currentPreferences = (customer.preferences as Record<string, unknown>) || {}
        const updatedPreferences = {
          ...currentPreferences,
          [key]: value,
        }

        await db.update(customers).set({
          preferences: updatedPreferences,
          updatedAt: new Date(),
        }).where(eq(customers.id, customer.id))

        return {
          success: true,
          message: `Preferência "${key}" salva com sucesso`,
        }
      },
    })
  }
}
