/**
 * Ajustes pedidos pelo cliente (Fabiano Eber) para a Judite, cada um testado com a
 * mensagem real que gerou o problema. Roda o bot de verdade (modelo + tools +
 * banco) num salão de TESTE, com a Belasis simulada.
 *
 * Preparar (uma vez): um salão de teste com a configuração do salão da Judite
 * (agente ativo, o profissional, os serviços e o expediente) e "teste" no nome.
 * No `.env` da raiz:
 *
 *   JUDITE_EVAL_SALON_ID=<uuid do salão de teste>
 *   JUDITE_EVAL_CLIENT_PHONE=5511900000001   # opcional
 *
 * Rodar:
 *
 *   pnpm --filter web eval -- judite                      # todos
 *   pnpm --filter web eval -- judite -t pedido_de_desconto # um só
 *
 * Sem JUDITE_EVAL_SALON_ID a suíte se pula (não quebra as conversas "golden").
 * Com ela apontando para o salão real, se recusa a rodar (ver setup.ts).
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { formatTurnFailure, runConversation } from "../runner/eval-runner"
import { JUDITE_SCENARIOS } from "./scenarios"
import { juditeSalonIdFromEnv, setupJuditeSalon, teardownJuditeSalon, type JuditeEvalContext } from "./setup"

const salonId = juditeSalonIdFromEnv()

describe.skipIf(!salonId)("Judite — ajustes do cliente, com as mensagens reais", () => {
  let ctx: JuditeEvalContext

  beforeAll(async () => {
    ctx = await setupJuditeSalon(salonId!)
  }, 60_000)

  afterAll(async () => {
    await teardownJuditeSalon(salonId!)
  }, 30_000)

  for (const scenario of JUDITE_SCENARIOS) {
    it(
      `[item ${scenario.item}] ${scenario.name} — ${scenario.description}`,
      async () => {
        const conversation = scenario.build(ctx)
        const result = await runConversation(conversation, ctx.env)

        // A conversa inteira vai para o console, passe ou não: é ela que mostra
        // ao dono do salão como a Judite respondeu a cada mensagem real.
        const transcript = result.turnResults
          .map((turn) => {
            const tools = turn.generated?.steps.flatMap((s) => s.toolCalls.map((c) => c.toolName)).join(", ")
            return [
              `  cliente: ${turn.user.replace(/\n/g, " / ")}`,
              `  Judite:  ${turn.generated ? turn.generated.text.replace(/\n/g, " ") : "<sem resposta>"}`,
              ...(tools ? [`  tools:   ${tools}`] : []),
            ].join("\n")
          })
          .join("\n")
        console.log(`\n[item ${scenario.item}] ${scenario.name} — ${result.passed ? "PASSOU" : "FALHOU"}\n${transcript}`)

        if (!result.passed) {
          const lines = [
            ...result.turnResults
              .filter((t) => t.failures.length > 0 || t.generated === null)
              .map((t) => formatTurnFailure(conversation, t)),
            ...result.verifyFailures.map((failure) => `  ✗ no fim da conversa: ${failure}`),
          ]
          console.error(`\nFALHAS em ${scenario.name}:\n${lines.join("\n\n")}`)
        }

        const failedTurns = result.turnResults.filter((t) => t.failures.length > 0 || t.generated === null).length
        expect(
          result.passed,
          `${failedTurns}/${result.turnResults.length} turnos falharam; ${result.verifyFailures.length} conferência(s) final(is) falharam (ver console)`
        ).toBe(true)
      },
      8 * 60_000
    )
  }
})
