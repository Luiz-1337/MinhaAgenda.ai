import { AvailabilityDTO, ProfessionalAvailabilityRulesDTO } from "../../application/dtos"

/**
 * Presenter para formatação de dados de disponibilidade
 */
export class AvailabilityPresenter {
  /**
   * Formata disponibilidade para resposta legível
   */
  static format(dto: AvailabilityDTO): string {
    const availableSlots = dto.slots.filter((s) => s.available)

    if (availableSlots.length === 0) {
      return `Não há horários disponíveis para ${dto.date}.`
    }

    const times = availableSlots.map((s) => s.time).join(", ")
    const professional = dto.professional ? ` com ${dto.professional}` : ""

    return `Horários disponíveis para ${dto.date}${professional}:\n${times}`
  }

  /**
   * Formata com mais detalhes
   */
  static formatDetailed(dto: AvailabilityDTO): string {
    const availableSlots = dto.slots.filter((s) => s.available)

    if (availableSlots.length === 0) {
      return `❌ Não há horários disponíveis para ${dto.date}.\n\n` +
        "Posso verificar outra data?"
    }

    const lines = [
      `📅 Horários disponíveis para ${dto.date}:`,
      "",
    ]

    // Agrupa por período do dia
    const morning = availableSlots.filter((s) => {
      const hour = parseInt(s.time.split(":")[0])
      return hour < 12
    })
    const afternoon = availableSlots.filter((s) => {
      const hour = parseInt(s.time.split(":")[0])
      return hour >= 12 && hour < 18
    })
    const evening = availableSlots.filter((s) => {
      const hour = parseInt(s.time.split(":")[0])
      return hour >= 18
    })

    if (morning.length > 0) {
      lines.push(`🌅 Manhã: ${morning.map((s) => s.time).join(", ")}`)
    }
    if (afternoon.length > 0) {
      lines.push(`☀️ Tarde: ${afternoon.map((s) => s.time).join(", ")}`)
    }
    if (evening.length > 0) {
      lines.push(`🌙 Noite: ${evening.map((s) => s.time).join(", ")}`)
    }

    lines.push("", `Total: ${dto.totalAvailable} horário(s) disponível(is)`)

    return lines.join("\n")
  }

  /**
   * Formata regras de disponibilidade do profissional
   */
  static formatRules(dto: ProfessionalAvailabilityRulesDTO): string {
    if (dto.rules.length === 0) {
      return `${dto.professionalName} não tem horários de trabalho cadastrados.`
    }

    const lines = [
      `📅 Horários de trabalho de ${dto.professionalName}:`,
      "",
    ]

    // Agrupa por dia
    const byDay = new Map<number, typeof dto.rules>()
    for (const rule of dto.rules) {
      const existing = byDay.get(rule.dayOfWeek) ?? []
      existing.push(rule)
      byDay.set(rule.dayOfWeek, existing)
    }

    for (const [dayOfWeek, rules] of byDay) {
      const dayName = rules[0].dayName
      const workRules = rules.filter((r) => !r.isBreak)
      const breakRules = rules.filter((r) => r.isBreak)

      if (workRules.length > 0) {
        const times = workRules.map((r) => `${r.startTime} - ${r.endTime}`).join(", ")
        lines.push(`${dayName}: ${times}`)

        if (breakRules.length > 0) {
          const breaks = breakRules.map((r) => `${r.startTime} - ${r.endTime}`).join(", ")
          lines.push(`  (Intervalo: ${breaks})`)
        }
      }
    }

    return lines.join("\n")
  }

  /**
   * Formata para JSON
   */
  static toJSON(dto: AvailabilityDTO): Record<string, unknown> {
    return {
      date: dto.dateISO,
      professional: dto.professional,
      professionalId: dto.professionalId,
      slots: dto.slots.map((s) => ({
        time: s.time,
        available: s.available,
      })),
      totalAvailable: dto.totalAvailable,
      message: dto.message,
    }
  }
}
