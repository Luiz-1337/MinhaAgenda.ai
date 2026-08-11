import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { logger } from "@/lib/infra/logger"
import { missingStorageEnv, uploadWhatsappMedia, STORAGE_ENV_VARS } from "@/lib/supabase/storage"

/**
 * Guarda do bug que descartou 21 mídias em produção entre 24/jun e 08/ago/2026.
 *
 * O upload NÃO pode derrubar o processamento da mensagem — por isso ele engole a
 * falha e devolve null. Essa parte é decisão de projeto e continua valendo. O
 * acidente foi engolir CALADO: o worker da Railway não tinha
 * SUPABASE_SERVICE_ROLE_KEY, toda foto e todo áudio do cliente sumiam sem uma
 * linha de log, e o painel girava "Recebendo imagem…" para sempre. Sete semanas.
 *
 * Portanto o que este teste protege não é o upload: é o LOG. Um `return null`
 * mudo reintroduzido aqui reprova.
 */
describe("uploadWhatsappMedia — falha de credencial não pode ser silenciosa", () => {
  const original: Record<string, string | undefined> = {}

  beforeEach(() => {
    vi.mocked(logger.error).mockClear()
    for (const key of STORAGE_ENV_VARS) {
      original[key] = process.env[key]
      delete process.env[key]
    }
  })

  afterEach(() => {
    for (const key of STORAGE_ENV_VARS) {
      if (original[key] === undefined) delete process.env[key]
      else process.env[key] = original[key]
    }
  })

  it("missingStorageEnv() aponta as duas variáveis quando nenhuma existe", () => {
    expect(missingStorageEnv()).toEqual([
      "NEXT_PUBLIC_SUPABASE_URL",
      "SUPABASE_SERVICE_ROLE_KEY",
    ])
  })

  it("missingStorageEnv() aponta só a que falta (o caso real: URL presente, chave ausente)", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://exemplo.supabase.co"
    expect(missingStorageEnv()).toEqual(["SUPABASE_SERVICE_ROLE_KEY"])
  })

  it("missingStorageEnv() fica vazio quando as duas existem", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://exemplo.supabase.co"
    process.env.SUPABASE_SERVICE_ROLE_KEY = "chave-de-teste"
    expect(missingStorageEnv()).toEqual([])
  })

  it("devolve null SEM lançar quando faltam credenciais (não pode derrubar a mensagem)", async () => {
    const path = await uploadWhatsappMedia({
      salonId: "salao-1",
      chatId: "chat-1",
      messageId: "msg-1",
      buffer: Buffer.from("audio-falso"),
      mimeType: "audio/ogg",
      mediaType: "audio",
    })

    expect(path).toBeNull()
  })

  it("LOGA um erro nomeando as variáveis que faltam — o ponto todo desta guarda", async () => {
    await uploadWhatsappMedia({
      salonId: "salao-1",
      chatId: "chat-1",
      messageId: "msg-1",
      buffer: Buffer.from("imagem-falsa"),
      mimeType: "image/jpeg",
      mediaType: "image",
    })

    expect(logger.error).toHaveBeenCalledTimes(1)

    const [contexto] = vi.mocked(logger.error).mock.calls[0] as [{ missing: string[] }]
    expect(contexto.missing).toContain("SUPABASE_SERVICE_ROLE_KEY")
  })
})
