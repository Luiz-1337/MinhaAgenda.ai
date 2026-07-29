/**
 * Regra da retomada automática da IA num chat em modo manual.
 *
 * Módulo PURO de propósito: zero imports, nenhum acesso a banco. Entra no grafo
 * do worker (que roda via tsx e não resolve o alias `@/`) e é onde a regra fica
 * testável sem mockar relógio nem Drizzle.
 *
 * Contexto: `chats.is_manual` é ligado por quatro caminhos (eco do app do
 * celular, botão do painel, IA esgotada, falha de entrega) e, até a migration
 * 024, só o botão do painel o desligava. Um chat que virou manual por falha de
 * entrega ficava parado para sempre. Agora `chats.manual_since` guarda a última
 * fala humana e `salons.ai_resume_after_minutes` diz quanto silêncio devolve a
 * conversa para a IA.
 */

/** Minutos aceitos na configuração (5 minutos a 14 dias). Espelha o CHECK da 024. */
export const AI_RESUME_MIN_MINUTES = 5
export const AI_RESUME_MAX_MINUTES = 20160

export interface ManualModeState {
  isManual: boolean
  /** Última fala humana no chat. NULL em chat automático — ou em chat que virou manual antes da 024. */
  manualSince: Date | null
}

/**
 * A IA deve reassumir este chat agora?
 *
 * `resumeAfterMinutes` NULL/0 = política desligada (comportamento histórico: só
 * o botão do painel devolve a conversa).
 *
 * `manualSince` NULL num chat manual significa que não sabemos quando virou —
 * possível em chat pré-024 cujo backfill não pegou. Devolvemos `false`: sem
 * âncora de tempo, retomar seria chutar, e chutar aqui faz a IA falar em cima de
 * um atendimento humano. Ficar manual é o erro seguro.
 */
export function shouldResumeAI(
  state: ManualModeState,
  resumeAfterMinutes: number | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!state.isManual) return false
  if (!resumeAfterMinutes || resumeAfterMinutes <= 0) return false
  if (!state.manualSince) return false

  const elapsedMs = now.getTime() - state.manualSince.getTime()
  // Data no futuro (relógio torto) nunca deve retomar na hora.
  if (elapsedMs < 0) return false

  return elapsedMs >= resumeAfterMinutes * 60_000
}

/**
 * Quando a IA reassume sozinha. `null` quando a política está desligada, quando
 * o chat não está em manual, ou quando falta a âncora de tempo.
 * Serve para o painel mostrar "a IA reassume às 14:30" sem duplicar a regra.
 */
export function aiResumesAt(
  state: ManualModeState,
  resumeAfterMinutes: number | null | undefined,
): Date | null {
  if (!state.isManual) return null
  if (!resumeAfterMinutes || resumeAfterMinutes <= 0) return null
  if (!state.manualSince) return null

  return new Date(state.manualSince.getTime() + resumeAfterMinutes * 60_000)
}
