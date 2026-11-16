import { describe, it, expect } from "vitest"
import {
  ALL_PERMISSION_KEYS,
  LEGACY_STAFF_PERMISSIONS,
  parseSalonModules,
  resolvePermissions,
  sanitizePermissionKeys,
  type ProfessionalPermissionSource,
} from "@repo/db/src/domain/permissions"
import { classifySalonAccess } from "@/lib/services/permissions.service"

/**
 * A regra de permissão por recurso × ação, testada sem banco (docs/ROADMAP.md,
 * fase 0).
 *
 * O que estes testes seguram, acima de tudo, é a COMPATIBILIDADE: no dia em que a
 * migration 036 entra, todas as linhas têm perfil e personalizado nulos, e ninguém
 * pode ganhar nem perder acesso por isso.
 */

function row(overrides: Partial<ProfessionalPermissionSource>): ProfessionalPermissionSource {
  return {
    role: "STAFF",
    isActive: true,
    customPermissions: null,
    profilePermissions: null,
    ...overrides,
  }
}

const ALL = [...ALL_PERMISSION_KEYS].sort()
const sorted = (set: ReadonlySet<string>) => [...set].sort()

describe("resolvePermissions — sem nada configurado, vale o cargo", () => {
  it("dono do salão pode tudo, sem linha em professionals", () => {
    expect(sorted(resolvePermissions(true, []))).toEqual(ALL)
  })

  it("MANAGER sem perfil pode tudo", () => {
    expect(sorted(resolvePermissions(false, [row({ role: "MANAGER" })]))).toEqual(ALL)
  })

  it("STAFF sem perfil tem só o conjunto legado", () => {
    expect(sorted(resolvePermissions(false, [row({ role: "STAFF" })]))).toEqual(
      [...LEGACY_STAFF_PERMISSIONS].sort()
    )
  })

  it("sem vínculo, ou com vínculo inativo, não pode nada", () => {
    expect(resolvePermissions(false, []).size).toBe(0)
    expect(resolvePermissions(false, [row({ role: "MANAGER", isActive: false })]).size).toBe(0)
  })

  it("concorda com classifySalonAccess: quem gerencia pode tudo, quem não entra não pode nada", () => {
    const cases: { role: "OWNER" | "MANAGER" | "STAFF"; isActive: boolean }[][] = [
      [],
      [{ role: "STAFF", isActive: true }],
      [{ role: "MANAGER", isActive: true }],
      [{ role: "OWNER", isActive: true }],
      [{ role: "MANAGER", isActive: false }],
      [{ role: "STAFF", isActive: true }, { role: "MANAGER", isActive: true }],
    ]

    for (const rows of cases) {
      const level = classifySalonAccess(false, rows)
      const granted = resolvePermissions(false, rows.map((r) => row(r)))

      if (level === "manage") expect(sorted(granted)).toEqual(ALL)
      if (level === "none") expect(granted.size).toBe(0)
      if (level === "read") expect(granted.has("customers.access")).toBe(true)
    }
  })
})

describe("resolvePermissions — perfil e personalizado", () => {
  it("perfil substitui o cargo, inclusive para restringir um MANAGER", () => {
    const granted = resolvePermissions(false, [
      row({ role: "MANAGER", profilePermissions: ["schedule.access", "customers.access"] }),
    ])
    expect(sorted(granted)).toEqual(["customers.access", "schedule.access"])
  })

  it("perfil amplia um STAFF além do conjunto legado", () => {
    const granted = resolvePermissions(false, [
      row({ role: "STAFF", profilePermissions: ["services.edit"] }),
    ])
    expect(sorted(granted)).toEqual(["services.edit"])
  })

  it("personalizado tem prioridade sobre o perfil", () => {
    const granted = resolvePermissions(false, [
      row({ customPermissions: ["team.access"], profilePermissions: ["services.edit"] }),
    ])
    expect(sorted(granted)).toEqual(["team.access"])
  })

  it("personalizado VAZIO é 'nenhuma permissão', não 'segue o cargo'", () => {
    // A diferença entre [] e null é a diferença entre tirar tudo de alguém e não
    // ter configurado nada.
    expect(resolvePermissions(false, [row({ role: "MANAGER", customPermissions: [] })]).size).toBe(0)
    expect(resolvePermissions(false, [row({ role: "MANAGER", profilePermissions: [] })]).size).toBe(0)
  })

  it("cargo OWNER pode tudo mesmo com perfil restritivo", () => {
    const granted = resolvePermissions(false, [
      row({ role: "OWNER", profilePermissions: ["schedule.access"], customPermissions: [] }),
    ])
    expect(sorted(granted)).toEqual(ALL)
  })

  it("dois vínculos no mesmo salão: vale a união", () => {
    const granted = resolvePermissions(false, [
      row({ profilePermissions: ["schedule.access"] }),
      row({ customPermissions: ["services.edit"] }),
    ])
    expect(sorted(granted)).toEqual(["schedule.access", "services.edit"])
  })

  it("vínculo inativo não contribui, mesmo com perfil amplo", () => {
    const granted = resolvePermissions(false, [
      row({ isActive: false, profilePermissions: [...ALL_PERMISSION_KEYS] }),
      row({ profilePermissions: ["schedule.access"] }),
    ])
    expect(sorted(granted)).toEqual(["schedule.access"])
  })

  it("chave fora do catálogo gravada no banco é ignorada", () => {
    const granted = resolvePermissions(false, [
      row({ profilePermissions: ["schedule.access", "sales.invoice_tudo", 42, null] }),
    ])
    expect(sorted(granted)).toEqual(["schedule.access"])
  })
})

describe("sanitizePermissionKeys", () => {
  it("devolve só chaves do catálogo, sem repetição", () => {
    expect(sanitizePermissionKeys(["schedule.access", "schedule.access", "x.y", "schedule"])).toEqual([
      "schedule.access",
    ])
  })

  it("qualquer coisa que não seja array vira lista vazia", () => {
    for (const value of [null, undefined, "schedule.access", { 0: "schedule.access" }, 7]) {
      expect(sanitizePermissionKeys(value)).toEqual([])
    }
  })
})

describe("parseSalonModules", () => {
  it("lê os módulos ligados de salons.settings", () => {
    expect(parseSalonModules({ modules: ["access_profiles"], agent_config: {} })).toEqual([
      "access_profiles",
    ])
  })

  it("módulo desconhecido não liga nada", () => {
    expect(parseSalonModules({ modules: ["tudo", "access_profiles", "access_profiles"] })).toEqual([
      "access_profiles",
    ])
  })

  it("settings ausente ou em outro formato = nenhum módulo", () => {
    for (const settings of [null, undefined, "x", [], {}, { modules: "access_profiles" }]) {
      expect(parseSalonModules(settings)).toEqual([])
    }
  })
})
