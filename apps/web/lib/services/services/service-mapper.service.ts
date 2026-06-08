/**
 * Mapper para transformação de dados de serviços (INFRASTRUCTURE LAYER)
 */

import { z } from "zod"
import { parseAllowedWeekdays, parseAllowedStartTimes } from "@repo/db"
import { normalizeString, emptyStringToNull } from "@/lib/services/validation.service"
import type { ServicePayload } from "./service.repository"

const priceTypeSchema = z.enum(["fixed", "range"])

const upsertServiceSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(2),
  description: z.string().optional().or(z.literal("")),
  duration: z.number().int().positive(),
  durationMax: z.number().int().positive().nullable().optional(),
  price: z.number().nonnegative(),
  priceType: priceTypeSchema.default("fixed"),
  priceMin: z.number().positive().optional(),
  priceMax: z.number().positive().optional(),
  priceOnRequest: z.boolean().default(false),
  allowedWeekdays: z.array(z.number().int().min(0).max(6)).default([]),
  allowedStartTimes: z.array(z.string().regex(/^([01]?\d|2[0-3]):[0-5]\d$/)).default([]),
  isActive: z.boolean().default(true),
  averageCycleDays: z.number().int().positive().nullable().optional(),
  professionalIds: z.array(z.string().uuid()).default([]),
  specialistProfessionalIds: z.array(z.string().uuid()).default([]),
}).refine(
  (data) => {
    // "Sob avaliação" dispensa preço.
    if (data.priceOnRequest) return true
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
).refine(
  (data) => data.durationMax == null || data.durationMax >= data.duration,
  {
    message: "A duração máxima deve ser maior ou igual à duração.",
    path: ["durationMax"],
  }
)

export type UpsertServiceInput = z.infer<typeof upsertServiceSchema>

export class ServiceMapper {
  /**
   * Valida e prepara o payload do serviço para inserção/atualização
   */
  static prepareServicePayload(data: z.infer<typeof upsertServiceSchema>): ServicePayload {
    const priceOnRequest = data.priceOnRequest ?? false
    return {
      name: normalizeString(data.name),
      description: emptyStringToNull(data.description),
      duration: data.duration,
      durationMax: data.durationMax ?? null,
      price: !priceOnRequest && data.priceType === "fixed" ? data.price.toFixed(2) : "0.00",
      priceType: data.priceType,
      priceMin: !priceOnRequest && data.priceType === "range" && data.priceMin ? data.priceMin.toFixed(2) : null,
      priceMax: !priceOnRequest && data.priceType === "range" && data.priceMax ? data.priceMax.toFixed(2) : null,
      priceOnRequest,
      // Normaliza (dedupe + ordena + valida); vazio => null (sem restrição).
      allowedWeekdays: parseAllowedWeekdays(data.allowedWeekdays),
      allowedStartTimes: parseAllowedStartTimes(data.allowedStartTimes),
      isActive: data.isActive,
      averageCycleDays: data.averageCycleDays ?? null,
    }
  }

  /**
   * Schema para validação de input
   */
  static getValidationSchema() {
    return upsertServiceSchema
  }
}
