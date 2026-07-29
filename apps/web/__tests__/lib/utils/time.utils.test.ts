import { describe, it, expect } from "vitest"
import { formatPreviewTime } from "@/lib/utils/time.utils"

/**
 * O caso que motivou estes testes: `getChatConversations` mostrava `19:35` para
 * uma conversa de três semanas atrás, indistinguível de hoje às 19:35. Havia
 * DUAS cópias da função (chats.ts e kanban.ts) e só a do kanban estava certa —
 * a duplicação é que permitiu a divergência. Agora é uma só, com teste.
 */
describe("formatPreviewTime", () => {
  // Sexta, 24/07/2026, 15:00 BRT = 18:00 UTC.
  const now = new Date("2026-07-24T18:00:00Z")
  const minutesAgo = (n: number) => new Date(now.getTime() - n * 60_000)
  const hoursAgo = (n: number) => new Date(now.getTime() - n * 3_600_000)
  const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000)

  it("mostra minutos na última hora", () => {
    expect(formatPreviewTime(minutesAgo(0), now)).toBe("0m")
    expect(formatPreviewTime(minutesAgo(1), now)).toBe("1m")
    expect(formatPreviewTime(minutesAgo(59), now)).toBe("59m")
  })

  it("mostra horas até 24h", () => {
    expect(formatPreviewTime(minutesAgo(60), now)).toBe("1h")
    expect(formatPreviewTime(hoursAgo(23), now)).toBe("23h")
  })

  it("mostra Ontem no segundo dia e dias até 7", () => {
    expect(formatPreviewTime(hoursAgo(24), now)).toBe("Ontem")
    expect(formatPreviewTime(daysAgo(2), now)).toBe("2d")
    expect(formatPreviewTime(daysAgo(6), now)).toBe("6d")
  })

  it("a partir de 7 dias mostra DATA, nunca hora — o bug original", () => {
    const label = formatPreviewTime(daysAgo(7), now)
    expect(label).toBe("17/07")
    // A regressão a travar: qualquer rótulo antigo com ':' é hora disfarçada.
    expect(label).not.toContain(":")
  })

  it("conversa de semanas atrás não vira hora", () => {
    const label = formatPreviewTime(daysAgo(21), now)
    expect(label).toBe("03/07")
    expect(label).not.toContain(":")
  })

  it("inclui o ano quando a conversa é de outro ano", () => {
    // 20/12/2025 — mesmo dia/mês existe em 2026, então sem o ano seria ambíguo.
    expect(formatPreviewTime(new Date("2025-12-20T18:00:00Z"), now)).toBe("20/12/2025")
  })

  it("usa o fuso de Brasília, não o do servidor (UTC na Vercel)", () => {
    // 22:30 BRT de 16/07 = 01:30 UTC de 17/07. Em UTC o rótulo sairia 17/07.
    expect(formatPreviewTime(new Date("2026-07-17T01:30:00Z"), now)).toBe("16/07")
  })

  it("não produz tempo negativo para data no futuro", () => {
    expect(formatPreviewTime(new Date(now.getTime() + 5 * 60_000), now)).toBe("0m")
  })
})
