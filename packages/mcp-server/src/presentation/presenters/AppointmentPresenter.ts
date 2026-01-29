import { AppointmentDTO, AppointmentListDTO } from "../../application/dtos"

/**
 * Presenter para formatação de dados de agendamento
 */
export class AppointmentPresenter {
  /**
   * Formata um agendamento para resposta legível
   */
  static format(dto: AppointmentDTO): string {
    return `Agendamento ${dto.status === "pending" ? "criado" : dto.status}: ${dto.serviceName} com ${dto.professionalName} em ${dto.startsAt}`
  }

  /**
   * Formata para confirmação de criação
   */
  static formatCreated(dto: AppointmentDTO): string {
    return `✅ Agendamento confirmado!\n\n` +
      `📋 Serviço: ${dto.serviceName}\n` +
      `👤 Profissional: ${dto.professionalName}\n` +
      `📅 Data: ${dto.startsAt}\n` +
      (dto.notes ? `📝 Observações: ${dto.notes}\n` : "") +
      `\nID do agendamento: ${dto.id}`
  }

  /**
   * Formata para confirmação de atualização
   */
  static formatUpdated(dto: AppointmentDTO): string {
    return `✅ Agendamento atualizado!\n\n` +
      `📋 Serviço: ${dto.serviceName}\n` +
      `👤 Profissional: ${dto.professionalName}\n` +
      `📅 Nova data: ${dto.startsAt}\n` +
      (dto.notes ? `📝 Observações: ${dto.notes}\n` : "")
  }

  /**
   * Formata para confirmação de cancelamento
   */
  static formatCancelled(appointmentId: string): string {
    return `✅ Agendamento cancelado com sucesso!\n\nID: ${appointmentId}`
  }

  /**
   * Formata lista de agendamentos
   */
  static formatList(dto: AppointmentListDTO): string {
    if (dto.appointments.length === 0) {
      return "Você não tem agendamentos futuros."
    }

    const lines = [
      `📅 Seus próximos agendamentos (${dto.total}):\n`,
    ]

    for (let i = 0; i < dto.appointments.length; i++) {
      const apt = dto.appointments[i]
      lines.push(
        `${i + 1}. ${apt.serviceName} com ${apt.professionalName}\n` +
        `   📅 ${apt.startsAt}\n` +
        `   🔖 ID: ${apt.id}`
      )
    }

    return lines.join("\n")
  }

  /**
   * Formata para JSON (resposta estruturada)
   */
  static toJSON(dto: AppointmentDTO): Record<string, unknown> {
    return {
      id: dto.id,
      service: dto.serviceName,
      professional: dto.professionalName,
      startsAt: dto.startsAtISO,
      endsAt: dto.endsAtISO,
      status: dto.status,
      notes: dto.notes,
      message: this.format(dto),
    }
  }

  /**
   * Formata lista para JSON
   */
  static listToJSON(dto: AppointmentListDTO): Record<string, unknown> {
    return {
      appointments: dto.appointments.map((apt) => ({
        id: apt.id,
        service: apt.serviceName,
        professional: apt.professionalName,
        startsAt: apt.startsAtISO,
        endsAt: apt.endsAtISO,
        status: apt.status,
      })),
      total: dto.total,
      message: dto.message,
    }
  }
}
