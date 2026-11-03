import { describe, it, expect } from "vitest"
import {
  mapKnownServiceError,
  mapServiceError,
} from "../../../../src/application/use-cases/appointment/appointment-error.mapper"

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

  it("mapeia service_rule_violation (regra de agenda do serviço) mantendo o texto do serviço", () => {
    const err = mapServiceError("service_rule_violation", "Este serviço só é realizado em: Ter, Qui.")
    expect(err.code).toBe("SERVICE_RULE_VIOLATION")
    expect(err.message).toBe("Este serviço só é realizado em: Ter, Qui.")
  })

  it("mapKnownServiceError devolve null sem código ou com código desconhecido", () => {
    expect(mapKnownServiceError(undefined, "x")).toBeNull()
    expect(mapKnownServiceError("APPOINTMENT_CANCELLED", "x")).toBeNull()
  })

  it("NÃO mascara erro desconhecido como 'não encontrado' e repassa a mensagem real", () => {
    const err = mapServiceError(undefined, "Não é possível atualizar um agendamento cancelado")
    expect(err.code).toBe("APPOINTMENT_OPERATION_FAILED")
    expect(err.code).not.toBe("APPOINTMENT_NOT_FOUND")
    expect(err.message).toBe("Não é possível atualizar um agendamento cancelado")
  })
})
