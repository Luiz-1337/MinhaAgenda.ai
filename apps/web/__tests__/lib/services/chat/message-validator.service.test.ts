import { describe, it, expect } from "vitest"
import { MessageValidator } from "@/lib/services/chat/message-validator.service"

describe("MessageValidator", () => {
  describe("validateRequest", () => {
    it("converte UIMessage (com parts) para CoreMessage", () => {
      const body = {
        messages: [
          {
            id: "msg-1",
            role: "user",
            parts: [{ type: "text", text: "Olá" }],
          },
        ],
        salonId: "salon-1",
      }

      const result = MessageValidator.validateRequest(body)
      expect(result.messages).toHaveLength(1)
      expect(result.messages[0].role).toBe("user")
      expect(result.messages[0].content).toBe("Olá")
      expect(result.salonId).toBe("salon-1")
    })

    it("filtra mensagens com conteúdo vazio (role system)", () => {
      const body = {
        messages: [
          {
            id: "msg-1",
            role: "developer",
            parts: [{ type: "text", text: "" }],
          },
          {
            id: "msg-2",
            role: "user",
            parts: [{ type: "text", text: "Olá" }],
          },
        ],
      }

      const result = MessageValidator.validateRequest(body)
      // developer com texto vazio é filtrado (convertido para system, retorna null)
      expect(result.messages).toHaveLength(1)
      expect(result.messages[0].role).toBe("user")
    })

    it("lança erro para body null/undefined", () => {
      expect(() => MessageValidator.validateRequest(null)).toThrow("Body inválido")
      expect(() => MessageValidator.validateRequest(undefined)).toThrow("Body inválido")
    })

    it("lança erro para body não-objeto", () => {
      expect(() => MessageValidator.validateRequest("string")).toThrow("Body inválido")
    })
  })

  describe("validateSalonId", () => {
    it("não lança para salonId válido", () => {
      expect(() => MessageValidator.validateSalonId("salon-1")).not.toThrow()
    })

    it("lança erro para salonId undefined", () => {
      expect(() => MessageValidator.validateSalonId(undefined)).toThrow("salonId é obrigatório")
    })
  })

  describe("getLastUserMessage", () => {
    it("retorna última mensagem quando role é user", () => {
      const messages = [
        { role: "user" as const, content: "Primeira" },
        { role: "assistant" as const, content: "Resposta" },
        { role: "user" as const, content: "Segunda" },
      ]

      const result = MessageValidator.getLastUserMessage(messages)
      expect(result).not.toBeNull()
      expect(result?.content).toBe("Segunda")
    })

    it("retorna null quando última mensagem é assistant", () => {
      const messages = [
        { role: "user" as const, content: "Pergunta" },
        { role: "assistant" as const, content: "Resposta" },
      ]

      const result = MessageValidator.getLastUserMessage(messages)
      expect(result).toBeNull()
    })

    it("retorna null para array vazio", () => {
      expect(MessageValidator.getLastUserMessage([])).toBeNull()
    })
  })
})
