"use server"

import { headers } from "next/headers"
import { z } from "zod"
import { signPublicDocumentService } from "@repo/db"
import { formatZodError } from "@/lib/services/validation.service"
import type { ActionResult } from "@/lib/types/common"

/**
 * Documentos com assinatura — formulário PÚBLICO (docs/ROADMAP.md, fase 7, fatia
 * 7e).
 *
 * ESTA ACTION NÃO TEM SESSÃO NEM `authorizeSalon`, DE PROPÓSITO: quem assina é o
 * cliente do salão, que não tem conta. Por isso este arquivo fica FORA da guarda
 * de `__tests__/lib/actions-authz.test.ts` — e por isso ele não pode crescer:
 *
 *   - a única credencial é o token do documento (aleatório, 192 bits, único);
 *   - a única coisa que ele faz é gravar UMA assinatura NAQUELE documento, uma
 *     vez só, enquanto o link vale;
 *   - não recebe `salonId`, `customerId` nem id de documento — nada que escolha
 *     de quem é o dado;
 *   - não devolve dado nenhum do salão ou do cliente.
 *
 * Qualquer action nova que precise de mais do que isso vai para um arquivo com
 * `authorizeSalon`.
 */

const signSchema = z.object({
  token: z.string().max(100),
  signerName: z.string().max(400),
  // O limite de verdade (e o formato PNG) está em domain/customer-documents.ts.
  signatureImage: z.string().max(400000),
  accepted: z.boolean(),
})

export async function signPublicDocument(input: z.infer<typeof signSchema>): Promise<ActionResult> {
  const parsed = signSchema.safeParse(input)
  if (!parsed.success) return { error: formatZodError(parsed.error) }

  // Registro de quem assinou: o endereço e o navegador, como o servidor os viu.
  const requestHeaders = await headers()
  const ip = requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() || null
  const userAgent = requestHeaders.get("user-agent")

  const result = await signPublicDocumentService({ ...parsed.data, ip, userAgent, now: new Date() })
  if (!result.success) return { error: result.error }

  return { success: true, data: undefined }
}
