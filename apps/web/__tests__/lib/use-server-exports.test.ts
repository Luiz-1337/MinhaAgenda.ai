import { describe, it, expect } from "vitest"
import { readFileSync, readdirSync, statSync } from "node:fs"
import { join } from "node:path"

/**
 * GUARDA DE BUILD — quebrou a produção em 30/07/2026.
 *
 * Um arquivo `"use server"` só pode exportar FUNÇÃO ASYNC. Nada mais. Um
 * `export const CUSTOMERS_PAGE_SIZE = 20` em `app/actions/customers.ts` derrubou o
 * build da Vercel com:
 *
 *   x Only async functions are allowed to be exported in a "use server" file.
 *
 * Por que isto existe: **o `tsc` não pega**. O tipo está perfeito, o import resolve,
 * o teste passa. O único detector era o `next build` — que neste ambiente não roda
 * (falta o .env raiz), então o erro só aparecia depois do push, num build de 90
 * segundos, com o deploy vermelho.
 *
 * São DUAS regras distintas, e a segunda é a mais conhecida:
 *   1. Nenhum valor exportado (const/let/var/class/enum/função não-async).
 *   2. Nenhum RE-export (`export ... from`), inclusive de tipo — no Turbopack isso
 *      dá `ReferenceError: X is not defined` no SSR, em runtime.
 *
 * O que CONTINUA permitido: declarar tipo localmente e exportar
 * (`export type Foo = {...}`), porque o tipo é apagado na compilação. É como
 * `CustomerRow` e `SalonCustomersPage` vivem hoje.
 *
 * Constantes e tipos compartilhados vão para `lib/types/*` ou `lib/utils/*`.
 */

const WEB_ROOT = process.cwd()
const SCAN_DIRS = ["app", "lib", "components"]

function walk(dir: string, acc: string[] = []): string[] {
  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch {
    return acc
  }
  for (const entry of entries) {
    if (entry === "node_modules" || entry === ".next") continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, acc)
    else if (/\.tsx?$/.test(entry)) acc.push(full)
  }
  return acc
}

/** Arquivos com a diretiva "use server" no topo (o módulo inteiro é server action). */
function findUseServerFiles(): { path: string; source: string }[] {
  const out: { path: string; source: string }[] = []
  for (const dir of SCAN_DIRS) {
    for (const file of walk(join(WEB_ROOT, dir))) {
      const source = readFileSync(file, "utf8")
      // Só a diretiva de MÓDULO (primeira linha de código), não "use server" inline
      // dentro de uma função — essa é outra coisa e não tem a restrição.
      const firstCode = source
        .split("\n")
        .map((l) => l.trim())
        .find((l) => l && !l.startsWith("//") && !l.startsWith("/*") && !l.startsWith("*"))
      if (firstCode === '"use server"' || firstCode === "'use server'") {
        out.push({ path: file.replace(WEB_ROOT, "").replace(/\\/g, "/"), source })
      }
    }
  }
  return out
}

const files = findUseServerFiles()

describe('arquivos "use server"', () => {
  it("a varredura encontrou arquivos (a guarda não pode passar vazia)", () => {
    // Se o scanner quebrar, ele passaria com 0 arquivos e a guarda viraria decoração.
    expect(files.length).toBeGreaterThan(5)
  })

  it.each(files.map((f) => [f.path, f.source] as const))(
    "%s exporta somente função async",
    (path, source) => {
      const offenders = source
        .split("\n")
        .map((line, i) => ({ line: line.trim(), n: i + 1 }))
        // Exporta VALOR: const/let/var/class/enum, ou função sem `async`.
        .filter(({ line }) =>
          /^export\s+(const|let|var|class|enum)\s/.test(line) ||
          /^export\s+function\s/.test(line) ||
          /^export\s+default\s/.test(line)
        )
        .map(({ line, n }) => `${path}:${n} → ${line}`)

      expect(
        offenders,
        `Arquivo "use server" só pode exportar função async. Isto derruba o BUILD ` +
          `(o tsc passa!). Mova a constante para lib/types/* ou lib/utils/*.\n` +
          offenders.join("\n")
      ).toEqual([])
    }
  )

  it.each(files.map((f) => [f.path, f.source] as const))(
    "%s não re-exporta de outro módulo",
    (path, source) => {
      const offenders = source
        .split("\n")
        .map((line, i) => ({ line: line.trim(), n: i + 1 }))
        // `export { X } from "..."` e `export * from "..."`, inclusive de tipo.
        .filter(({ line }) => /^export\s+(\*|type\s*\{|\{)[^;]*\bfrom\b/.test(line))
        .map(({ line, n }) => `${path}:${n} → ${line}`)

      expect(
        offenders,
        `Arquivo "use server" não pode RE-exportar — no Turbopack vira ` +
          `"ReferenceError: X is not defined" no SSR, em runtime, e o tsc não pega. ` +
          `Declare o tipo em lib/types/* e importe de lá nos dois lados.\n` +
          offenders.join("\n")
      ).toEqual([])
    }
  )
})
