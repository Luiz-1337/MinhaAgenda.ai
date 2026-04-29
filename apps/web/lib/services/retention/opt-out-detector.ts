/**
 * Opt-out detection for inbound WhatsApp messages.
 *
 * Three layers:
 *  - HARD: strict whole-message regex → automatic opt-out + confirmation
 *  - SOFT: permissive substring regex → flag for review (only if recent AI retention)
 *  - OPT-IN: explicit reactivation
 *
 * The dispatcher and worker call into this module via `detectOptOutIntent()`.
 */

export type OptOutIntent = 'hard_opt_out' | 'soft_signal' | 'opt_in' | 'none'

const HARD_OPT_OUT_REGEX =
  /^\s*(parar|sair|cancelar|stop|descadastrar|n[aã]o quero (mais|receber)|(remova|remover|remove)\s+(o\s+)?(meu|seu)?\s*n[uú]mero)\s*\.?\s*$/i

const OPT_IN_REGEX = /^\s*(voltar|reativar|opt[\s-]?in)\s*\.?\s*$/i

const SOFT_OPT_OUT_REGEX =
  /\b(me erra|chega|n[aã]o aguento|para de mandar|incomod\w*|que saco|deixa de mandar|para de me mandar|me deixa em paz|para com isso|n[aã]o me manda)\b/i

export function detectOptOutIntent(body: string): OptOutIntent {
  if (!body) return 'none'
  if (HARD_OPT_OUT_REGEX.test(body)) return 'hard_opt_out'
  if (OPT_IN_REGEX.test(body)) return 'opt_in'
  if (SOFT_OPT_OUT_REGEX.test(body)) return 'soft_signal'
  return 'none'
}

export const OPT_OUT_REGEXES = {
  hard: HARD_OPT_OUT_REGEX,
  optIn: OPT_IN_REGEX,
  soft: SOFT_OPT_OUT_REGEX,
}

export const OPT_OUT_CONFIRMATION_MESSAGE =
  'Tudo bem, voce nao recebera mais nossas mensagens automaticas. Para voltar a receber, basta responder VOLTAR.'

export const OPT_IN_CONFIRMATION_MESSAGE =
  'Pronto! Voce voltou a receber nossas mensagens. Estamos felizes em ter voce de volta.'
