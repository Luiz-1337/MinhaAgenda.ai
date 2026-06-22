import { describe, it, expect } from "vitest"
import { needsConflictCheck, isPastBooking } from "../../src/services/appointment-rules"

describe("needsConflictCheck (bug C2)", () => {
  it("NÃO checa quando nada relevante muda (ex.: só as notas)", () => {
    expect(
      needsConflictCheck({ dateChanged: false, professionalChanged: false, serviceChanged: false })
    ).toBe(false)
  })

  it("checa quando a data muda", () => {
    expect(
      needsConflictCheck({ dateChanged: true, professionalChanged: false, serviceChanged: false })
    ).toBe(true)
  })

  it("checa quando o profissional muda", () => {
    expect(
      needsConflictCheck({ dateChanged: false, professionalChanged: true, serviceChanged: false })
    ).toBe(true)
  })

  it("checa quando SÓ o serviço muda (duração muda → evita double-booking, bug C2)", () => {
    expect(
      needsConflictCheck({ dateChanged: false, professionalChanged: false, serviceChanged: true })
    ).toBe(true)
  })
})

describe("isPastBooking (bug C3)", () => {
  const now = new Date("2026-06-05T12:00:00.000Z")

  it("rejeita um instante no passado", () => {
    expect(isPastBooking(new Date("2026-06-05T11:59:59.000Z"), now)).toBe(true)
  })

  it("rejeita um instante bem no passado (data histórica)", () => {
    expect(isPastBooking(new Date("2025-01-01T10:00:00.000Z"), now)).toBe(true)
  })

  it("aceita um instante no futuro", () => {
    expect(isPastBooking(new Date("2026-06-05T12:00:01.000Z"), now)).toBe(false)
  })
})
