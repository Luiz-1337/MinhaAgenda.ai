import { createClient } from "@supabase/supabase-js"

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
 */
export async function uploadWhatsappMedia(params: UploadParams): Promise<string | null> {
  try {
    const storage = getAdminStorage()
    if (!storage) return null
    const ext = extensionFor(params.mediaType, params.mimeType)
    const path = `${params.salonId}/${params.chatId}/${params.messageId}.${ext}`
    const contentType = (params.mimeType || "").split(";")[0].trim() || "application/octet-stream"
    const { error } = await storage.from(BUCKET).upload(path, params.buffer, {
      contentType,
      upsert: true,
    })
    if (error) return null
    return path
  } catch {
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
