import { describe, it, expect } from "vitest"
import { mapServiceError } from "../../../../src/application/use-cases/appointment/appointment-error.mapper"

describe("mapServiceError (bug A2)", () => {
  it("mapeia APPOINTMENT_NOT_FOUND", () => {
    expect(mapServiceError("APPOINTMENT_NOT_FOUND", "x").code).toBe("APPOINTMENT_NOT_FOUND")
  })

  it("mapeia APPOINTMENT_CONFLICT", () => {
    expect(mapServiceError("APPOINTMENT_CONFLICT", "x").code).toBe("APPOINTMENT_CONFLICT")
  })

  it("mapeia PAST_APPOINTMENT", () => {
    expect(mapServiceError("PAST_APPOINTMENT", "x").code).toBe("PAST_APPOINTMENT")
  })

  it("mapeia PROFESSIONAL_CANNOT_PERFORM_SERVICE", () => {
    expect(mapServiceError("PROFESSIONAL_CANNOT_PERFORM_SERVICE", "x").code).toBe(
      "PROFESSIONAL_CANNOT_PERFORM_SERVICE"
    )
  })

  it("mapeia PROFESSIONAL_NOT_AVAILABLE", () => {
    expect(mapServiceError("PROFESSIONAL_NOT_AVAILABLE", "x").code).toBe("PROFESSIONAL_NOT_AVAILABLE")
  })

  it("NÃO mascara erro desconhecido como 'não encontrado' e repassa a mensagem real", () => {
    const err = mapServiceError(undefined, "Não é possível atualizar um agendamento cancelado")
    expect(err.code).toBe("APPOINTMENT_OPERATION_FAILED")
    expect(err.code).not.toBe("APPOINTMENT_NOT_FOUND")
    expect(err.message).toBe("Não é possível atualizar um agendamento cancelado")
  })
})
