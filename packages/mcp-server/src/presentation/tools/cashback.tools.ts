import { getCustomerCashbackService, type CashbackStatus } from "@repo/db"
import { getMyCashbackBalanceSchema } from "../schemas"
import { defineTool } from "./defineTool"
import { resolveCustomerId } from "./tool-helpers"
import type { ToolContext, ToolSet } from "./types"

/** "12.50" → "R$ 12,50". */
function formatMoney(value: string): string {
  const amount = Number(value)
  const safe = Number.isFinite(amount) ? amount : 0
  return `R$ ${safe.toFixed(2).replace(".", ",")}`
}

export type CashbackBalanceResult = {
  /** O salão está com o cashback ativado. */
  programaAtivo: boolean
  /** "R$ 12,50". */
  saldo: string
  /** O saldo mínimo para usar. "R$ 0,00" = não há mínimo. */
  minimoParaUsar: string
  /** O saldo já pode ser usado numa comanda. */
  podeUsar: boolean
  message: string
}

/**
 * O saldo no formato que a IA lê. Sem extrato e sem ids: a IA só informa quanto o
 * cliente tem — usar o saldo é com a equipe, na hora de fechar a comanda.
 */
export function presentCashbackBalance(input: {
  isEnabled: boolean
  balance: string
  minRedeem: string
  status: CashbackStatus
}): CashbackBalanceResult {
  const saldo = formatMoney(input.balance)
  const minimoParaUsar = formatMoney(input.minRedeem)

  if (!input.isEnabled) {
    return {
      programaAtivo: false,
      saldo,
      minimoParaUsar,
      podeUsar: false,
      message:
        "O salão não está com o programa de cashback ativo no momento. NÃO informe saldo nem prometa cashback: diga que a equipe do salão confirma.",
    }
  }

  const message =
    input.status === "available"
      ? `O cliente tem ${saldo} de cashback e já pode usar. Informe o saldo. O desconto é aplicado pela equipe no fechamento da comanda — você não aplica nem reserva.`
      : input.status === "below_minimum"
        ? `O cliente tem ${saldo} de cashback, mas o mínimo para usar é ${minimoParaUsar}. Informe o saldo e quanto falta para poder usar.`
        : "O cliente não tem saldo de cashback. Não invente saldo nem diga quanto ele vai ganhar: as regras de quanto cada serviço rende são do salão."

  return { programaAtivo: true, saldo, minimoParaUsar, podeUsar: input.status === "available", message }
}

/**
 * Cria as tools de cashback (docs/ROADMAP.md, fase 6, fatia 6f).
 *
 * Só leitura, e só do cliente da conversa: salão e telefone vêm do contexto (o
 * webhook do WhatsApp), nunca do modelo. O app só entrega esta tool à IA nos
 * salões com o módulo `cashback` ligado (generate-response.service.ts).
 */
export function createCashbackTools(ctx: ToolContext): ToolSet {
  return {
    getMyCashbackBalance: defineTool(ctx, {
      description:
        "Consulta o saldo de CASHBACK do cliente atual: quanto ele acumulou no salão e se já pode usar. " +
        "Use quando o cliente perguntar se tem cashback, quanto tem de saldo ou crédito, ou se pode usar o cashback no próximo atendimento. " +
        "NÃO precisa de parâmetros — o cliente é identificado automaticamente pelo número do WhatsApp da sessão. NUNCA peça telefone ao cliente. " +
        "Só informa: NÃO aplica desconto, NÃO reserva saldo e NÃO promete quanto um serviço vai render — o cashback é usado pela equipe no fechamento da comanda. " +
        "Se a consulta não trouxer saldo, NÃO invente.",
      inputSchema: getMyCashbackBalanceSchema,
      handler: async (_input, { salonId }) => {
        let customerId: string
        try {
          customerId = await resolveCustomerId(ctx)
        } catch {
          // Sem cadastro não há saldo: é uma resposta, não um erro técnico (o erro
          // de uma tool vira mensagem pronta ao cliente — ver handleToolErrors).
          return presentCashbackBalance({ isEnabled: true, balance: "0.00", minRedeem: "0.00", status: "empty" })
        }

        // limit 0: só o saldo e a configuração; o extrato não vai para a IA.
        const cashback = await getCustomerCashbackService({ salonId, customerId, limit: 0 })
        return presentCashbackBalance(cashback)
      },
    }),
  }
}
