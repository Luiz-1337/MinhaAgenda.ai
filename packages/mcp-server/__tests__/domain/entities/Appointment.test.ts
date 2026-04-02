import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { Appointment, AppointmentProps } from "../../../src/domain/entities/Appointment"

function makeProps(overrides: Partial<AppointmentProps> = {}): AppointmentProps {
  return {
    id: "apt-1",
    salonId: "salon-1",
    customerId: "cust-1",
    professionalId: "prof-1",
    serviceId: "svc-1",
    startsAt: new Date("2026-06-15T14:00:00Z"),
    endsAt: new Date("2026-06-15T15:00:00Z"),
    status: "pending",
    ...overrides,
  }
}

describe("Appointment", () => {
  beforeEach(() => {
    // Fixar "agora" em 2026-06-01 12:00 UTC — antes dos agendamentos padrão
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-06-01T12:00:00Z"))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe("create / fromPersistence", () => {
    it("cria um agendamento com todas as propriedades", () => {
      const apt = Appointment.create(makeProps())
      expect(apt.id).toBe("apt-1")
      expect(apt.salonId).toBe("salon-1")
      expect(apt.customerId).toBe("cust-1")
      expect(apt.professionalId).toBe("prof-1")
      expect(apt.serviceId).toBe("svc-1")
      expect(apt.status).toBe("pending")
    })

    it("fromPersistence reconstrói a entidade", () => {
      const apt = Appointment.fromPersistence(makeProps({ status: "confirmed" }))
      expect(apt.status).toBe("confirmed")
    })
  })

  describe("duration", () => {
    it("calcula duração em minutos", () => {
      const apt = Appointment.create(makeProps())
      expect(apt.duration).toBe(60)
    })

    it("calcula duração de 30 minutos", () => {
      const apt = Appointment.create(
        makeProps({ endsAt: new Date("2026-06-15T14:30:00Z") })
      )
      expect(apt.duration).toBe(30)
    })
  })

  describe("isUpcoming", () => {
    it("retorna true para agendamento futuro e não cancelado", () => {
      const apt = Appointment.create(makeProps())
      expect(apt.isUpcoming()).toBe(true)
    })

    it("retorna false para agendamento cancelado mesmo se futuro", () => {
      const apt = Appointment.create(makeProps({ status: "cancelled" }))
      expect(apt.isUpcoming()).toBe(false)
    })

    it("retorna false para agendamento passado", () => {
      const apt = Appointment.create(
        makeProps({
          startsAt: new Date("2026-05-01T14:00:00Z"),
          endsAt: new Date("2026-05-01T15:00:00Z"),
        })
      )
      expect(apt.isUpcoming()).toBe(false)
    })
  })

  describe("isPast", () => {
    it("retorna true quando endsAt é anterior ao agora", () => {
      const apt = Appointment.create(
        makeProps({
          startsAt: new Date("2026-05-01T14:00:00Z"),
          endsAt: new Date("2026-05-01T15:00:00Z"),
        })
      )
      expect(apt.isPast()).toBe(true)
    })

    it("retorna false quando endsAt é futuro", () => {
      const apt = Appointment.create(makeProps())
      expect(apt.isPast()).toBe(false)
    })

    it("retorna false quando está em andamento", () => {
      const apt = Appointment.create(
        makeProps({
          startsAt: new Date("2026-06-01T11:00:00Z"),
          endsAt: new Date("2026-06-01T13:00:00Z"),
        })
      )
      expect(apt.isPast()).toBe(false)
    })
  })

  describe("isInProgress", () => {
    it("retorna true quando agora está entre start e end", () => {
      const apt = Appointment.create(
        makeProps({
          startsAt: new Date("2026-06-01T11:00:00Z"),
          endsAt: new Date("2026-06-01T13:00:00Z"),
        })
      )
      expect(apt.isInProgress()).toBe(true)
    })

    it("retorna false para agendamento futuro", () => {
      const apt = Appointment.create(makeProps())
      expect(apt.isInProgress()).toBe(false)
    })
  })

  describe("canBeModified", () => {
    it("retorna true para agendamento futuro pendente", () => {
      const apt = Appointment.create(makeProps())
      expect(apt.canBeModified()).toBe(true)
    })

    it("retorna true para agendamento futuro confirmado", () => {
      const apt = Appointment.create(makeProps({ status: "confirmed" }))
      expect(apt.canBeModified()).toBe(true)
    })

    it("retorna false para agendamento cancelado", () => {
      const apt = Appointment.create(makeProps({ status: "cancelled" }))
      expect(apt.canBeModified()).toBe(false)
    })

    it("retorna false para agendamento completado", () => {
      const apt = Appointment.create(makeProps({ status: "completed" }))
      expect(apt.canBeModified()).toBe(false)
    })

    it("retorna false para agendamento passado", () => {
      const apt = Appointment.create(
        makeProps({
          startsAt: new Date("2026-05-01T14:00:00Z"),
          endsAt: new Date("2026-05-01T15:00:00Z"),
        })
      )
      expect(apt.canBeModified()).toBe(false)
    })
  })

  describe("overlaps", () => {
    it("detecta sobreposição entre dois agendamentos", () => {
      const a = Appointment.create(makeProps())
      const b = Appointment.create(
        makeProps({
          id: "apt-2",
          startsAt: new Date("2026-06-15T14:30:00Z"),
          endsAt: new Date("2026-06-15T15:30:00Z"),
        })
      )
      expect(a.overlaps(b)).toBe(true)
    })

    it("retorna false para agendamentos adjacentes", () => {
      const a = Appointment.create(makeProps())
      const b = Appointment.create(
        makeProps({
          id: "apt-2",
          startsAt: new Date("2026-06-15T15:00:00Z"),
          endsAt: new Date("2026-06-15T16:00:00Z"),
        })
      )
      expect(a.overlaps(b)).toBe(false)
    })

    it("ignora agendamento cancelado (this)", () => {
      const a = Appointment.create(makeProps({ status: "cancelled" }))
      const b = Appointment.create(
        makeProps({
          id: "apt-2",
          startsAt: new Date("2026-06-15T14:30:00Z"),
          endsAt: new Date("2026-06-15T15:30:00Z"),
        })
      )
      expect(a.overlaps(b)).toBe(false)
    })

    it("ignora agendamento cancelado (other)", () => {
      const a = Appointment.create(makeProps())
      const b = Appointment.create(
        makeProps({
          id: "apt-2",
          status: "cancelled",
          startsAt: new Date("2026-06-15T14:30:00Z"),
          endsAt: new Date("2026-06-15T15:30:00Z"),
        })
      )
      expect(a.overlaps(b)).toBe(false)
    })
  })

  describe("cancel", () => {
    it("cancela agendamento futuro com sucesso", () => {
      const apt = Appointment.create(makeProps())
      const result = apt.cancel()
      expect(result.success).toBe(true)
      expect(apt.status).toBe("cancelled")
    })

    it("falha ao cancelar agendamento passado", () => {
      const apt = Appointment.create(
        makeProps({
          startsAt: new Date("2026-05-01T14:00:00Z"),
          endsAt: new Date("2026-05-01T15:00:00Z"),
        })
      )
      const result = apt.cancel()
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe("PAST_APPOINTMENT")
      }
    })
  })

  describe("confirm", () => {
    it("confirma agendamento futuro com sucesso", () => {
      const apt = Appointment.create(makeProps())
      const result = apt.confirm()
      expect(result.success).toBe(true)
      expect(apt.status).toBe("confirmed")
    })

    it("falha ao confirmar agendamento passado", () => {
      const apt = Appointment.create(
        makeProps({
          startsAt: new Date("2026-05-01T14:00:00Z"),
          endsAt: new Date("2026-05-01T15:00:00Z"),
        })
      )
      const result = apt.confirm()
      expect(result.success).toBe(false)
    })
  })

  describe("complete", () => {
    it("marca como completado", () => {
      const apt = Appointment.create(makeProps())
      apt.complete()
      expect(apt.status).toBe("completed")
    })
  })

  describe("reschedule", () => {
    it("reagenda para data futura com sucesso", () => {
      const apt = Appointment.create(makeProps())
      const newStart = new Date("2026-06-20T10:00:00Z")
      const newEnd = new Date("2026-06-20T11:00:00Z")

      const result = apt.reschedule(newStart, newEnd)
      expect(result.success).toBe(true)
      expect(apt.startsAt).toEqual(newStart)
      expect(apt.endsAt).toEqual(newEnd)
    })

    it("falha ao reagendar agendamento passado", () => {
      const apt = Appointment.create(
        makeProps({
          startsAt: new Date("2026-05-01T14:00:00Z"),
          endsAt: new Date("2026-05-01T15:00:00Z"),
        })
      )
      const result = apt.reschedule(
        new Date("2026-06-20T10:00:00Z"),
        new Date("2026-06-20T11:00:00Z")
      )
      expect(result.success).toBe(false)
    })

    it("falha ao reagendar para horário passado", () => {
      const apt = Appointment.create(makeProps())
      const result = apt.reschedule(
        new Date("2026-05-01T10:00:00Z"),
        new Date("2026-05-01T11:00:00Z")
      )
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.message).toContain("horário passado")
      }
    })
  })

  describe("changeProfessional", () => {
    it("troca profissional em agendamento modificável", () => {
      const apt = Appointment.create(makeProps())
      const result = apt.changeProfessional("prof-2")
      expect(result.success).toBe(true)
      expect(apt.professionalId).toBe("prof-2")
    })

    it("falha em agendamento cancelado", () => {
      const apt = Appointment.create(makeProps({ status: "cancelled" }))
      const result = apt.changeProfessional("prof-2")
      expect(result.success).toBe(false)
    })
  })

  describe("changeService", () => {
    it("troca serviço sem alterar duração", () => {
      const apt = Appointment.create(makeProps())
      const originalEnd = apt.endsAt

      const result = apt.changeService("svc-2")
      expect(result.success).toBe(true)
      expect(apt.serviceId).toBe("svc-2")
      expect(apt.endsAt).toEqual(originalEnd)
    })

    it("troca serviço e ajusta duração", () => {
      const apt = Appointment.create(makeProps())
      const result = apt.changeService("svc-2", 30) // 30 minutos
      expect(result.success).toBe(true)
      expect(apt.duration).toBe(30)
    })

    it("falha em agendamento completado", () => {
      const apt = Appointment.create(makeProps({ status: "completed" }))
      const result = apt.changeService("svc-2")
      expect(result.success).toBe(false)
    })
  })

  describe("updateNotes", () => {
    it("atualiza notas", () => {
      const apt = Appointment.create(makeProps())
      apt.updateNotes("Observação importante")
      expect(apt.notes).toBe("Observação importante")
    })

    it("limpa notas com null", () => {
      const apt = Appointment.create(makeProps({ notes: "teste" }))
      apt.updateNotes(null)
      expect(apt.notes).toBeNull()
    })
  })

  describe("toPersistence", () => {
    it("retorna todas as propriedades para persistência", () => {
      const apt = Appointment.create(makeProps({ notes: "obs", googleEventId: "g-1" }))
      const data = apt.toPersistence()

      expect(data.id).toBe("apt-1")
      expect(data.salonId).toBe("salon-1")
      expect(data.customerId).toBe("cust-1")
      expect(data.professionalId).toBe("prof-1")
      expect(data.serviceId).toBe("svc-1")
      expect(data.status).toBe("pending")
      expect(data.notes).toBe("obs")
      expect(data.googleEventId).toBe("g-1")
    })
  })
})
