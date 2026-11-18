"use server"

import { submitPublicReviewService } from "@repo/db"
import { formatZodError } from "@/lib/services/validation.service"
import { submitPublicReviewSchema } from "@/lib/schemas/reviews.schema"
import type { ActionResult } from "@/lib/types/common"

/**
 * Avaliação pós-atendimento — formulário PÚBLICO (docs/ROADMAP.md, fase 6, fatia
 * 6c).
 *
 * ESTA ACTION NÃO TEM SESSÃO NEM `authorizeSalon`, DE PROPÓSITO: quem responde é o
 * cliente do salão, que não tem conta. Por isso este arquivo fica FORA da guarda
 * de `__tests__/lib/actions-authz.test.ts` — e por isso ele não pode crescer:
 *
 *   - a única credencial é o token do pedido (aleatório, 192 bits, único);
 *   - a única coisa que ele faz é gravar UMA nota e UM comentário NAQUELE pedido;
 *   - não recebe `salonId`, `customerId` nem id de comanda — nada que escolha de
 *     quem é o dado;
 *   - não devolve dado nenhum do salão ou do cliente.
 *
 * Qualquer action nova que precise de mais do que isso vai para um arquivo com
 * `authorizeSalon`.
 */
export async function submitPublicReview(input: {
  token: string
  rating: number
  comment?: string | null
}): Promise<ActionResult> {
  const parsed = submitPublicReviewSchema.safeParse(input)
  if (!parsed.success) return { error: formatZodError(parsed.error) }

  const result = await submitPublicReviewService({
    token: parsed.data.token,
    rating: parsed.data.rating,
    comment: parsed.data.comment ?? null,
    now: new Date(),
  })
  if (!result.success) return { error: result.error }

  return { success: true, data: undefined }
}
