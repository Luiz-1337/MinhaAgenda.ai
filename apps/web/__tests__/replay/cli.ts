/**
 * CLI do harness de replay. Lê transcripts reais, reescreve datas para o futuro,
 * roda cada episódio contra o bot real (generateAIResponse), opcionalmente julga
 * com IA, e grava relatórios Markdown + JSON.
 *
 * Roda no contexto do pacote `web` (cwd=apps/web) para que `@/` e `@repo/db`
 * resolvam via apps/web/tsconfig.json (mesmo padrão do script `worker`).
 *
 * Uso:
 *   pnpm --filter web replay -- --episode alina-1 --no-judge
 *   pnpm replay -- --episode alina --limit 1
 *
 * Opções:
 *   --episode <id|substr>   id/substring do episódio ou nome do arquivo (repetível; default: todos)
 *   --salon <uuid>          sobrescreve REPLAY_SALON_ID
 *   --phone <e164>          sobrescreve o telefone do cliente simulado
 *   --judge / --no-judge    liga/desliga o juiz IA (default: ligado)
 *   --out <dir>             diretório de saída (default: __tests__/replay/reports)
 *   --limit <n>             limita o nº de episódios
 */

import { parseArgs } from "node:util"
import { readdir } from "node:fs/promises"
import path from "node:path"
import dotenv from "dotenv"

// Fallback de env (o wrapper `dotenv -e ../../.env` já carrega; isto cobre `tsx` direto).
dotenv.config({ path: path.resolve(__dirname, "../../../../.env") })

import { readAndParseFile } from "./parser/whatsapp-parser"
import { applyShiftToEpisode } from "./dateshift/date-shifter"
import { loadReplayEnv } from "./runner/env"
import { runEpisode } from "./runner/replay-runner"
import { judgeEpisode } from "./judge/judge"
import { buildSalonSummary } from "./judge/salon-summary"
import { writeEpisodeReport, writeRunSummary } from "./report/markdown"
import type { EpisodeReplayResult, ReplayEpisode } from "./types"

const TRANSCRIPTS_DIR = path.resolve(__dirname, "transcripts")
const DEFAULT_OUT = path.resolve(__dirname, "reports")

function runStamp(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
}

function matchesFilter(ep: ReplayEpisode, file: string, filters: string[]): boolean {
  if (filters.length === 0) return true
  const fileBase = path.basename(file, path.extname(file)).toLowerCase()
  return filters.some((f) => {
    const q = f.toLowerCase()
    return (
      ep.id.toLowerCase() === q ||
      ep.id.toLowerCase().startsWith(q) ||
      fileBase === q ||
      fileBase.includes(q) ||
      ep.clientName.toLowerCase().includes(q)
    )
  })
}

async function loadEpisodes(filters: string[]): Promise<ReplayEpisode[]> {
  const files = (await readdir(TRANSCRIPTS_DIR)).filter((f) => f.toLowerCase().endsWith(".txt"))
  const out: ReplayEpisode[] = []
  for (const file of files.sort()) {
    const res = await readAndParseFile(path.join(TRANSCRIPTS_DIR, file))
    for (const ep of res.episodes) {
      if (matchesFilter(ep, file, filters)) out.push(applyShiftToEpisode(ep))
    }
  }
  return out
}

async function main() {
  const { values } = parseArgs({
    options: {
      episode: { type: "string", multiple: true },
      salon: { type: "string" },
      phone: { type: "string" },
      judge: { type: "boolean", default: true },
      "no-judge": { type: "boolean", default: false },
      out: { type: "string" },
      limit: { type: "string" },
    },
    allowPositionals: false,
  })

  const filters = values.episode ?? []
  const judge = values["no-judge"] ? false : values.judge !== false
  const outDir = values.out ? path.resolve(values.out) : DEFAULT_OUT
  const limit = values.limit ? Number(values.limit) : Infinity

  const env = loadReplayEnv({ salonId: values.salon, clientPhone: values.phone })
  console.log(`🏪 Salão: ${env.salonId}`)
  console.log(`⚖️  Juiz IA: ${judge ? "ligado" : "desligado"}`)

  let episodes = await loadEpisodes(filters)
  if (episodes.length > limit) episodes = episodes.slice(0, limit)
  if (episodes.length === 0) {
    console.error(`❌ Nenhum episódio encontrado (filtros: ${filters.join(", ") || "todos"}).`)
    process.exit(1)
  }
  console.log(`📜 ${episodes.length} episódio(s) selecionado(s).`)

  const salonSummary = judge ? await buildSalonSummary(env.salonId) : null
  const stamp = runStamp()
  const results: EpisodeReplayResult[] = []

  for (let i = 0; i < episodes.length; i++) {
    const ep = episodes[i]!
    process.stdout.write(`\n▶️  [${i + 1}/${episodes.length}] ${ep.id} (${ep.exchanges.length} trocas)… `)
    const result = await runEpisode(ep, env)
    if (judge && salonSummary) await judgeEpisode(result, salonSummary)
    const { mdPath } = await writeEpisodeReport(result, outDir, stamp)
    results.push(result)
    console.log(
      `ok · ${result.totals.totalTokens} tokens · erros-tool ${result.totals.toolErrorExchanges} → ${path.relative(process.cwd(), mdPath)}`
    )
  }

  if (results.length > 1) {
    const summaryPath = await writeRunSummary(results, outDir, stamp)
    console.log(`\n📊 Resumo: ${path.relative(process.cwd(), summaryPath)}`)
  }
  console.log("\n✅ Replay concluído.")
  process.exit(0)
}

main().catch((err) => {
  console.error("❌ Erro no replay:", err)
  process.exit(1)
})
