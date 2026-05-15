import type { Conversation } from "../types"

/**
 * Memória de TOOL_CONTEXT. O turno 1 injeta uma resposta do assistant que
 * inclui um bloco ---TOOL_CONTEXT--- com resultado de getServices. No turno
 * 2, o cliente pergunta sobre preço — o bot deve usar o contexto já presente
 * e NÃO chamar getServices de novo.
 *
 * Regra do prompt:
 *   "USE esses dados. NÃO repita tool calls cujos resultados já estão no contexto."
 */
export const conversation: Conversation = {
  name: "memoria_tool_context",
  description: "Bot não rechamada getServices quando o resultado já está no TOOL_CONTEXT do histórico",
  context: {
    customerName: "Ana Paula",
    isNewCustomer: false,
  },
  turns: [
    {
      user: "quais serviços vocês fazem?",
      // Injeta a resposta do bot diretamente — não chama o modelo neste turno.
      // O conteúdo simula o que o agente teria gerado, incluindo o TOOL_CONTEXT.
      injectAssistant: [
        "Trabalhamos com corte (R$ 50,00), escova (R$ 80,00) e barba (R$ 30,00). Qual te interessa?",
        "",
        "---TOOL_CONTEXT---",
        "[getServices]({}) -> 3 servicos: corte (R$50.00, 30min), escova (R$80.00, 45min), barba (R$30.00, 20min)",
        "---END_TOOL_CONTEXT---",
      ].join("\n"),
      expect: {}, // no assertions on injected turn
    },
    {
      user: "e o corte, quanto que é mesmo?",
      expect: {
        tools: {
          // Já temos os preços no TOOL_CONTEXT — não rechamar.
          forbidden: ["getServices", "getProducts"],
        },
        text: {
          maxSentences: 3,
          // Deve mencionar 50 (que está no contexto)
          mustMatchAny: [/50/, /cinquenta/i],
          mustNotMatch: [
            /um momento/i,
            /vou verificar/i,
            /TOOL_CONTEXT/,
          ],
        },
      },
    },
  ],
}
