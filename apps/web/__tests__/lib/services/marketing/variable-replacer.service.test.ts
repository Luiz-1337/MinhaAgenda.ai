import { describe, it, expect } from "vitest"
import { VariableReplacerService } from "@/lib/services/marketing/variable-replacer.service"

describe("VariableReplacerService", () => {
  describe("replaceVariables", () => {
    it("substitui variáveis simples", () => {
      const result = VariableReplacerService.replaceVariables(
        "Olá {{nome}}, seu agendamento é em {{data}}!",
        { nome: "Maria", data: "10/04/2026" }
      )
      expect(result).toBe("Olá Maria, seu agendamento é em 10/04/2026!")
    })

    it("substitui múltiplas ocorrências da mesma variável", () => {
      const result = VariableReplacerService.replaceVariables(
        "{{nome}} confirmou. Obrigado, {{nome}}!",
        { nome: "João" }
      )
      expect(result).toBe("João confirmou. Obrigado, João!")
    })

    it("substitui variável com valor vazio para string vazia", () => {
      const result = VariableReplacerService.replaceVariables(
        "Nota: {{observacao}}",
        { observacao: "" }
      )
      expect(result).toBe("Nota: ")
    })

    it("mantém variáveis não presentes no objeto", () => {
      const result = VariableReplacerService.replaceVariables(
        "{{nome}} - {{sobrenome}}",
        { nome: "Maria" }
      )
      expect(result).toBe("Maria - {{sobrenome}}")
    })

    it("retorna template sem variáveis inalterado", () => {
      const result = VariableReplacerService.replaceVariables(
        "Mensagem fixa sem variáveis",
        { nome: "Maria" }
      )
      expect(result).toBe("Mensagem fixa sem variáveis")
    })

    it("funciona com objeto de variáveis vazio", () => {
      const result = VariableReplacerService.replaceVariables(
        "Olá {{nome}}!",
        {}
      )
      expect(result).toBe("Olá {{nome}}!")
    })
  })

  describe("extractVariables", () => {
    it("extrai variáveis de um template", () => {
      const vars = VariableReplacerService.extractVariables(
        "Olá {{nome}}, agendamento em {{data}} às {{hora}}"
      )
      expect(vars).toEqual(["nome", "data", "hora"])
    })

    it("retorna array vazio quando não há variáveis", () => {
      const vars = VariableReplacerService.extractVariables("Texto sem variáveis")
      expect(vars).toEqual([])
    })

    it("não retorna duplicatas", () => {
      const vars = VariableReplacerService.extractVariables(
        "{{nome}} e {{nome}} e {{data}}"
      )
      expect(vars).toEqual(["nome", "data"])
    })
  })
})
