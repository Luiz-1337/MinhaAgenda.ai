import { describe, it, expect } from "vitest"
import {
  extractCloudContent,
  isCloudContentType,
  isPlaceholderBody,
  getReactionTarget,
  buildReactionLabel,
  extractAdReferral,
  formatAdReferralText,
  type CloudInboundMessage,
} from "@/lib/services/messaging/cloud/content"

/**
 * Motivação real: produção tinha `[tipo reaction não suportado]` e
 * `[tipo unsupported não suportado]` gravados como mensagem DO CLIENTE, indo como
 * texto para o prompt da IA. Um cliente reagindo com 👍 fazia a IA responder a
 * essa string.
 */
describe("extractCloudContent", () => {
  it("texto vem cru", () => {
    const r = extractCloudContent({ type: "text", text: { body: "Oi, quero agendar" } })
    expect(r).toMatchObject({ body: "Oi, quero agendar", hasMedia: false, wakeAI: true, known: true })
  })

  it("imagem usa a legenda quando existe, e o rótulo quando não", () => {
    expect(extractCloudContent({ type: "image", image: { id: "m1", caption: "esse corte" } })).toMatchObject({
      body: "esse corte",
      hasMedia: true,
      mediaType: "image",
      mediaId: "m1",
    })
    expect(extractCloudContent({ type: "image", image: { id: "m1" } }).body).toBe("[imagem]")
  })

  it("documento cai para o nome do arquivo antes do rótulo genérico", () => {
    expect(
      extractCloudContent({ type: "document", document: { id: "d1", filename: "exame.pdf" } }).body,
    ).toBe("exame.pdf")
  })

  it("figurinha NÃO é mídia — não vai ao Vision", () => {
    const r = extractCloudContent({ type: "sticker", sticker: { id: "s1" } })
    expect(r).toMatchObject({ body: "[figurinha]", hasMedia: false, wakeAI: true })
    // Não repassa o mediaId: é o que impede o worker de tentar baixar e analisar.
    expect(r.mediaId).toBeUndefined()
    expect(r.mediaType).toBeUndefined()
  })

  it("localização cita o nome/endereço quando a Meta manda", () => {
    expect(
      extractCloudContent({ type: "location", location: { latitude: 1, longitude: 2, name: "Salão" } }).body,
    ).toBe("[localização compartilhada: Salão]")
    expect(extractCloudContent({ type: "location", location: { latitude: 1, longitude: 2 } }).body).toBe(
      "[localização compartilhada]",
    )
  })

  it("contatos: singular com nome, plural com contagem", () => {
    expect(
      extractCloudContent({ type: "contacts", contacts: [{ name: { formatted_name: "Maria" } }] }).body,
    ).toBe("[contato compartilhado: Maria]")
    expect(extractCloudContent({ type: "contacts", contacts: [{}, {}, {}] }).body).toBe(
      "[3 contatos compartilhados]",
    )
  })

  it("pedido do catálogo conta os itens e concorda em número", () => {
    expect(extractCloudContent({ type: "order", order: { product_items: [{}] } }).body).toBe(
      "[pedido do catálogo: 1 item]",
    )
    expect(extractCloudContent({ type: "order", order: { product_items: [{}, {}] } }).body).toBe(
      "[pedido do catálogo: 2 itens]",
    )
  })

  it("reação e aviso de sistema NÃO acordam a IA", () => {
    expect(extractCloudContent({ type: "reaction", reaction: { message_id: "w1", emoji: "👍" } }).wakeAI).toBe(false)
    expect(extractCloudContent({ type: "system", system: { body: "trocou de número" } }).wakeAI).toBe(false)
  })

  it("unsupported acorda a IA — silêncio numa mensagem real é pior", () => {
    const r = extractCloudContent({ type: "unsupported" })
    expect(r.wakeAI).toBe(true)
    expect(r.known).toBe(true)
  })

  it("tipo novo da Meta é marcado como desconhecido e não acorda a IA", () => {
    const r = extractCloudContent({ type: "algo_que_a_meta_inventou" })
    expect(r).toMatchObject({ known: false, wakeAI: false })
  })

  it("REGRESSÃO: nenhum tipo produz o rótulo antigo '[tipo X não suportado]'", () => {
    const tipos = [
      "text", "image", "video", "audio", "document", "sticker", "location",
      "contacts", "reaction", "order", "system", "button", "interactive",
      "unsupported", "tipo_inexistente",
    ]
    for (const type of tipos) {
      const { body } = extractCloudContent({ type } as CloudInboundMessage)
      expect(body, `tipo ${type}`).not.toContain("não suportado")
      expect(body, `tipo ${type}`).not.toMatch(/^\[tipo /)
    }
  })
})

describe("isCloudContentType — o gate do eco, derivado da MESMA tabela", () => {
  it("aceita os tipos que carregam conteúdo", () => {
    for (const t of ["text", "image", "video", "audio", "document", "sticker", "location", "contacts", "order", "button", "interactive", "unsupported"]) {
      expect(isCloudContentType(t), t).toBe(true)
    }
  })

  it("recusa o que não é fala: reação, sistema, edição e revogação", () => {
    // revoke/edit só existem no eco e não devem criar bolha nova.
    for (const t of ["reaction", "system", "revoke", "edit", undefined, "qualquer"]) {
      expect(isCloudContentType(t), String(t)).toBe(false)
    }
  })
})

describe("isPlaceholderBody", () => {
  it("reconhece rótulos dos DOIS formatos (Cloud pt-BR e Evolution EN)", () => {
    expect(isPlaceholderBody("[imagem]")).toBe(true)
    expect(isPlaceholderBody("[IMAGE]")).toBe(true)
    expect(isPlaceholderBody("[figurinha]")).toBe(true)
    expect(isPlaceholderBody("[localização compartilhada: Salão]")).toBe(true)
    expect(isPlaceholderBody("  [áudio]  ")).toBe(true)
  })

  it("não confunde fala do cliente que contém colchetes", () => {
    expect(isPlaceholderBody("oi [tudo bem]")).toBe(false)
    expect(isPlaceholderBody("[oi] tudo bem")).toBe(false)
    expect(isPlaceholderBody("")).toBe(false)
    expect(isPlaceholderBody(null)).toBe(false)
    expect(isPlaceholderBody(undefined)).toBe(false)
  })
})

describe("getReactionTarget", () => {
  it("devolve alvo e emoji", () => {
    expect(getReactionTarget({ type: "reaction", reaction: { message_id: "wamid.x", emoji: "❤️" } })).toEqual({
      messageId: "wamid.x",
      emoji: "❤️",
    })
  })

  it("emoji vazio = reação removida", () => {
    expect(getReactionTarget({ type: "reaction", reaction: { message_id: "wamid.x" } })).toEqual({
      messageId: "wamid.x",
      emoji: "",
    })
  })

  it("null quando não é reação ou falta o alvo", () => {
    expect(getReactionTarget({ type: "text", text: { body: "oi" } })).toBeNull()
    expect(getReactionTarget({ type: "reaction", reaction: { emoji: "👍" } })).toBeNull()
  })
})

describe("buildReactionLabel", () => {
  it("cita a mensagem original quando conhecida", () => {
    expect(buildReactionLabel("👍", "Seu horário está confirmado")).toBe(
      '[o cliente reagiu com 👍 a "Seu horário está confirmado"]',
    )
  })

  it("trunca original longo", () => {
    const label = buildReactionLabel("👍", "a".repeat(80))
    expect(label).toContain("…")
    expect(label.length).toBeLessThan(80)
  })

  it("sem original, não inventa trecho", () => {
    expect(buildReactionLabel("👍")).toBe("[o cliente reagiu com 👍]")
    // Rótulo não serve de citação — citar "[imagem]" não diz nada.
    expect(buildReactionLabel("👍", "[imagem]")).toBe("[o cliente reagiu com 👍]")
  })

  it("emoji vazio vira remoção da reação", () => {
    expect(buildReactionLabel("")).toBe("[o cliente removeu a reação]")
    expect(buildReactionLabel("", "Oi")).toBe('[o cliente removeu a reação a "Oi"]')
  })

  it("normaliza quebras de linha do original", () => {
    expect(buildReactionLabel("👍", "linha1\n\nlinha2")).toBe('[o cliente reagiu com 👍 a "linha1 linha2"]')
  })
})

/**
 * Motivação real: em 30/07 os dois primeiros leads pagos chegaram por anúncio com
 * o texto pré-preenchido "Olá! Posso ter mais informações sobre isso?". O
 * `referral` — única fonte do "isso" — era descartado, a IA respondeu "sobre qual
 * serviço você quer saber mais?" e os dois abandonaram. A entrega estava OK; o que
 * queimou o lead foi a primeira resposta.
 */
describe("extractAdReferral", () => {
  it("mensagem comum não tem origem de anúncio", () => {
    expect(extractAdReferral({ type: "text", text: { body: "Oi" } })).toBeNull()
  })

  it("extrai os campos do anúncio e o click id", () => {
    const r = extractAdReferral({
      type: "text",
      text: { body: "Olá! Posso ter mais informações sobre isso?" },
      referral: {
        source_type: "ad",
        source_id: "1200",
        source_url: "https://fb.me/x",
        headline: "Escova progressiva com 20% off",
        body: "Agende sua escova essa semana",
        media_type: "image",
        ctwa_clid: "clid_abc",
      },
    })
    expect(r).toEqual({
      sourceType: "ad",
      sourceId: "1200",
      sourceUrl: "https://fb.me/x",
      headline: "Escova progressiva com 20% off",
      body: "Agende sua escova essa semana",
      mediaType: "image",
      ctwaClid: "clid_abc",
    })
  })

  it("referral vazio ou só com strings brancas não vira objeto oco", () => {
    expect(extractAdReferral({ type: "text", referral: {} })).toBeNull()
    expect(extractAdReferral({ type: "text", referral: { headline: "   " } })).toBeNull()
  })

  it("trunca o corpo do anúncio — ele entraria em TODA mensagem da conversa", () => {
    const r = extractAdReferral({ type: "text", referral: { body: "a".repeat(500) } })
    expect(r?.body).toContain("…")
    expect(r!.body!.length).toBeLessThanOrEqual(301)
  })

  it("normaliza espaços e quebras de linha do texto do anúncio", () => {
    const r = extractAdReferral({ type: "text", referral: { headline: " Corte\n\n  e cor " } })
    expect(r?.headline).toBe("Corte e cor")
  })
})

describe("formatAdReferralText", () => {
  it("sem anúncio, string vazia (concatena no prompt sem if)", () => {
    expect(formatAdReferralText(null)).toBe("")
    expect(formatAdReferralText(undefined)).toBe("")
  })

  it("proíbe explicitamente a pergunta em aberto que queimou os dois leads", () => {
    const txt = formatAdReferralText({ sourceType: "ad", headline: "Escova progressiva 20% off" })
    expect(txt).toContain("Escova progressiva 20% off")
    expect(txt).toContain("qual serviço")
    expect(txt).toContain("PRECEDÊNCIA")
    // O bloco tem que se declarar acima do passo 1 do fluxo, senão o
    // "Pergunte como pode ajudar" do FLUXO DE AGENDAMENTO ganha por vir depois.
    expect(txt).toContain("FLUXO DE AGENDAMENTO")
  })

  it("anúncio sem texto cai numa instrução acolhedora, não na proibição", () => {
    const txt = formatAdReferralText({ sourceType: "ad", sourceId: "1200" })
    expect(txt).toContain("não chegou")
    expect(txt).not.toContain("PROIBIDO")
  })

  it("distingue publicação orgânica de anúncio pago", () => {
    expect(formatAdReferralText({ sourceType: "post", headline: "x" })).toContain("uma publicação")
    expect(formatAdReferralText({ sourceType: "ad", headline: "x" })).toContain("um anúncio")
  })

  it("nunca vaza o click id de atribuição para o prompt", () => {
    const txt = formatAdReferralText({ sourceType: "ad", headline: "x", ctwaClid: "clid_secreto" })
    expect(txt).not.toContain("clid_secreto")
  })
})
