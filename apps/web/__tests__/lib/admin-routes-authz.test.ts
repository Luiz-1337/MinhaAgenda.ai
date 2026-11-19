import { describe, it, expect } from "vitest"
import { readFileSync, readdirSync, statSync } from "node:fs"
import { join, relative } from "node:path"
import { isValidSecret } from "@/lib/services/admin-auth.service"

/**
 * GUARDA DE REGRESSÃO — rotas do admin sem autenticação (19/11/2026).
 *
 * `app/api/admin/debug/evolution-chats/*` não chamava guard nenhum. Como não há
 * middleware/proxy em apps/web, qualquer pessoa com a URL listava os chats de
 * todos os salões e enviava WhatsApp pela instância de qualquer salão.
 *
 * Mesma técnica do `actions-authz.test.ts`: análise estática do fonte. Toda
 * função HTTP exportada por um `route.ts` em `app/api/admin/**` precisa
 * chamar `requireAdminRequest(` e devolver a resposta de erro antes de agir; e
 * toda Server Action exportada em `app/actions/admin/*.ts` precisa chamar
 * `requireAdmin(`. Prova que a chamada ESTÁ lá, não que a regra esteja certa —
 * a regra vive em `lib/services/admin-auth.service.ts`.
 */

const WEB_ROOT = join(__dirname, "..", "..")
const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const

function listFiles(dir: string, match: (name: string) => boolean): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) out.push(...listFiles(full, match))
    else if (match(name)) out.push(full)
  }
  return out
}

/** Corpo de cada função exportada: do `export async function X` até o próximo export. */
function exportedFunctionBodies(source: string): Map<string, string> {
  const re = /export\s+async\s+function\s+(\w+)\s*\(/g
  const starts: { name: string; index: number }[] = []
  for (const m of source.matchAll(re)) starts.push({ name: m[1], index: m.index ?? 0 })
  const bodies = new Map<string, string>()
  starts.forEach((s, i) => {
    const end = i + 1 < starts.length ? starts[i + 1].index : source.length
    bodies.set(s.name, source.slice(s.index, end))
  })
  return bodies
}

describe("rotas app/api/admin/** exigem admin", () => {
  const routes = listFiles(join(WEB_ROOT, "app", "api", "admin"), (n) => n === "route.ts")

  it("encontra as rotas do admin", () => {
    expect(routes.length).toBeGreaterThan(0)
  })

  for (const file of routes) {
    const rel = relative(WEB_ROOT, file).replace(/\\/g, "/")
    const bodies = exportedFunctionBodies(readFileSync(file, "utf8"))
    const handlers = [...bodies.keys()].filter((n) =>
      (HTTP_METHODS as readonly string[]).includes(n)
    )

    it(`${rel} exporta ao menos um handler HTTP`, () => {
      expect(handlers.length).toBeGreaterThan(0)
    })

    for (const name of handlers) {
      it(`${rel} ${name} chama requireAdminRequest e retorna o erro`, () => {
        const body = bodies.get(name) ?? ""
        expect(body).toMatch(/await\s+requireAdminRequest\s*\(/)
        expect(body).toMatch(/['"]response['"]\s+in\s+\w+\)\s*return\s+\w+\.response/)
      })
    }
  }
})

describe("Server Actions em app/actions/admin exigem admin", () => {
  const dir = join(WEB_ROOT, "app", "actions", "admin")
  const files = readdirSync(dir).filter((n) => n.endsWith(".ts") && !n.startsWith("_"))

  for (const name of files) {
    const bodies = exportedFunctionBodies(readFileSync(join(dir, name), "utf8"))
    for (const [fn, body] of bodies) {
      it(`${name} ${fn} chama requireAdmin`, () => {
        expect(body).toMatch(/await\s+requireAdmin\s*\(\s*\)/)
      })
    }
  }
})

describe("isValidSecret", () => {
  it("aceita o segredo idêntico", () => {
    expect(isValidSecret("abc123", "abc123")).toBe(true)
  })

  it("recusa segredo diferente, inclusive de outro tamanho", () => {
    expect(isValidSecret("abc124", "abc123")).toBe(false)
    expect(isValidSecret("abc", "abc123")).toBe(false)
    expect(isValidSecret("abc1234", "abc123")).toBe(false)
  })

  it("recusa quando falta um dos lados (env não configurada)", () => {
    expect(isValidSecret("abc", undefined)).toBe(false)
    expect(isValidSecret("abc", "")).toBe(false)
    expect(isValidSecret(null, "abc")).toBe(false)
    expect(isValidSecret("", "")).toBe(false)
  })
})
