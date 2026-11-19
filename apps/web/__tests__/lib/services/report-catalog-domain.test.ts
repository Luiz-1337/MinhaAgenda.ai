import { describe, it, expect } from "vitest"
import {
  REPORT_CATALOG,
  REPORT_CATEGORIES,
  isReportKey,
  resolveReportCatalog,
  sanitizeReportFavorites,
} from "@repo/db/src/domain/report-catalog"
import { ALL_PERMISSION_KEYS, SALON_MODULES, isPermissionKey, isSalonModule } from "@repo/db/src/domain/permissions"

/**
 * O catálogo de relatórios, testado sem banco (docs/ROADMAP.md, fase 9, fatia 9a).
 *
 * O que estes testes seguram: o catálogo é o da auditoria (38 sub-relatórios mais
 * o painel de profissionais), cada relatório aponta para módulo e permissão que
 * existem, e a central só mostra o que a pessoa abriria.
 */

describe("o catálogo", () => {
  it("tem os 38 sub-relatórios da auditoria e o painel de profissionais", () => {
    const perCategory = Object.fromEntries(
      REPORT_CATEGORIES.map((category) => [
        category.key,
        REPORT_CATALOG.filter((report) => report.category === category.key).length,
      ])
    )
    expect(perCategory).toEqual({
      finance: 10,
      appointments: 5,
      customers: 7,
      sales: 6,
      inventory: 6,
      tax: 1,
      ranking: 2,
      messages: 1,
      professionals: 1,
    })
    expect(REPORT_CATALOG).toHaveLength(39)
  })

  it("chaves únicas, no formato que o banco aceita, com a categoria na frente", () => {
    const keys = REPORT_CATALOG.map((report) => report.key)
    expect(new Set(keys).size).toBe(keys.length)
    for (const report of REPORT_CATALOG) {
      expect(report.key).toMatch(/^[a-z_]{1,40}\.[a-z_]{1,40}$/)
      expect(report.key.startsWith(`${report.category}.`)).toBe(true)
    }
  })

  it("quem tem tela aponta para módulo e permissão que existem; quem não tem diz onde está previsto", () => {
    for (const report of REPORT_CATALOG) {
      if (report.target) {
        expect(isPermissionKey(report.target.permission)).toBe(true)
        if (report.target.module) expect(isSalonModule(report.target.module)).toBe(true)
        expect(report.target.path).not.toMatch(/^\/|\/$/)
      } else {
        expect(report.planned).toBeTruthy()
      }
    }
  })
})

describe("resolveReportCatalog", () => {
  const keysOf = (access: { modules: string[]; permissions: string[] }) =>
    resolveReportCatalog(access).flatMap((category) => category.reports)

  it("dono de salão com tudo ligado vê os 39, e abre os que já têm tela", () => {
    const reports = keysOf({ modules: [...SALON_MODULES], permissions: [...ALL_PERMISSION_KEYS] })
    expect(reports).toHaveLength(39)
    expect(reports.filter((report) => report.path)).toHaveLength(REPORT_CATALOG.filter((report) => report.target).length)
    expect(reports.find((report) => report.key === "finance.cash_history")).toMatchObject({
      path: "finance/cash",
      planned: null,
    })
    expect(reports.find((report) => report.key === "tax.all")).toMatchObject({ path: null, planned: "fase 10" })
  })

  it("módulo desligado esconde o relatório, mesmo com a permissão", () => {
    const reports = keysOf({ modules: ["reports"], permissions: [...ALL_PERMISSION_KEYS] })
    // Só o que não depende de módulo (a lista de contatos) abre.
    expect(reports.filter((report) => report.path).map((report) => report.key)).toEqual(["customers.list"])
    // O que ainda não existe continua aparecendo, como "em breve".
    expect(reports.some((report) => report.key === "finance.projection")).toBe(true)
    expect(reports.some((report) => report.key === "finance.results")).toBe(false)
  })

  it("sem a permissão da tela, o relatório não aparece", () => {
    const reports = keysOf({ modules: [...SALON_MODULES], permissions: ["reports.access", "finance.access"] })
    const open = reports.filter((report) => report.path).map((report) => report.key)
    expect(open).toContain("finance.results")
    // O histórico de caixa pede `cash.access`, não `finance.access`.
    expect(open).not.toContain("finance.cash_history")
    expect(open).not.toContain("customers.list")
  })

  it("categoria sem nada para mostrar some", () => {
    const categories = resolveReportCatalog({ modules: [], permissions: [] }).map((category) => category.key)
    // Mensagens só tem relatório com tela (de módulo): sem o módulo, a categoria some.
    expect(categories).not.toContain("messages")
    expect(categories).toContain("tax")
  })
})

describe("favoritos", () => {
  it("só chaves do catálogo, sem repetição, na ordem gravada", () => {
    expect(isReportKey("finance.results")).toBe(true)
    expect(isReportKey("finance.inexistente")).toBe(false)
    expect(isReportKey(null)).toBe(false)
    expect(sanitizeReportFavorites(["sales.orders", "x.y", "finance.results", "sales.orders", 3])).toEqual([
      "sales.orders",
      "finance.results",
    ])
    expect(sanitizeReportFavorites("finance.results")).toEqual([])
  })
})
