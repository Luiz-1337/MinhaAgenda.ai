import { describe, it, expect } from "vitest"
import { classifySalonAccess } from "@/lib/services/permissions.service"

/**
 * A regra de acesso ao salão, testada sem banco.
 *
 * O caso que motiva o teste: a versão anterior filtrava o papel DENTRO do
 * `findFirst` (`role IN ('MANAGER','OWNER')`), então nunca via mais de uma linha.
 * Ao introduzir o nível `read` para STAFF, classificar a partir de um `findFirst`
 * rebaixaria silenciosamente um MANAGER que também tem uma linha de STAFF no
 * mesmo salão — uma regressão de permissão que nenhum tipo pegaria.
 */
describe("classifySalonAccess", () => {
  it("dono do salão gerencia, sem precisar de linha em professionals", () => {
    expect(classifySalonAccess(true, [])).toBe("manage")
  })

  it("MANAGER e OWNER ativos gerenciam", () => {
    expect(classifySalonAccess(false, [{ role: "MANAGER", isActive: true }])).toBe("manage")
    expect(classifySalonAccess(false, [{ role: "OWNER", isActive: true }])).toBe("manage")
  })

  it("STAFF ativo lê, não gerencia", () => {
    expect(classifySalonAccess(false, [{ role: "STAFF", isActive: true }])).toBe("read")
  })

  it("sem vínculo nenhum não tem acesso", () => {
    expect(classifySalonAccess(false, [])).toBe("none")
  })

  it("vínculo inativo não dá acesso, em nenhum papel", () => {
    // Desativar o profissional é como se tira o acesso sem apagar o histórico
    // de agendamentos dele.
    expect(classifySalonAccess(false, [{ role: "MANAGER", isActive: false }])).toBe("none")
    expect(classifySalonAccess(false, [{ role: "STAFF", isActive: false }])).toBe("none")
  })

  describe("mais de um vínculo no mesmo salão — vale o MAIOR privilégio", () => {
    it("STAFF + MANAGER = manage, em qualquer ordem", () => {
      expect(
        classifySalonAccess(false, [
          { role: "STAFF", isActive: true },
          { role: "MANAGER", isActive: true },
        ]),
        "o STAFF vindo primeiro não pode rebaixar o MANAGER"
      ).toBe("manage")

      expect(
        classifySalonAccess(false, [
          { role: "MANAGER", isActive: true },
          { role: "STAFF", isActive: true },
        ])
      ).toBe("manage")
    })

    it("MANAGER inativo + STAFF ativo = read", () => {
      expect(
        classifySalonAccess(false, [
          { role: "MANAGER", isActive: false },
          { role: "STAFF", isActive: true },
        ])
      ).toBe("read")
    })

    it("todos inativos = none, mesmo com vários vínculos", () => {
      expect(
        classifySalonAccess(false, [
          { role: "MANAGER", isActive: false },
          { role: "STAFF", isActive: false },
        ])
      ).toBe("none")
    })
  })

  it("dono ganha de vínculo inativo", () => {
    // Dono do salão com a própria linha de professional desativada continua dono.
    expect(classifySalonAccess(true, [{ role: "STAFF", isActive: false }])).toBe("manage")
  })
})
