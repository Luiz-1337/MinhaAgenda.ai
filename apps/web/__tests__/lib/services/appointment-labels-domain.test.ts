import { describe, it, expect } from "vitest"
import {
  APPOINTMENT_LABEL_COLORS,
  labelTextColor,
  planAppointmentLabel,
} from "@repo/db/src/domain/appointment-labels"

/**
 * A regra das etiquetas da agenda, testada sem banco (docs/ROADMAP.md, fase 7,
 * fatia 7b).
 *
 * O que estes testes seguram: etiqueta tem nome e cor válidos, e o nome escrito em
 * cima da cor continua legível — em todas as cores que a tela oferece.
 */

describe("planAppointmentLabel", () => {
  it("enxuga o nome e põe a cor em minúsculas", () => {
    expect(planAppointmentLabel({ name: "  Primeira   vez ", color: "#3B82F6" })).toEqual({
      ok: true,
      label: { name: "Primeira vez", color: "#3b82f6" },
    })
  })

  it("recusa nome vazio ou longo demais", () => {
    expect(planAppointmentLabel({ name: "   ", color: "#3b82f6" })).toEqual({
      ok: false,
      error: "Dê um nome à etiqueta",
    })
    expect(planAppointmentLabel({ name: "a".repeat(31), color: "#3b82f6" }).ok).toBe(false)
    expect(planAppointmentLabel({ name: "a".repeat(30), color: "#3b82f6" }).ok).toBe(true)
    expect(planAppointmentLabel({ name: null, color: "#3b82f6" }).ok).toBe(false)
  })

  it("a cor é #RRGGBB: nome de cor, 3 dígitos e lixo são recusados", () => {
    for (const color of ["red", "#fff", "3b82f6", "#3b82f6ff", "", null, "#zzzzzz"]) {
      expect(planAppointmentLabel({ name: "Encaixe", color }).ok).toBe(false)
    }
  })

  it("todas as cores oferecidas na tela são aceitas", () => {
    for (const color of APPOINTMENT_LABEL_COLORS) {
      expect(planAppointmentLabel({ name: "Encaixe", color }).ok).toBe(true)
    }
  })
})

describe("labelTextColor", () => {
  it("fundo claro pede texto preto; fundo escuro, branco", () => {
    expect(labelTextColor("#ffffff")).toBe("#000000")
    expect(labelTextColor("#eab308")).toBe("#000000")
    expect(labelTextColor("#000000")).toBe("#ffffff")
    expect(labelTextColor("#1e3a8a")).toBe("#ffffff")
  })

  it("cor que não é #RRGGBB cai no preto, sem quebrar", () => {
    expect(labelTextColor("azul")).toBe("#000000")
    expect(labelTextColor("")).toBe("#000000")
  })

  it("em toda cor da tela, o texto escolhido tem contraste de pelo menos 4,5:1", () => {
    const luminance = (color: string) => {
      const channel = (hex: string) => {
        const value = parseInt(hex, 16) / 255
        return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
      }
      return (
        0.2126 * channel(color.slice(1, 3)) + 0.7152 * channel(color.slice(3, 5)) + 0.0722 * channel(color.slice(5, 7))
      )
    }

    for (const color of APPOINTMENT_LABEL_COLORS) {
      const background = luminance(color)
      const text = luminance(labelTextColor(color))
      const contrast = (Math.max(background, text) + 0.05) / (Math.min(background, text) + 0.05)
      expect(contrast, `contraste do texto sobre ${color}`).toBeGreaterThanOrEqual(4.5)
    }
  })
})
