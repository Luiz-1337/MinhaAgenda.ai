import { z } from "zod"

/**
 * Validação de FORMATO das entradas de avaliações. A regra (nota de 1 a 5, uma
 * resposta só, tamanho dos textos) fica em `@repo/db` domain/reviews.ts.
 */

const calendarDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida")

export const reviewFiltersSchema = z.object({
  from: calendarDate.optional(),
  to: calendarDate.optional(),
})

export const saveReviewSettingsSchema = z.object({
  salonId: z.string().uuid(),
  isEnabled: z.boolean(),
  title: z.string().max(200, "Título muito longo").nullable(),
  welcomeText: z.string().max(1000, "Texto de boas-vindas muito longo").nullable(),
  thanksText: z.string().max(1000, "Texto de agradecimento muito longo").nullable(),
})

export const reviewRefSchema = z.object({
  salonId: z.string().uuid(),
  reviewId: z.string().uuid(),
})

/** O que o formulário público envia. O token é a credencial. */
export const submitPublicReviewSchema = z.object({
  token: z.string().regex(/^[A-Za-z0-9_-]{32,64}$/, "Link de avaliação inválido"),
  rating: z.number().int().min(1, "Escolha uma nota de 1 a 5").max(5, "Escolha uma nota de 1 a 5"),
  comment: z.string().max(1000, "Comentário muito longo").nullish(),
})
