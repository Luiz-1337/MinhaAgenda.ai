import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"

/**
 * GUARDA DE REGRESSÃO — IDOR confirmado em 26/07/2026.
 *
 * As 5 Server Actions de `app/actions/chats.ts` checavam apenas AUTENTICAÇÃO
 * (`getSessionUserId`/`getAuthUser`), nunca o salão. Como o `salonId`/`chatId`
 * chega do cliente, qualquer usuário logado lia o histórico e as URLs assinadas
 * de mídia de qualquer salão — e `sendManualMessage` disparava WhatsApp real
 * para o cliente de outro salão usando a credencial daquele salão.
 *
 * Não existe middleware de auth em apps/web: cada action é o ÚNICO ponto de
 * controle. Este teste é o substituto mais barato — lê o próprio fonte e afirma
 * que toda action exportada começa autorizando. É análise estática de texto de
 * propósito: não precisa de banco, roda em milissegundos e falha na hora em que
 * alguém adiciona uma action nova sem guard.
 *
 * Limite conhecido: ele prova que a chamada de autorização ESTÁ ali e que o
 * retorno é propagado, não que a regra por trás esteja certa. A regra em si vive
 * em `lib/services/permissions.service.ts`.
 */

const GUARDED_FILES = ["chats.ts"] as const

/** Nome dos helpers de autorização aceitos em cada arquivo. */
const AUTHORIZERS = /\b(authorizeSalon|authorizeChat)\s*\(/

/** Actions que legitimamente não têm escopo de salão (nenhuma hoje). */
const EXEMPT = new Set<string>()

function readAction(file: string): string {
  return readFileSync(join(process.cwd(), "app", "actions", file), "utf8")
}

/**
 * Fatia o fonte em `export async function <nome>` → corpo, pelo índice do
 * próximo `export ` (as actions deste repo são todas top-level, sem aninhamento).
 */
function extractExportedActions(source: string): { name: string; body: string }[] {
  const matches = Array.from(
    source.matchAll(/export\s+async\s+function\s+([A-Za-z0-9_]+)\s*\(/g)
  )

  return matches.map((match, index) => {
    const start = match.index!
    const next = matches[index + 1]?.index ?? source.length
    return { name: match[1], body: source.slice(start, next) }
  })
}

describe.each(GUARDED_FILES)("app/actions/%s — escopo por salão", (file) => {
  const source = readAction(file)
  const actions = extractExportedActions(source)

  it("o arquivo tem actions exportadas (a guarda não pode passar vazia)", () => {
    expect(actions.length).toBeGreaterThan(0)
  })

  it.each(actions.map((a) => [a.name, a.body] as const))(
    "%s autoriza por salão",
    (name, body) => {
      if (EXEMPT.has(name)) return

      expect(
        AUTHORIZERS.test(body),
        `A action "${name}" não chama authorizeSalon nem authorizeChat. ` +
          `Estar logado não basta: o id chega do cliente. Veja o padrão em ` +
          `app/actions/kanban.ts:42-73.`
      ).toBe(true)

      // Chamar sem propagar o erro é pior que não chamar: dá falsa sensação de
      // guard e segue executando. O padrão do repo é `if ("error" in auth) return auth`.
      expect(
        /if\s*\(\s*["']error["']\s+in\s+\w+\s*\)/.test(body),
        `A action "${name}" chama o authorizer mas não propaga o erro dele. ` +
          `Use: const auth = await authorizeX(...); if ("error" in auth) return auth`
      ).toBe(true)
    }
  )

  it("nenhuma action se contenta com autenticação nua", () => {
    for (const { name, body } of actions) {
      if (EXEMPT.has(name)) continue
      const authIndex = body.search(AUTHORIZERS)
      const bareAuthIndex = body.search(/\b(getSessionUserId|getAuthUser)\s*\(/)

      // Se usar auth nua, ela tem que vir DEPOIS do authorizer (ex.: para saber
      // quem foi o autor de algo), nunca no lugar dele.
      if (bareAuthIndex !== -1) {
        expect(
          authIndex !== -1 && authIndex < bareAuthIndex,
          `A action "${name}" usa getSessionUserId/getAuthUser antes (ou em vez) ` +
            `de autorizar o salão. Foi exatamente esse o IDOR de 26/07/2026.`
        ).toBe(true)
      }
    }
  })
})
