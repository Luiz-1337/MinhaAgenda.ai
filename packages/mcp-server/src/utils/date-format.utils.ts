/**
 * Garante que uma string de data tenha formato ISO com timezone.
 * Trata formatos comuns e lança erro em formatos não reconhecidos.
 */
export function ensureIsoWithTimezone(input: unknown): string {
  if (typeof input !== "string") {
    throw new Error(`Data inválida: esperava string, recebeu ${typeof input}`)
  }

  const s = input.trim()

  // Já tem timezone completo (Z ou ±HH:mm / ±HHmm)
  if (/(Z|[+-]\d{2}:?\d{2})$/.test(s)) return s

  // YYYY-MM-DDTHH:mm:ss → adiciona -03:00
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(s)) {
    return `${s}-03:00`
  }

  // YYYY-MM-DDTHH:mm → adiciona :00-03:00
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s)) {
    return `${s}:00-03:00`
  }

  // YYYY-MM-DD (só data) → adiciona T09:00:00-03:00 para evitar meia-noite UTC
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    return `${s}T09:00:00-03:00`
  }

  throw new Error(
    `Formato de data não reconhecido: "${s}". Use ISO 8601 (ex: 2025-01-28T14:00:00-03:00)`
  )
}
