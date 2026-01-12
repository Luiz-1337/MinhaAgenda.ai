/**
 * Mapper para transformação de dados de serviços (INFRASTRUCTURE LAYER)
 */

import { z } from "zod"
import { normalizeString, emptyStringToNull } from "@/lib/services/validation.service"
import type { ServicePayload } from "./service.repository"

const upsertServiceSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(2),
  description: z.string().optional().or(z.literal("")),
  duration: z.number().int().positive(),
  price: z.number().positive(),
  isActive: z.boolean().default(true),
  professionalIds: z.array(z.string().uuid()).default([]),
})

export type UpsertServiceInput = z.infer<typeof upsertServiceSchema>

export class ServiceMapper {
  /**
   * Valida e prepara o payload do serviço para inserção/atualização
   */
  static prepareServicePayload(data: z.infer<typeof upsertServiceSchema>): ServicePayload {
    return {
      name: normalizeString(data.name),
      description: emptyStringToNull(data.description),
      duration: data.duration,
      price: data.price.toFixed(2),
      isActive: data.isActive,
    }
  }

  /**
   * Schema para validação de input
   */
  static getValidationSchema() {
    return upsertServiceSchema
  }
}
