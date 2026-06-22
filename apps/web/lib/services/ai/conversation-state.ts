/**
 * Helpers para extrair "estado da conversa" a partir do historico de mensagens.
 *
 * O modelo recebe blocos ---TOOL_CONTEXT--- nas mensagens assistant antigas,
 * contendo o resumo das tools que ja foram chamadas. Aqui escaneamos esses
 * blocos para descobrir quais tools de leitura (getServices, etc.) ja foram
 * executadas, e usamos isso para:
 *   - Injetar um aviso no system prompt (item 3 do plano)
 *   - Telemetria de violacao de fluxo (item 4)
 *   - Forcar tool_choice quando faltar pre-requisito (item 5)
 */

import type { ResponsesRunnerInputMessage } from "./openai-responses-runner.service"

const TOOL_CONTEXT_BLOCK_REGEX =
  /---TOOL_CONTEXT---([\s\S]*?)---END_TOOL_CONTEXT---/g

const TOOL_CALL_LINE_REGEX = /\[([A-Za-z_][A-Za-z0-9_]*)\]\(/g

/**
 * Extrai dos blocos ---TOOL_CONTEXT--- do historico o conjunto de nomes
 * de tools que ja foram executadas nesta conversa.
 */
export function detectExecutedTools(
  historyMessages: ResponsesRunnerInputMessage[]
): Set<string> {
  const executed = new Set<string>()

  for (const msg of historyMessages) {
    if (msg.role !== "assistant") continue
    const content = typeof msg.content === "string" ? msg.content : ""
    if (!content.includes("---TOOL_CONTEXT---")) continue

    TOOL_CONTEXT_BLOCK_REGEX.lastIndex = 0
    let blockMatch: RegExpExecArray | null
    while ((blockMatch = TOOL_CONTEXT_BLOCK_REGEX.exec(content)) !== null) {
      const blockContent = blockMatch[1]
      TOOL_CALL_LINE_REGEX.lastIndex = 0
      let toolMatch: RegExpExecArray | null
      while ((toolMatch = TOOL_CALL_LINE_REGEX.exec(blockContent)) !== null) {
        executed.add(toolMatch[1])
      }
    }
  }

  return executed
}

const READ_TOOLS_OF_INTEREST = [
  "getServices",
  "getProfessionals",
  "getMyFutureAppointments",
] as const

/**
 * Produz texto para injetar no system prompt informando ao modelo quais
 * tools de leitura ja foram (ou nao) executadas nesta conversa.
 *
 * Retorna string vazia se TODAS as tools de interesse ja foram chamadas
 * (nesse caso o aviso so polui o prompt).
 */
export function formatConversationStateText(
  executedTools: Set<string>
): string {
  const allCalled = READ_TOOLS_OF_INTEREST.every((t) => executedTools.has(t))
  if (allCalled) return ""

  const lines = READ_TOOLS_OF_INTEREST.map((t) => {
    const ok = executedTools.has(t)
    return ok ? `- ${t}: chamada nesta conversa` : `- ${t}: NAO chamada`
  })

  return (
    `\n\nESTADO DA CONVERSA (tools de leitura ja executadas):\n` +
    `${lines.join("\n")}\n\n` +
    `ATENCAO: antes de addAppointment/checkAvailability/updateAppointment/` +
    `removeAppointment, chame as tools de leitura faltantes acima para obter ` +
    `os IDs reais. NUNCA invente IDs nem use placeholders.`
  )
}

/**
 * Detecta intencao de agendamento/manipulacao de agenda na mensagem do
 * cliente, para forcar tool_choice no primeiro round quando getServices
 * ainda nao foi executado.
 *
 * Pattern conservador: matches em raizes de verbos/substantivos de agenda
 * (agendar, marcar, horario, reservar, reagendar, cancelar, remarcar) com
 * boundary inicial para evitar matches em meio de palavras.
 *
 * Nao matcha nomes proprios comuns (ex: "Marcos" nao casa com "marca|marc"
 * porque exige sequencia "marc" + "a" antes de wildcard).
 */
const APPOINTMENT_INTENT_REGEX =
  /\b(agend|marca|horári|horario|reserv|reagend|cancel|remarc)\w*\b/i

export function detectAppointmentIntent(userMessage: string): boolean {
  return APPOINTMENT_INTENT_REGEX.test(userMessage)
}

/**
 * Detecta violacao de fluxo: agente tentou criar/atualizar agendamento sem
 * antes ter buscado os IDs reais via getServices.
 *
 * `currentToolSequence` sao os nomes das tools chamadas NO TURNO ATUAL;
 * `executedTools` sao as ja chamadas em turnos anteriores (do historico).
 */
export function detectFlowViolation(
  currentToolSequence: string[],
  executedTools: Set<string>
): boolean {
  const mutated =
    currentToolSequence.includes("addAppointment") ||
    currentToolSequence.includes("updateAppointment")
  if (!mutated) return false

  const hadGetServices =
    currentToolSequence.includes("getServices") ||
    executedTools.has("getServices")

  return !hadGetServices
}
