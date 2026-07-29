import { describe, it, expect } from "vitest"
import { shouldResumeAI, aiResumesAt } from "@/lib/services/chat/manual-mode"

describe("shouldResumeAI", () => {
  const now = new Date("2026-07-29T18:00:00Z")
  const minutesAgo = (n: number) => new Date(now.getTime() - n * 60_000)

  it("não retoma chat que já está automático", () => {
    expect(shouldResumeAI({ isManual: false, manualSince: null }, 120, now)).toBe(false)
    // Nem se sobrou manualSince de uma virada antiga.
    expect(shouldResumeAI({ isManual: false, manualSince: minutesAgo(999) }, 120, now)).toBe(false)
  })

  it("política desligada nunca retoma — é o comportamento histórico", () => {
    const manual = { isManual: true, manualSince: minutesAgo(10_000) }
    expect(shouldResumeAI(manual, null, now)).toBe(false)
    expect(shouldResumeAI(manual, undefined, now)).toBe(false)
    expect(shouldResumeAI(manual, 0, now)).toBe(false)
  })

  it("retoma quando o silêncio humano atinge o prazo", () => {
    expect(shouldResumeAI({ isManual: true, manualSince: minutesAgo(119) }, 120, now)).toBe(false)
    expect(shouldResumeAI({ isManual: true, manualSince: minutesAgo(120) }, 120, now)).toBe(true)
    expect(shouldResumeAI({ isManual: true, manualSince: minutesAgo(121) }, 120, now)).toBe(true)
  })

  it("sem manualSince NÃO retoma — erro seguro é ficar manual", () => {
    // Chat que virou manual antes da 024 e cujo backfill não pegou: sem âncora
    // de tempo, retomar seria chutar, e o chute faz a IA falar em cima de um
    // atendimento humano em andamento.
    expect(shouldResumeAI({ isManual: true, manualSince: null }, 120, now)).toBe(false)
  })

  it("não retoma com manualSince no futuro (relógio torto)", () => {
    const future = new Date(now.getTime() + 60 * 60_000)
    expect(shouldResumeAI({ isManual: true, manualSince: future }, 120, now)).toBe(false)
  })
})

describe("aiResumesAt", () => {
  const manualSince = new Date("2026-07-29T12:00:00Z")

  it("devolve o instante da retomada", () => {
    expect(aiResumesAt({ isManual: true, manualSince }, 120)).toEqual(
      new Date("2026-07-29T14:00:00Z"),
    )
  })

  it("devolve null quando não há retomada a anunciar", () => {
    expect(aiResumesAt({ isManual: true, manualSince }, null)).toBeNull()
    expect(aiResumesAt({ isManual: true, manualSince: null }, 120)).toBeNull()
    expect(aiResumesAt({ isManual: false, manualSince }, 120)).toBeNull()
  })

  it("é consistente com shouldResumeAI na fronteira", () => {
    const at = aiResumesAt({ isManual: true, manualSince }, 120)!
    expect(shouldResumeAI({ isManual: true, manualSince }, 120, at)).toBe(true)
    expect(
      shouldResumeAI({ isManual: true, manualSince }, 120, new Date(at.getTime() - 1)),
    ).toBe(false)
  })
})
