import { listCustomerPackageBalancesService, type CustomerPackageBalance } from "@repo/db"
import { getMyPackageBalanceSchema } from "../schemas"
import { defineTool } from "./defineTool"
import { resolveCustomerId } from "./tool-helpers"
import type { ToolContext, ToolSet } from "./types"

/** "2026-12-17" → "17/12/2026". */
function formatDay(day: string): string {
  const [year, month, date] = day.split("-")
  return `${date}/${month}/${year}`
}

export type PackageBalanceResult = {
  /** Pacotes com saldo, dentro da validade. */
  total: number
  packages: {
    pacote: string
    compradoEm: string
    /** "dd/mm/aaaa" ou "não vence". */
    validoAte: string
    itens: { item: string; tipo: "serviço" | "produto"; saldo: number; de: number }[]
  }[]
  message: string
}

/**
 * Agrupa as linhas com saldo por pacote, no formato que a IA lê. Sem ids: usar o
 * pacote é com a recepção, na comanda — a IA só informa.
 */
export function presentPackageBalance(rows: readonly CustomerPackageBalance[]): PackageBalanceResult {
  const byPackage = new Map<string, PackageBalanceResult["packages"][number]>()

  for (const row of rows) {
    const entry = byPackage.get(row.customerPackageId) ?? {
      pacote: row.packageName,
      compradoEm: formatDay(row.soldOn),
      validoAte: row.expiresOn ? formatDay(row.expiresOn) : "não vence",
      itens: [],
    }
    entry.itens.push({
      item: row.description,
      tipo: row.kind === "service" ? "serviço" : "produto",
      saldo: row.remaining,
      de: row.quantity,
    })
    byPackage.set(row.customerPackageId, entry)
  }

  const packages = Array.from(byPackage.values())

  return {
    total: packages.length,
    packages,
    message:
      packages.length === 0
        ? "O cliente não tem pacote com saldo dentro da validade. Não invente saldo: se ele disser que comprou um pacote, diga que a equipe do salão confirma."
        : `${packages.length} pacote(s) com saldo. Informe o saldo e a validade. O uso do pacote é registrado pela equipe no atendimento.`,
  }
}

/**
 * Cria as tools de pacotes (docs/ROADMAP.md, fase 5, fatia 5d).
 *
 * Só leitura, e só do cliente da conversa: salão e telefone vêm do contexto (o
 * webhook do WhatsApp), nunca do modelo. O app só entrega esta tool à IA nos
 * salões com o módulo `packages` ligado (generate-response.service.ts).
 */
export function createPackageTools(ctx: ToolContext): ToolSet {
  return {
    getMyPackageBalance: defineTool(ctx, {
      description:
        "Consulta o saldo dos PACOTES pré-pagos do cliente atual: quantas sessões (ou produtos) de cada pacote ele ainda tem e até quando valem. " +
        "Use quando o cliente perguntar quanto ainda tem no pacote, se o pacote venceu, ou disser que quer usar o pacote. " +
        "NÃO precisa de parâmetros — o cliente é identificado automaticamente pelo número do WhatsApp da sessão. NUNCA peça telefone ao cliente. " +
        "Só informa: NÃO vende pacote, NÃO informa preço de pacote e NÃO baixa saldo — o uso é registrado pela equipe do salão no atendimento. " +
        "Se a consulta não trouxer pacote, NÃO invente saldo.",
      inputSchema: getMyPackageBalanceSchema,
      handler: async (_input, { salonId }) => {
        let customerId: string
        try {
          customerId = await resolveCustomerId(ctx)
        } catch {
          // Sem cadastro não há pacote: é uma resposta, não um erro técnico (o erro
          // de uma tool vira mensagem pronta ao cliente — ver handleToolErrors).
          return presentPackageBalance([])
        }

        const rows = await listCustomerPackageBalancesService({ salonId, customerId, now: new Date() })
        return presentPackageBalance(rows)
      },
    }),
  }
}
