/**
 * Padrões que o bot NUNCA deve emitir ao localizar/modificar agendamentos:
 * pedir telefone, DDD, número, CPF ou "confirmação de identidade". O cliente já
 * está identificado pelo WhatsApp. Compartilhado pelas evals de remarcar/cancelar.
 */
export const NUNCA_PEDIR_TELEFONE: RegExp[] = [
  /telefone/i,
  /\bDDD\b/i,
  /seu n[úu]mero/i,
  /confirma.*n[úu]mero/i,
  /me (passa|confirma|informa|envia).*n[úu]mero/i,
  /\bCPF\b/i,
  /confirmar?\s+sua\s+identidade/i,
]
