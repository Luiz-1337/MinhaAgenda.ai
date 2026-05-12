/**
 * Eval entrypoint. Picked up by vitest.eval.config.ts.
 *
 * Each conversation becomes its own describe/it block so failures show up
 * per-scenario in the test report. Conversations run sequentially to keep
 * the DB and Redis cleanup deterministic.
 */

import { describe, it, expect } from "vitest"
import { runConversation, formatTurnFailure } from "./runner/eval-runner"
import type { Conversation } from "./types"

import { conversation as saudacaoPura } from "./conversations/01-saudacao-pura"
import { conversation as despedida } from "./conversations/02-despedida"
import { conversation as listaServicos } from "./conversations/03-lista-servicos"
import { conversation as agendamentoSolicitaData } from "./conversations/04-agendamento-solicita-data"
import { conversation as agendamentoDiretoDiaHora } from "./conversations/05-agendamento-direto-dia-hora"
import { conversation as memoriaToolContext } from "./conversations/06-memoria-tool-context"

const ALL_CONVERSATIONS: Conversation[] = [
  saudacaoPura,
  despedida,
  listaServicos,
  agendamentoSolicitaData,
  agendamentoDiretoDiaHora,
  memoriaToolContext,
]

describe("golden conversations", () => {
  for (const conversation of ALL_CONVERSATIONS) {
    it(
      `${conversation.name} — ${conversation.description}`,
      async () => {
        const result = await runConversation(conversation)

        if (!result.passed) {
          const lines = [
            `\nFAILURE: ${conversation.name} (${result.durationMs}ms)`,
            ...result.turnResults
              .filter((t) => t.failures.length > 0 || t.generated === null)
              .map((t) => formatTurnFailure(conversation, t)),
          ]
          // eslint-disable-next-line no-console
          console.error(lines.join("\n\n"))
        }

        const totalTurns = result.turnResults.length
        const failedTurns = result.turnResults.filter(
          (t) => t.failures.length > 0 || t.generated === null
        ).length
        expect(
          result.passed,
          `${failedTurns}/${totalTurns} turns failed (see console for details)`
        ).toBe(true)
      },
      // Per-test timeout (vitest's; in addition to the 90s AI timeout per turn)
      5 * 60_000
    )
  }
})
