import { describe, it, expect } from "vitest"
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative, sep } from "node:path"

/**
 * GUARDA DE REGRESSÃO — achado em 14/10/2026, ao preparar a integração Belasis.
 *
 * `salon_integrations` tem UMA LINHA POR PROVEDOR por salão (unique em
 * salon_id + provider): Google, Belasis, Trinks. Duas consultas do Google buscavam
 * a integração só por `salonId`:
 *   - `GoogleCalendarService.getAuthClient` pegava qualquer linha e, ao tentar dar
 *     refresh com o token de OUTRO provedor, o `invalid_grant` APAGAVA essa linha;
 *   - o callback do OAuth, na reconexão, sobrescrevia a linha de outro provedor
 *     com tokens do Google.
 * Nunca disparou só porque nenhum salão tinha duas linhas ainda.
 *
 * A regra: toda leitura de UMA linha e toda escrita em `salon_integrations` diz
 * qual provedor (ou mira a linha pelo id). É análise estática de texto, como
 * actions-authz.test.ts: não precisa de banco e falha no PR que reintroduzir o
 * padrão.
 */

const REPO_ROOT = join(process.cwd(), "..", "..")

const SCANNED_DIRS = [
  "apps/web/app",
  "apps/web/lib",
  "apps/web/workers",
  "packages/db/src",
  "packages/mcp-server/src",
]

/**
 * Listagens que devolvem TODAS as linhas do salão de propósito, com o provider
 * em cada item — não escolhem uma linha, então não confundem provedores.
 */
const LISTING_ALLOWLIST = new Set([
  "packages/mcp-server/src/infrastructure/database/DrizzleSalonRepository.ts",
])

/** Escopo aceito: o provedor, ou a linha exata pelo id. */
const SCOPED = /salonIntegrations\.(provider|id)\b/

function listSourceFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === "__tests__" || entry.startsWith(".")) continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...listSourceFiles(full))
    else if (/\.(ts|tsx)$/.test(entry) && !entry.endsWith(".d.ts")) out.push(full)
  }
  return out
}

/** Texto entre o "(" em `openIndex` e o ")" que o fecha. */
function balancedArgs(source: string, openIndex: number): string {
  let depth = 0
  for (let i = openIndex; i < source.length; i++) {
    if (source[i] === "(") depth++
    else if (source[i] === ")") {
      depth--
      if (depth === 0) return source.slice(openIndex + 1, i)
    }
  }
  return source.slice(openIndex + 1)
}

interface Offender {
  file: string
  line: number
  snippet: string
}

function lineOf(source: string, index: number): number {
  return source.slice(0, index).split("\n").length
}

function findOffenders(): { offenders: Offender[]; checked: number } {
  const offenders: Offender[] = []
  let checked = 0

  for (const dir of SCANNED_DIRS) {
    for (const file of listSourceFiles(join(REPO_ROOT, dir))) {
      const rel = relative(REPO_ROOT, file).split(sep).join("/")
      const source = readFileSync(file, "utf8")

      // 1) Leitura de UMA linha: findFirst sem provider/id escolhe uma ao acaso.
      for (const match of source.matchAll(/salonIntegrations\.findFirst\s*\(/g)) {
        checked++
        const args = balancedArgs(source, match.index! + match[0].length - 1)
        if (!SCOPED.test(args)) {
          offenders.push({ file: rel, line: lineOf(source, match.index!), snippet: match[0] })
        }
      }

      // 2) Listagens: só as da allowlist podem ignorar o provider.
      for (const match of source.matchAll(/salonIntegrations\.findMany\s*\(/g)) {
        checked++
        if (LISTING_ALLOWLIST.has(rel)) continue
        const args = balancedArgs(source, match.index! + match[0].length - 1)
        if (!SCOPED.test(args)) {
          offenders.push({ file: rel, line: lineOf(source, match.index!), snippet: match[0] })
        }
      }

      // 3) Escritas e selects encadeados: o .where() seguinte precisa de provider/id.
      for (const match of source.matchAll(/\.(update|delete|from)\(\s*salonIntegrations\s*\)/g)) {
        checked++
        const rest = source.slice(match.index! + match[0].length)
        const whereAt = rest.search(/\.where\s*\(/)
        // Sem .where() logo adiante = statement sem filtro nenhum (ou fora do padrão).
        if (whereAt < 0 || whereAt > 600) {
          offenders.push({ file: rel, line: lineOf(source, match.index!), snippet: `${match[0]} sem .where()` })
          continue
        }
        const openIndex = match.index! + match[0].length + whereAt + rest.slice(whereAt).indexOf("(")
        const args = balancedArgs(source, openIndex)
        if (!SCOPED.test(args)) {
          offenders.push({ file: rel, line: lineOf(source, match.index!), snippet: match[0] })
        }
      }
    }
  }

  return { offenders, checked }
}

describe("salon_integrations — toda consulta escolhe o provedor", () => {
  const { offenders, checked } = findOffenders()

  it("a guarda achou consultas para checar (não pode passar vazia)", () => {
    expect(checked).toBeGreaterThan(10)
  })

  it("nenhuma leitura de linha única ou escrita sem provider/id", () => {
    expect(offenders).toEqual([])
  })
})
