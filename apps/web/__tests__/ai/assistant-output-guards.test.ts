import { describe, expect, it } from "vitest"
import { z } from "zod"
import {
  INTERNAL_INSTRUCTION_MARKER,
  LEAKED_ERROR_FALLBACK_MESSAGE,
  describeSchemaValidationError,
  extractValidationIssues,
  looksLikeLeakedErrorJson,
  shouldScrubAsLeak,
} from "@/lib/services/ai/assistant-output-guards"
import {
  isTechnicalToolMessage,
  resolveFriendlyAvailabilityErrorMessage,
} from "@/lib/services/ai/availability-message-policy"

// Reproduz o schema real de data usado pelas tools de availability/appointment.
const dateSchema = z.object({
  date: z
    .string()
    .min(1, "Data/hora é obrigatória")
    .refine((v) => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(v), {
      message:
        "Formato inválido. Use ISO 8601: '2025-01-01T10:00:00' ou '2025-01-01T10:00:00-03:00'",
    }),
})

function captureZodError(value: unknown): unknown {
  try {
    dateSchema.parse(value)
  } catch (error) {
    return error
  }
  throw new Error("expected schema to fail")
}

describe("describeSchemaValidationError", () => {
  it("não devolve o array cru de issues do Zod", () => {
    const error = captureZodError({ date: "segunda-feira dia 30" })
    const instruction = describeSchemaValidationError("checkAvailability", error)

    // O bug original: a instrução continha o JSON cru de issues.
    expect(instruction).not.toContain('"code"')
    expect(instruction).not.toContain('"path"')
    expect(instruction).not.toMatch(/^\s*[[{]/)
  })

  it("aponta o campo inválido e instrui o modelo a não repassar", () => {
    const error = captureZodError({ date: "amanhã às 10h" })
    const instruction = describeSchemaValidationError("checkAvailability", error)

    expect(instruction).toContain("checkAvailability")
    expect(instruction).toContain("'date'")
    expect(instruction).toContain(INTERNAL_INSTRUCTION_MARKER)
    expect(instruction).toContain("ISO 8601")
  })

  it("é classificada como mensagem técnica pela availability policy", () => {
    const error = captureZodError({ date: "30/06" })
    const instruction = describeSchemaValidationError("checkAvailability", error)

    // Garante que a instrução interna NUNCA seja repassada verbatim ao cliente
    // pelo caminho resolveFriendlyAvailabilityErrorMessage.
    expect(isTechnicalToolMessage(instruction)).toBe(true)
    expect(
      resolveFriendlyAvailabilityErrorMessage([
        { toolName: "checkAvailability", error: instruction },
      ])
    ).toBeNull()
  })

  it("funciona com erro sem issues (fallback genérico)", () => {
    const instruction = describeSchemaValidationError("addAppointment", new Error("boom"))
    expect(instruction).toContain("addAppointment")
    expect(instruction).toContain(INTERNAL_INSTRUCTION_MARKER)
    expect(instruction).not.toContain("undefined")
  })
})

describe("extractValidationIssues", () => {
  it("extrai issues de um ZodError", () => {
    const error = captureZodError({ date: "" })
    const issues = extractValidationIssues(error)
    expect(issues.length).toBeGreaterThan(0)
    expect(issues[0]?.path).toEqual(["date"])
  })

  it("retorna [] para erros sem issues", () => {
    expect(extractValidationIssues(new Error("x"))).toEqual([])
    expect(extractValidationIssues(null)).toEqual([])
    expect(extractValidationIssues("string")).toEqual([])
  })
})

describe("looksLikeLeakedErrorJson", () => {
  it("detecta o array cru de issues do Zod (bug de produção)", () => {
    const leaked =
      '[ { "code": "custom", "path": [ "date" ], "message": "Formato inválido. Use ISO 8601: \'2025-01-01T10:00:00\'" } ]'
    expect(looksLikeLeakedErrorJson(leaked)).toBe(true)
  })

  it("detecta objeto de erro único", () => {
    expect(looksLikeLeakedErrorJson('{"error":true,"message":"falhou"}')).toBe(true)
  })

  it("ignora texto conversacional normal", () => {
    expect(looksLikeLeakedErrorJson("Claro! Que dia você prefere para o corte?")).toBe(false)
    expect(looksLikeLeakedErrorJson("Temos horários às 10h e 14h amanhã.")).toBe(false)
  })

  it("ignora texto que apenas menciona as palavras sem ser JSON", () => {
    expect(looksLikeLeakedErrorJson("Seu código de confirmação é 1234.")).toBe(false)
  })

  it("ignora string vazia", () => {
    expect(looksLikeLeakedErrorJson("")).toBe(false)
    expect(looksLikeLeakedErrorJson("   ")).toBe(false)
  })
})

describe("shouldScrubAsLeak", () => {
  it("marca JSON de erro vazado", () => {
    expect(shouldScrubAsLeak('[{"path":["date"],"message":"x"}]')).toBe(true)
  })

  it("marca instrução interna ecoada pelo modelo", () => {
    const echoed = `Argumento inválido em 'date'. ${INTERNAL_INSTRUCTION_MARKER}; corrija.`
    expect(shouldScrubAsLeak(echoed)).toBe(true)
  })

  it("não marca resposta amigável legítima", () => {
    expect(shouldScrubAsLeak("Perfeito, vou confirmar para sexta às 10h.")).toBe(false)
  })
})

describe("constants", () => {
  it("o fallback é amigável e não contém JSON", () => {
    expect(LEAKED_ERROR_FALLBACK_MESSAGE).not.toMatch(/[[{]/)
    expect(LEAKED_ERROR_FALLBACK_MESSAGE.length).toBeGreaterThan(0)
  })
})
