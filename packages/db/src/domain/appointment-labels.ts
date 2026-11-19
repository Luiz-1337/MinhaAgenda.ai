/**
 * Etiquetas na agenda — regra pura, sem I/O (docs/ROADMAP.md, fase 7, fatia 7b).
 *
 * Um rótulo com cor por agendamento ("Primeira vez", "Encaixe", "Aguardando
 * sinal"), para quem olha a agenda. Não muda horário, status nem cobrança.
 */

/** As cores oferecidas na tela. O banco aceita qualquer "#RRGGBB". */
export const APPOINTMENT_LABEL_COLORS = [
  '#ef4444',
  '#f97316',
  '#eab308',
  '#22c55e',
  '#14b8a6',
  '#3b82f6',
  '#8b5cf6',
  '#ec4899',
  '#64748b',
] as const

export const MAX_APPOINTMENT_LABEL_NAME = 30
/** Etiquetas demais deixam de ser um marcador e viram ruído na agenda. */
export const MAX_APPOINTMENT_LABELS = 30

export type AppointmentLabelDraft = { name: unknown; color: unknown }

export function planAppointmentLabel(
  draft: AppointmentLabelDraft
): { ok: true; label: { name: string; color: string } } | { ok: false; error: string } {
  const name = typeof draft.name === 'string' ? draft.name.trim().replace(/\s+/g, ' ') : ''
  if (!name) return { ok: false, error: 'Dê um nome à etiqueta' }
  if (name.length > MAX_APPOINTMENT_LABEL_NAME) {
    return { ok: false, error: `O nome da etiqueta tem até ${MAX_APPOINTMENT_LABEL_NAME} caracteres` }
  }

  const color = typeof draft.color === 'string' ? draft.color.trim().toLowerCase() : ''
  if (!/^#[0-9a-f]{6}$/.test(color)) return { ok: false, error: 'Escolha a cor da etiqueta' }

  return { ok: true, label: { name, color } }
}

/**
 * A cor do texto (preto ou branco) que se lê em cima da cor da etiqueta, pela
 * luminância relativa (WCAG). Amarelo pede texto escuro; azul, claro.
 */
export function labelTextColor(color: string): '#000000' | '#ffffff' {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(color)
  if (!match) return '#000000'

  const channel = (hex: string) => {
    const value = parseInt(hex, 16) / 255
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  }
  const luminance = 0.2126 * channel(match[1]) + 0.7152 * channel(match[2]) + 0.0722 * channel(match[3])

  // Contraste com preto = (L + 0.05) / 0.05; com branco = 1.05 / (L + 0.05).
  return (luminance + 0.05) / 0.05 >= 1.05 / (luminance + 0.05) ? '#000000' : '#ffffff'
}
