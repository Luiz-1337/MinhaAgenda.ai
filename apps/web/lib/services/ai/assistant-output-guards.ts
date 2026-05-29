/**
 * Guardas de saída da IA: impedem que texto interno ou de erro vaze para o
 * cliente final no WhatsApp.
 *
 * Dois problemas distintos, ambos observados em produção:
 *
 * 1. Erros de validação de schema (ZodError) cujo `.message` é o array CRU de
 *    issues — ex.: `[{"code":"custom","path":["date"],"message":"Formato inválido..."}]`.
 *    Quando esse texto era devolvido ao modelo como `function_call_output`, o
 *    modelo às vezes o repassava verbatim ao cliente. `describeSchemaValidationError`
 *    substitui isso por uma instrução curta e acionável — destinada ao MODELO,
 *    nunca ao cliente.
 *
 * 2. Defesa em profundidade: se ainda assim algo que pareça JSON de erro (ou a
 *    própria instrução interna) chegar à resposta final, `shouldScrubAsLeak`
 *    detecta e o chamador troca por um fallback amigável antes de enviar.
 */

interface ValidationIssue {
  path?: Array<string | number>
  message?: string
  code?: string
}

/**
 * Marcador embutido nas instruções internas. Serve de duplo propósito:
 * - sinaliza ao modelo que a mensagem não deve ser repassada;
 * - permite a `shouldScrubAsLeak` reconhecer e bloquear a instrução caso ela
 *   acabe ecoada no texto final destinado ao cliente.
 */
export const INTERNAL_INSTRUCTION_MARKER = "Não repasse esta mensagem ao cliente"

/**
 * Fallback amigável quando detectamos vazamento de JSON de erro ou de instrução
 * interna na resposta final destinada ao cliente.
 */
export const LEAKED_ERROR_FALLBACK_MESSAGE =
  "Desculpe, tive uma dificuldade técnica ao processar isso. Pode me dizer de novo o que você precisa?"

/**
 * Extrai as issues de um erro de validação Zod (v3 ou v4) via duck-typing —
 * ambos expõem `.issues: Array<{ path, message, code }>`. Evitamos `instanceof`
 * porque o runner lida com schemas de zod/v3 e zod/v4 ao mesmo tempo.
 */
export function extractValidationIssues(error: unknown): ValidationIssue[] {
  if (error && typeof error === "object") {
    const issues = (error as { issues?: unknown }).issues
    if (Array.isArray(issues)) {
      return issues as ValidationIssue[]
    }
  }
  return []
}

/**
 * Converte um erro de validação de schema numa instrução curta e acionável
 * para o MODELO. NUNCA retorna o array cru de issues do Zod.
 *
 * A frase "argumento inválido" é proposital: `availability-message-policy` a
 * reconhece como mensagem técnica, garantindo que o cliente receba o fallback
 * amigável em vez desta instrução interna caso ela chegue ao handleToolErrors.
 */
export function describeSchemaValidationError(toolName: string, error: unknown): string {
  const issues = extractValidationIssues(error)

  const fields = [
    ...new Set(
      issues
        .map((issue) =>
          Array.isArray(issue.path) && issue.path.length > 0 ? issue.path.join(".") : ""
        )
        .filter((field) => field.length > 0)
    ),
  ]

  const fieldList =
    fields.length > 0 ? ` em ${fields.map((field) => `'${field}'`).join(", ")}` : ""
  const mentionsDate = fields.some((field) => /date|data|hora|datetime|inicio|fim/i.test(field))

  const dateHint = mentionsDate
    ? " Se for data/hora, peça a data ao cliente ou normalize para ISO 8601 (ex: 2025-01-01T10:00:00-03:00) antes de chamar a tool novamente."
    : ""

  return (
    `Argumento inválido${fieldList} para a tool ${toolName}. ` +
    `${INTERNAL_INSTRUCTION_MARKER}; corrija e chame a tool novamente.${dateHint}`
  )
}

/**
 * Detecta texto que pareça JSON de erro vazado (ex.: array de issues do Zod).
 *
 * Critério (conforme o incidente real): o texto começa com `[` ou `{` e contém
 * alguma das chaves `"code"`, `"path"` ou `"message"`. O assistente nunca produz
 * JSON legítimo para o cliente, então o risco de falso-positivo é desprezível.
 */
export function looksLikeLeakedErrorJson(text: string): boolean {
  const trimmed = text.trim()
  if (!trimmed) return false
  if (!/^[[{]/.test(trimmed)) return false
  return /"(?:code|path|message)"/.test(trimmed)
}

/**
 * Predicado final usado pelo sanitizador: o texto deve ser substituído pelo
 * fallback se parecer JSON de erro vazado OU se contiver uma instrução interna
 * que jamais deveria chegar ao cliente.
 */
export function shouldScrubAsLeak(text: string): boolean {
  if (!text) return false
  return looksLikeLeakedErrorJson(text) || text.includes(INTERNAL_INSTRUCTION_MARKER)
}
