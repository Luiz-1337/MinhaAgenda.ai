import { toFile } from "openai"
import { getOpenAIClient } from "./openai-client"
import { getBase64FromMediaMessage } from "../evolution/evolution-message.service"
import { createContextLogger } from "../../infra/logger"

const AUDIO_MAX_SIZE_BYTES = 25 * 1024 * 1024 // 25MB (limite do Whisper)
const IMAGE_MAX_SIZE_BYTES = 20 * 1024 * 1024 // 20MB
const WHISPER_MODEL = "whisper-1"
// Timeout especifico para transcricao Whisper (menor que timeout global 60s do client).
// Whisper pode demorar 10-40s para audios grandes, mas >45s indica problema.
const WHISPER_TIMEOUT_MS = 45_000

export interface ProcessedMedia {
  type: "image" | "audio"
  imageUrl?: string
  transcribedText?: string
  metadata: {
    originalMediaType: string
    processingTimeMs: number
    whisperModel?: string
  }
}

export interface ProcessMediaParams {
  mediaType: "image" | "audio"
  mediaUrl: string
  mimeType?: string
  // Dados necessários para o endpoint getBase64FromMediaMessage
  instanceName: string
  messageKey: { remoteJid: string; fromMe: boolean; id: string }
}

/**
 * Processa mídia recebida do WhatsApp via Evolution API.
 * Usa o endpoint getBase64FromMediaMessage para obter a mídia descriptografada.
 * Fallback: download direto pela URL (para URLs públicas do CDN).
 */
export async function processMedia(params: ProcessMediaParams): Promise<ProcessedMedia> {
  const { mediaType } = params
  const startTime = Date.now()

  if (mediaType === "image") {
    return processImage(params, startTime)
  }

  if (mediaType === "audio") {
    return processAudio(params, startTime)
  }

  return {
    type: mediaType,
    metadata: {
      originalMediaType: mediaType,
      processingTimeMs: Date.now() - startTime,
    },
  }
}

/**
 * Obtém mídia em base64 via Evolution API (descriptografa a mídia do WhatsApp).
 */
async function fetchMediaBase64(
  params: ProcessMediaParams,
  logger: ReturnType<typeof createContextLogger>
): Promise<{ buffer: Buffer; mimetype: string } | null> {
  const result = await getBase64FromMediaMessage(params.instanceName, params.messageKey)

  if (!result) {
    logger.warn("Evolution API não retornou mídia em base64")
    return null
  }

  const buffer = Buffer.from(result.base64, "base64")

  logger.info(
    {
      sizeBytes: buffer.length,
      mimetype: result.mimetype,
    },
    "Mídia obtida via Evolution API getBase64FromMediaMessage"
  )

  return { buffer, mimetype: result.mimetype }
}

/**
 * Imagens: obtém via Evolution API → converte para data URL base64 para enviar ao OpenAI vision.
 */
async function processImage(params: ProcessMediaParams, startTime: number): Promise<ProcessedMedia> {
  const logger = createContextLogger({ service: "media-processor" })

  try {
    const downloaded = await fetchMediaBase64(params, logger)

    if (!downloaded) {
      return {
        type: "image",
        metadata: {
          originalMediaType: "image",
          processingTimeMs: Date.now() - startTime,
        },
      }
    }

    if (downloaded.buffer.length > IMAGE_MAX_SIZE_BYTES) {
      logger.warn({ size: downloaded.buffer.length }, "Imagem excede limite de 20MB")
      return {
        type: "image",
        metadata: {
          originalMediaType: "image",
          processingTimeMs: Date.now() - startTime,
        },
      }
    }

    // Determinar mimetype real
    const mimeType = downloaded.mimetype.split(";")[0].trim()
    const validImageTypes = ["image/jpeg", "image/png", "image/gif", "image/webp"]
    const resolvedMime = validImageTypes.includes(mimeType) ? mimeType : "image/jpeg"

    // Converter para base64 data URL
    const base64 = downloaded.buffer.toString("base64")
    const dataUrl = `data:${resolvedMime};base64,${base64}`

    logger.info(
      {
        processingTimeMs: Date.now() - startTime,
        sizeBytes: downloaded.buffer.length,
        mimeType: resolvedMime,
      },
      "Imagem processada para vision"
    )

    return {
      type: "image",
      imageUrl: dataUrl,
      metadata: {
        originalMediaType: "image",
        processingTimeMs: Date.now() - startTime,
      },
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    logger.error({ error: errorMessage }, "Erro ao processar imagem")
    return {
      type: "image",
      metadata: {
        originalMediaType: "image",
        processingTimeMs: Date.now() - startTime,
      },
    }
  }
}

/**
 * Áudio: obtém via Evolution API → transcrição via Whisper.
 */
async function processAudio(params: ProcessMediaParams, startTime: number): Promise<ProcessedMedia> {
  const logger = createContextLogger({ service: "media-processor" })

  try {
    const downloaded = await fetchMediaBase64(params, logger)

    if (!downloaded) {
      return audioFallback(startTime)
    }

    if (downloaded.buffer.length > AUDIO_MAX_SIZE_BYTES) {
      logger.warn({ size: downloaded.buffer.length }, "Áudio excede limite de 25MB")
      return audioFallback(startTime)
    }

    const resolvedMime = downloaded.mimetype.split(";")[0].trim() || "audio/ogg"
    const extension = resolveAudioExtension(resolvedMime)

    logger.info(
      {
        sizeBytes: downloaded.buffer.length,
        mimetype: downloaded.mimetype,
        resolvedMime,
        extension,
      },
      "Áudio obtido, iniciando transcrição Whisper"
    )

    // Usar toFile do SDK OpenAI (compatível com Node.js)
    const file = await toFile(downloaded.buffer, `audio.${extension}`, {
      type: resolvedMime,
    })

    const openai = getOpenAIClient()
    const transcription = await openai.audio.transcriptions.create(
      {
        model: WHISPER_MODEL,
        file,
        language: "pt",
      },
      {
        signal: AbortSignal.timeout(WHISPER_TIMEOUT_MS),
      }
    )

    const transcribedText = transcription.text?.trim()

    if (!transcribedText) {
      logger.warn("Whisper retornou transcrição vazia")
      return audioFallback(startTime)
    }

    logger.info(
      {
        processingTimeMs: Date.now() - startTime,
        textLength: transcribedText.length,
      },
      "Áudio transcrito com sucesso"
    )

    return {
      type: "audio",
      transcribedText,
      metadata: {
        originalMediaType: "audio",
        processingTimeMs: Date.now() - startTime,
        whisperModel: WHISPER_MODEL,
      },
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    logger.error({ error: errorMessage }, "Erro ao processar áudio")
    return audioFallback(startTime)
  }
}

function audioFallback(startTime: number): ProcessedMedia {
  return {
    type: "audio",
    transcribedText: undefined,
    metadata: {
      originalMediaType: "audio",
      processingTimeMs: Date.now() - startTime,
    },
  }
}

function resolveAudioExtension(mimeType: string): string {
  if (mimeType.includes("ogg")) return "ogg"
  if (mimeType.includes("mpeg") || mimeType.includes("mp3")) return "mp3"
  if (mimeType.includes("mp4") || mimeType.includes("m4a")) return "m4a"
  if (mimeType.includes("wav")) return "wav"
  if (mimeType.includes("webm")) return "webm"
  return "ogg"
}
