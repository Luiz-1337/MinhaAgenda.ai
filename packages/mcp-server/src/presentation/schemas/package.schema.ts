import { z } from "zod"

/**
 * Schema para consultar o saldo dos pacotes do cliente atual.
 * Não recebe parâmetros: salão e cliente vêm do closure da tool (contexto do
 * WhatsApp) — a IA nunca escolhe de quem é o saldo.
 */
export const getMyPackageBalanceSchema = z.object({})

export type GetMyPackageBalanceInput = z.infer<typeof getMyPackageBalanceSchema>
