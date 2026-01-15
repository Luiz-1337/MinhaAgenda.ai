const RESPONSE_KEYWORDS = [
  'responda',
  'responder',
  'resposta',
  'confirmar',
  'confirma',
  'confirmo',
  'tem interesse',
  'interesse',
  'quer',
  'queria',
  'gostaria',
  'pode',
  'poderia',
  'prefere',
  'preferencia',
  'qual horario',
  'qual dia',
  'tem horario',
  'posso ajudar',
  'vamos agendar',
  'agendar',
  'agendamento',
]

export function analyzeMessageRequiresResponse(text: string): boolean {
  const trimmed = text.trim()
  if (!trimmed) {
    return false
  }

  const lower = trimmed.toLowerCase()
  if (lower.includes('?')) {
    return true
  }

  return RESPONSE_KEYWORDS.some((keyword) => lower.includes(keyword))
}
