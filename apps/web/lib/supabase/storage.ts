import { createClient } from "@supabase/supabase-js"
import { logger } from "../infra/logger"

/**
 * Helper de Storage para mídia recebida do WhatsApp (foto/áudio do cliente).
 *
 * IMPORTANTE: este módulo NÃO importa next/headers — é seguro para o worker (tsx),
 * que roda fora do runtime do Next. Mantenha imports relativos / de pacotes node;
 * nunca use o alias @/ aqui (o worker não o resolve).
 *
 * Bucket privado: o upload usa a SERVICE ROLE key; a leitura é via URL assinada
 * (createSignedUrl), nunca exposição pública — é foto/áudio de cliente (PII).
 */

const BUCKET = "whatsapp-media"
const SIGNED_URL_TTL_SECONDS = 60 * 60 * 24 // 24h — sobrevive a uma sessão de visualização

/** Variáveis sem as quais NÃO existe Storage. Exportada para o worker avisar no boot. */
export const STORAGE_ENV_VARS = ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"] as const

export function missingStorageEnv(): string[] {
  return STORAGE_ENV_VARS.filter((key) => !process.env[key])
}

function getAdminStorage() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceRoleKey) return null
  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  }).storage
}

function extensionFor(mediaType: string, mimeType?: string): string {
  const mime = (mimeType || "").split(";")[0].trim().toLowerCase()
  const sub = mime.split("/")[1]
  if (sub) {
    return sub
      .replace("jpeg", "jpg")
      .replace("mpeg", "mp3")
      .replace("x-m4a", "m4a")
      .replace("quicktime", "mov")
  }
  if (mediaType === "image") return "jpg"
  if (mediaType === "audio") return "ogg"
  if (mediaType === "video") return "mp4"
  return "bin"
}

interface UploadParams {
  salonId: string
  chatId: string
  messageId: string
  buffer: Buffer
  mimeType?: string
  mediaType: "image" | "audio" | "video" | "document"
}

/**
 * Sobe a mídia ao bucket privado e retorna o caminho (path) salvo, ou null em falha.
 * Nunca lança — falha de Storage não pode derrubar o processamento da mensagem.
 *
 * Mas LOGA todo caminho de falha, e isso não é zelo: entre 24/jun e 08/ago/2026 as
 * 21 mídias recebidas em produção foram descartadas aqui sem deixar rastro. O
 * worker da Railway não tinha SUPABASE_SERVICE_ROLE_KEY, `getAdminStorage()`
 * devolvia null e o `return null` mudo fazia o resto. Não lançar é decisão de
 * projeto; sumir calado era acidente.
 */
export async function uploadWhatsappMedia(params: UploadParams): Promise<string | null> {
  try {
    const missing = missingStorageEnv()
    if (missing.length > 0) {
      logger.error(
        { missing, chatId: params.chatId, mediaType: params.mediaType },
        "uploadWhatsappMedia: credenciais do Storage ausentes — mídia do cliente NÃO foi salva"
      )
      return null
    }
    const storage = getAdminStorage()
    if (!storage) return null
    const ext = extensionFor(params.mediaType, params.mimeType)
    const path = `${params.salonId}/${params.chatId}/${params.messageId}.${ext}`
    const contentType = (params.mimeType || "").split(";")[0].trim() || "application/octet-stream"
    const { error } = await storage.from(BUCKET).upload(path, params.buffer, {
      contentType,
      upsert: true,
    })
    if (error) {
      logger.error(
        { err: error, bucket: BUCKET, path, mediaType: params.mediaType },
        "uploadWhatsappMedia: Storage recusou o upload — mídia do cliente NÃO foi salva"
      )
      return null
    }
    return path
  } catch (err) {
    logger.error({ err, chatId: params.chatId }, "uploadWhatsappMedia: erro inesperado ao salvar mídia")
    return null
  }
}

// Cache em memória de URLs assinadas (o processo server/worker fica "quente").
// Evita refazer createSignedUrl (chamada de rede) a cada poll de 5s do chat.
const signedUrlCache = new Map<string, { url: string; exp: number }>()

/**
 * Gera (ou reaproveita do cache) uma URL assinada para o caminho da mídia.
 * Retorna null se a mídia ainda não existe / Storage indisponível.
 */
export async function getWhatsappMediaSignedUrl(path: string): Promise<string | null> {
  const now = Date.now()
  const cached = signedUrlCache.get(path)
  if (cached && cached.exp > now + 60_000) return cached.url
  try {
    const storage = getAdminStorage()
    if (!storage) return null
    const { data, error } = await storage.from(BUCKET).createSignedUrl(path, SIGNED_URL_TTL_SECONDS)
    if (error || !data?.signedUrl) return null
    signedUrlCache.set(path, { url: data.signedUrl, exp: now + SIGNED_URL_TTL_SECONDS * 1000 })
    return data.signedUrl
  } catch {
    return null
  }
}
