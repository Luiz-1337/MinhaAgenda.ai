"use server"

import { z } from "zod"
import {
  parseReportInsightScreen,
  planReportInsightInput,
  type PermissionKey,
  type ReportInsightScreen,
  type ReportInsights,
} from "@repo/db"
import { getSessionUserId } from "@/lib/supabase/auth"
import { can } from "@/lib/services/permissions.service"
import { salonHasModule } from "@/lib/services/salon-modules.service"
import { formatZodError } from "@/lib/services/validation.service"
import { debitSalonCredits, getSalonRemainingCredits } from "@/lib/services/credits.service"
import { generateReportInsights, ReportInsightsError } from "@/lib/services/reports/report-insights.service"
import { getAppointmentReport, getCustomerReport } from "./agenda-reports"
import { getFinanceReport } from "./finance-reports"
import { getProfessionalPanel } from "./professional-panel"
import { getSalesReport } from "./sales-reports"

/**
 * Análise com IA das telas de relatório (docs/ROADMAP.md, fase 9, fatia 9h).
 *
 * Toda action começa em `authorizeSalon`: sessão → módulo `reports` ligado no
 * salão → `reports.access`. O `salonId` chega do cliente, então estar logado não
 * basta (ver __tests__/lib/actions-authz.test.ts).
 *
 * Os números NÃO vêm da tela: a action chama a mesma action que a tela chamou,
 * com os mesmos filtros da URL. Assim a análise só vê o que a pessoa pode ver
 * (cada uma confere a própria permissão de novo) e ninguém manda número forjado
 * para a IA comentar.
 *
 * Custa créditos de IA do salão, como a conversa do WhatsApp. Sem crédito, não
 * gera.
 */

async function authorizeSalon(
  salonId: string,
  permission: PermissionKey
): Promise<{ userId: string } | { error: string }> {
  if (!salonId) return { error: "salonId é obrigatório" }
  const userId = await getSessionUserId()
  if (!userId) return { error: "Não autenticado" }
  if (!(await salonHasModule(salonId, "reports"))) {
    return { error: "Relatórios não estão disponíveis neste salão" }
  }
  if (!(await can(salonId, userId, permission))) {
    return { error: "Você não tem permissão para esta ação" }
  }
  return { userId }
}

/** Os filtros da URL da tela, como chegaram. Cada action de tela valida os seus. */
const querySchema = z.record(z.string().max(40)).refine((query) => Object.keys(query).length <= 10, {
  message: "Filtros demais",
})

const inputSchema = z.object({
  salonId: z.string().uuid(),
  screen: z.string().max(20),
  query: querySchema.optional(),
})

/** A coluna `model` do consumo da análise: linha própria, que o stats-sync não reescreve. */
const LEDGER_SUFFIX = ":relatorios"

export type ReportInsightsResult = {
  insights: ReportInsights
  /** Créditos de IA que esta análise usou. */
  creditsUsed: number
  /** Quando a análise foi gerada (ISO). */
  generatedAt: string
}

type LoadedScreen = { data: unknown; view: string | null; period: { from: string; to: string } | null }

/** Os dados da tela, carregados pela action dela, que confere a permissão de novo. */
async function loadScreen(
  salonId: string,
  screen: ReportInsightScreen,
  query: Record<string, string>
): Promise<LoadedScreen | { error: string }> {
  const pick = (key: string) => query[key] || undefined

  switch (screen) {
    case "finance": {
      const data = await getFinanceReport(salonId, {
        view: pick("view"),
        from: pick("from"),
        to: pick("to"),
        account: pick("account"),
      })
      if ("error" in data) return data
      return { data, view: data.view, period: { from: data.from, to: data.to } }
    }
    case "appointments": {
      const data = await getAppointmentReport(salonId, { view: pick("view"), from: pick("from"), to: pick("to") })
      if ("error" in data) return data
      return { data, view: data.view, period: { from: data.from, to: data.to } }
    }
    case "customers": {
      const data = await getCustomerReport(salonId, { view: pick("view"), month: pick("month"), days: pick("days") })
      if ("error" in data) return data
      return { data, view: data.view, period: null }
    }
    case "sales": {
      const data = await getSalesReport(salonId, { view: pick("view"), from: pick("from"), to: pick("to") })
      if ("error" in data) return data
      // O catálogo (tabela de preços) não tem período.
      return { data, view: data.view, period: "from" in data ? { from: data.from, to: data.to } : null }
    }
    case "professionals": {
      const data = await getProfessionalPanel(salonId, { from: pick("from"), to: pick("to") })
      if ("error" in data) return data
      return { data, view: null, period: { from: data.from, to: data.to } }
    }
  }
}

/**
 * Gera a análise com IA da tela de relatório `screen`, com os filtros `query` da
 * URL dela. Não guarda nada: cada clique é uma análise nova (e um consumo novo).
 */
export async function getReportInsights(input: {
  salonId: string
  screen: string
  query?: Record<string, string>
}): Promise<ReportInsightsResult | { error: string }> {
  const auth = await authorizeSalon(input?.salonId, "reports.access")
  if ("error" in auth) return auth

  const parsed = inputSchema.safeParse(input)
  if (!parsed.success) return { error: formatZodError(parsed.error) }

  const { salonId } = parsed.data
  const screen = parseReportInsightScreen(parsed.data.screen)
  if (!screen) return { error: "Esta tela não tem análise com IA" }

  const loaded = await loadScreen(salonId, screen, parsed.data.query ?? {})
  if ("error" in loaded) return loaded

  // Quando as linhas são clientes, o `name` delas é nome de cliente.
  const customerRows = screen === "customers" || (screen === "sales" && loaded.view === "customers")
  const facts = planReportInsightInput(loaded.data, { dropKeys: customerRows ? ["name"] : [] })
  if (!facts.ok) return { error: facts.error }

  const credits = await getSalonRemainingCredits(salonId)
  if ("error" in credits) return { error: "Não foi possível conferir os créditos de IA do salão" }
  if (credits.remaining <= 0) {
    return { error: "Os créditos de IA deste mês acabaram. A análise volta quando houver crédito" }
  }

  let generation
  try {
    generation = await generateReportInsights({
      screen,
      view: loaded.view,
      period: loaded.period,
      factsJson: facts.json,
    })
  } catch (error) {
    if (error instanceof ReportInsightsError) return { error: error.message }
    console.error("Erro ao gerar a análise do relatório:", error)
    return { error: "Não foi possível gerar a análise agora. Tente de novo em alguns minutos" }
  }

  // Débito depois da análise pronta. Se falhar, a análise já foi feita: mostra e
  // registra o erro, em vez de jogar fora o que o salão pediu.
  let creditsUsed = 0
  try {
    creditsUsed = await debitSalonCredits(
      salonId,
      generation.usage.totalTokens,
      generation.model,
      generation.usage.cachedTokens,
      `${generation.model}${LEDGER_SUFFIX}`
    )
  } catch (error) {
    console.error("Análise do relatório gerada, mas o débito de créditos falhou:", error)
  }

  return { insights: generation.insights, creditsUsed, generatedAt: new Date().toISOString() }
}
