/**
 * Gera o relatório por episódio (Markdown legível + sidecar JSON) e um resumo do
 * run. Reports ficam em apps/web/__tests__/replay/reports/ (gitignored — contêm
 * dados reais de clientes).
 */

import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"
import type {
  EpisodeReplayResult,
  ExchangeObservation,
  ExchangeVerdict,
  ToolCallRecord,
} from "../types"

export interface WriteReportResult {
  mdPath: string
  jsonPath: string
}

function yn(b: boolean): string {
  return b ? "✅" : "❌"
}

function isFlagged(v?: ExchangeVerdict): boolean {
  if (!v) return false
  return !v.behaviorOk || v.hallucinatedPriceOrSlot || v.matchedHumanIntent === "no"
}

function renderToolsLine(calls: ToolCallRecord[]): string {
  if (calls.length === 0) return ""
  const parts = calls.map((c) => {
    const short = JSON.stringify(c.input ?? null)
    const input = short.length > 80 ? short.slice(0, 80) + "…" : short
    return c.isError ? `\`${c.name}(${input})\` → ❌ ${c.errorMessage ?? "erro"}` : `\`${c.name}(${input})\` → ok`
  })
  return `   🔧 Tools: ${parts.join(" · ")}`
}

function renderVerdict(v: ExchangeVerdict | undefined): string[] {
  if (!v) return ["⚖️ _(juiz desativado)_"]
  if (v.judgeError) return [`⚖️ ⚠️ juiz indisponível: ${v.judgeError}`]
  const line =
    `⚖️ **Juiz:** comportamento ${yn(v.behaviorOk)} · tools ${yn(v.calledRightTools)} · ` +
    `invenção ${v.hallucinatedPriceOrSlot ? "⚠️ SIM" : "não"} · intenção=${v.matchedHumanIntent} · ` +
    `tom ${yn(v.toneOk)} · 1pergunta ${yn(v.oneQuestionRule)}`
  return [line, `   📝 ${v.notes}`]
}

function renderExchange(obs: ExchangeObservation): string {
  const lines: string[] = [`### Troca ${obs.index + 1}`]
  lines.push(`🧑 **Cliente:** ${obs.clientText.replace(/\n/g, "\n> ")}`)
  lines.push("")
  if (obs.botText === null) {
    lines.push(`🤖 **Bot:** _erro: ${obs.error ?? "sem resposta"}_`)
  } else {
    lines.push(`🤖 **Bot:** ${obs.botText.replace(/\n/g, "\n> ")}`)
    const tools = renderToolsLine(obs.toolCalls)
    if (tools) lines.push(tools)
    const tokens = obs.usage?.totalTokens ?? 0
    lines.push(`   ⏱ ${obs.durationMs}ms · tokens ${tokens}`)
  }
  lines.push("")
  lines.push(`👩 **Humano (Cathe):** ${obs.humanReference ? obs.humanReference.replace(/\n/g, "\n> ") : "_(sem resposta humana nesta troca)_"}`)
  lines.push("")
  lines.push(...renderVerdict(obs.verdict))
  return lines.join("\n")
}

function episodeMarkdown(result: EpisodeReplayResult, runIso: string): string {
  const { episode, observations, totals } = result
  const flagged = observations.filter((o) => isFlagged(o.verdict)).length
  const judged = observations.some((o) => o.verdict && !o.verdict.judgeError)

  const header = [
    `# Replay: ${episode.title}  (\`${episode.id}\`)`,
    `Fonte: ${episode.source} · Run: ${runIso}`,
    `Contexto: customerName=${episode.context.customerName ?? "—"}, isNewCustomer=${episode.context.isNewCustomer}`,
    "",
    "## Resumo",
    `- Trocas: ${totals.exchanges}`,
    `- Trocas com erro de tool: ${totals.toolErrorExchanges}`,
    judged ? `- Sinalizadas pelo juiz: ${flagged}` : `- Juiz: desativado`,
    `- Tokens: in ${totals.inputTokens} / out ${totals.outputTokens} / total ${totals.totalTokens}`,
    `- Duração: ${(result.durationMs / 1000).toFixed(1)}s`,
    "",
    "---",
    "",
  ].join("\n")

  return header + observations.map(renderExchange).join("\n\n---\n\n") + "\n"
}

export async function writeEpisodeReport(
  result: EpisodeReplayResult,
  outDir: string,
  runStamp: string
): Promise<WriteReportResult> {
  await mkdir(outDir, { recursive: true })
  const base = `${result.episode.id}-${runStamp}`
  const mdPath = path.join(outDir, `${base}.md`)
  const jsonPath = path.join(outDir, `${base}.json`)

  await writeFile(mdPath, episodeMarkdown(result, new Date().toISOString()), "utf8")
  await writeFile(jsonPath, JSON.stringify(result, null, 2), "utf8")

  return { mdPath, jsonPath }
}

export async function writeRunSummary(
  results: EpisodeReplayResult[],
  outDir: string,
  runStamp: string
): Promise<string> {
  await mkdir(outDir, { recursive: true })
  const summaryPath = path.join(outDir, `_run-${runStamp}.md`)

  const rows = results.map((r) => {
    const flagged = r.observations.filter((o) => isFlagged(o.verdict)).length
    return `| ${r.episode.id} | ${r.totals.exchanges} | ${r.totals.toolErrorExchanges} | ${flagged} | ${r.totals.totalTokens} |`
  })

  const totalTokens = results.reduce((a, r) => a + r.totals.totalTokens, 0)
  const totalFlagged = results.reduce(
    (a, r) => a + r.observations.filter((o) => isFlagged(o.verdict)).length,
    0
  )

  const md = [
    `# Resumo do run de replay — ${new Date().toISOString()}`,
    "",
    `Episódios: ${results.length} · Tokens totais: ${totalTokens} · Sinalizados: ${totalFlagged}`,
    "",
    "| Episódio | Trocas | Erros tool | Sinalizadas | Tokens |",
    "|---|---|---|---|---|",
    ...rows,
    "",
  ].join("\n")

  await writeFile(summaryPath, md, "utf8")
  return summaryPath
}
