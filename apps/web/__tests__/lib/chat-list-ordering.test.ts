import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"

/**
 * GUARDA DE REGRESSÃO — ordenação errada da lista de conversas, 30/07/2026.
 *
 * A lista de chats e o board do kanban ordenavam por `chats.updatedAt` mas
 * exibiam o horário da última mensagem. `updatedAt` significa "a linha foi
 * mexida", e é carimbado por coisas que não geram mensagem nenhuma: mover o
 * cartão no kanban, a IA classificar o chat, ligar/desligar o modo manual,
 * atribuir o agente. Em produção, três conversas arrastadas para "Concluídas"
 * às 18:49 pularam para o topo da lista acima de conversas de horas atrás — uma
 * delas com a última mensagem de 24/jun, 870h de defasagem.
 *
 * A migration 028 criou `chats.lastMessageAt`, mantido pelo trigger
 * `messages_touch_chat_last_message_at` (= max(messages.created_at) do chat).
 * Este teste afirma que as duas telas ordenam por ele.
 *
 * É análise estática de texto de propósito, no mesmo espírito de
 * `actions-authz.test.ts`: a ordenação vive dentro de uma Server Action que
 * precisa de banco e sessão, e o mock de `@repo/db` do setup não constrói query
 * de verdade. Ler o fonte custa milissegundos e falha na hora em que alguém
 * troca a coluna de volta.
 *
 * Limite conhecido: prova que a query PEDE a ordem certa, não que o Postgres a
 * devolveu. Quem garante o valor da coluna é o trigger, e a invariante
 * (`last_message_at = max(messages.created_at)`) é conferida pelo bloco DO da
 * própria 028.
 */

/** Arquivo → nome da função que lista conversas, para a mensagem de erro. */
const LISTAGENS = [
  ["chats.ts", "getChatConversations"],
  ["kanban.ts", "listKanbanBoard"],
] as const

function readAction(file: string): string {
  return readFileSync(join(process.cwd(), "app", "actions", file), "utf8")
}

describe.each(LISTAGENS)("app/actions/%s — ordem das conversas", (file, fn) => {
  const source = readAction(file)

  it(`${fn} ordena por chats.lastMessageAt`, () => {
    expect(
      source.includes("orderBy: desc(chats.lastMessageAt)"),
      `${fn} não ordena por chats.lastMessageAt. Essa é a coluna que representa ` +
        `"quando a conversa falou por último" (migration 028).`
    ).toBe(true)
  })

  it("nenhuma consulta de chats ordena por updatedAt", () => {
    // `updatedAt` continua sendo ESCRITO neste repo (é o relógio da linha, e está
    // certo que mover cartão o mexa) — o que não pode voltar é ORDENAR por ele.
    const ordenaPorUpdatedAt = /orderBy:\s*(desc|asc)\(chats\.updatedAt\)/

    expect(
      ordenaPorUpdatedAt.test(source),
      `${file} voltou a ordenar chats por updatedAt. Foi esse o bug de 30/07/2026: ` +
        `arrastar um cartão no kanban carimba updatedAt e joga a conversa para o ` +
        `topo da lista sem ninguém ter falado nada. Use chats.lastMessageAt.`
    ).toBe(false)
  })

  it("exclui chat sem mensagem em SQL, não em JS depois do LIMIT", () => {
    // Filtrar depois da busca faz o LIMIT trazer candidatas em vez de conversas:
    // parte do que voltou do banco é descartada e a lista vem curta.
    expect(
      source.includes("isNotNull(chats.lastMessageAt)"),
      `${fn} não filtra isNotNull(chats.lastMessageAt) na query. NULL = chat sem ` +
        `nenhuma mensagem, e ele não deve ocupar vaga do LIMIT.`
    ).toBe(true)
  })

  it("busca a última mensagem com DISTINCT ON, não com janela global", () => {
    // A versão antiga lia as N mensagens mais recentes do salão e ficava com a
    // primeira de cada chat: um chat muito movimentado consumia a janela e os
    // outros desapareciam da lista sem erro nenhum.
    expect(
      source.includes("selectDistinctOn([messages.chatId]"),
      `${fn} não usa selectDistinctOn para o preview. Uma janela global de ` +
        `mensagens com limite fixo faz conversa antiga sumir da lista em silêncio ` +
        `quando o volume cresce.`
    ).toBe(true)
  })
})
