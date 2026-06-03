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
    const available = dto.slots.filter((s) => s.available)
    const hasAttribution = available.some((s) => s.professionalName)

    // Modo agregado (sem profissional fixo): agrupa por profissional, especialistas
    // primeiro. Apenas NOMES, nunca IDs — a IA escolhe pelo nome.
    if (hasAttribution) {
      const byPro = new Map<
        string,
        { professional: string; isSpecialist: boolean; slots: string[] }
      >()
      for (const s of available) {
        const name = s.professionalName ?? "Profissional"
        const entry = byPro.get(name) ?? { professional: name, isSpecialist: false, slots: [] }
        entry.slots.push(s.time)
        if (s.isSpecialist) entry.isSpecialist = true
        byPro.set(name, entry)
      }

      const options = Array.from(byPro.values())
        .map((o) => ({ ...o, slots: [...new Set(o.slots)].sort() }))
        .sort((a, b) => Number(b.isSpecialist) - Number(a.isSpecialist))

      // "Mais cedo" preferindo especialistas; se nenhum especialista tem horário,
      // cai para o mais cedo geral.
      const specialistPool = options.filter((o) => o.isSpecialist && o.slots.length > 0)
      const pool = specialistPool.length > 0 ? specialistPool : options.filter((o) => o.slots.length > 0)
      let earliest: { professional: string; time: string; isSpecialist: boolean } | undefined
      for (const o of pool) {
        const t = o.slots[0]
        if (!earliest || t < earliest.time) {
          earliest = { professional: o.professional, time: t, isSpecialist: o.isSpecialist }
        }
      }

      return {
        date: dto.dateISO,
        mode: "byProfessional",
        options,
        earliest,
        totalAvailable: available.length,
        message: dto.message,
        _instrucao:
          "Prefira o ESPECIALISTA (isSpecialist=true) e ofereça 2-3 horários. " +
          "Se o cliente pedir outro profissional capaz, use os horários dele. NUNCA mostre IDs.",
      }
    }

    // Modo simples (profissional fixo ou horário do salão).
    return {
      date: dto.dateISO,
      professional: dto.professional,
      slots: available.map((s) => ({
        time: s.time,
      })),
      totalAvailable: dto.totalAvailable,
      message: dto.message,
      _instrucao: "Apresente apenas 2-3 horários ao cliente. NUNCA mostre IDs.",
    }
  }
}
