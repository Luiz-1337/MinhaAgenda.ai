/**
 * Mapper para transformação de dados de serviços (INFRASTRUCTURE LAYER)
 */

import { z } from "zod"
import { normalizeString, emptyStringToNull } from "@/lib/services/validation.service"
import type { ServicePayload } from "./service.repository"

const priceTypeSchema = z.enum(["fixed", "range"])

const upsertServiceSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(2),
  description: z.string().optional().or(z.literal("")),
  duration: z.number().int().positive(),
  price: z.number().nonnegative(),
  priceType: priceTypeSchema.default("fixed"),
  priceMin: z.number().positive().optional(),
  priceMax: z.number().positive().optional(),
  isActive: z.boolean().default(true),
  professionalIds: z.array(z.string().uuid()).default([]),
}).refine(
  (data) => {
    // Se for preço fixo, o preço deve ser positivo
    if (data.priceType === "fixed") {
      return data.price > 0
    }
    // Se for range, priceMin e priceMax devem existir e priceMin <= priceMax
    if (data.priceType === "range") {
      return (
        data.priceMin !== undefined &&
        data.priceMax !== undefined &&
        data.priceMin > 0 &&
        data.priceMax > 0 &&
        data.priceMin <= data.priceMax
      )
    }
    return true
  },
  {
    message: "Para preço fixo, informe um valor positivo. Para range, o preço mínimo deve ser menor ou igual ao máximo.",
    path: ["price"],
  }
)

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
      price: data.priceType === "fixed" ? data.price.toFixed(2) : "0.00",
      priceType: data.priceType,
      priceMin: data.priceType === "range" && data.priceMin ? data.priceMin.toFixed(2) : null,
      priceMax: data.priceType === "range" && data.priceMax ? data.priceMax.toFixed(2) : null,
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
