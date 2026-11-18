import { z } from "zod"

/**
 * Schema para consultar o saldo de cashback do cliente atual.
 * Não recebe parâmetros: salão e cliente vêm do closure da tool (contexto do
 * WhatsApp) — a IA nunca escolhe de quem é o saldo.
 */
export const getMyCashbackBalanceSchema = z.object({})

export type GetMyCashbackBalanceInput = z.infer<typeof getMyCashbackBalanceSchema>
