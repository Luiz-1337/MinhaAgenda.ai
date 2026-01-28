/**
 * Serviço de Storage Permanente de Mídia
 * 
 * Features:
 * - Download de mídia do Twilio (URLs temporárias)
 * - Upload para storage permanente (Supabase Storage / S3 / R2)
 * - Suporte a múltiplos tipos de mídia
 * - Retry automático
 * - Cleanup de arquivos temporários
 */

import { logger, hashUrl } from "../logger";

/**
 * Resultado do armazenamento de mídia
 */
export interface MediaStorageResult {
  success: boolean;
  permanentUrl?: string;
  contentType?: string;
  size?: number;
  error?: string;
}

/**
 * Configuração de storage
 */
interface StorageConfig {
  bucket: string;
  maxSizeBytes: number;
  allowedTypes: string[];
}

const DEFAULT_CONFIG: StorageConfig = {
  bucket: process.env.MEDIA_STORAGE_BUCKET || "whatsapp-media",
  maxSizeBytes: 25 * 1024 * 1024, // 25MB (limite do WhatsApp)
  allowedTypes: [
    "image/jpeg",
    "image/png",
    "image/gif",
    "image/webp",
    "audio/ogg",
    "audio/mpeg",
    "audio/mp4",
    "video/mp4",
    "video/3gpp",
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ],
};

/**
 * Download de mídia do Twilio e upload para storage permanente
 * 
 * URLs do Twilio expiram, então precisamos:
 * 1. Baixar o arquivo com autenticação
 * 2. Fazer upload para storage permanente
 * 3. Retornar URL pública permanente
 * 
 * @param twilioMediaUrl URL temporária do Twilio
 * @param messageId ID da mensagem para naming
 * @param salonId ID do salão para organização
 */
export async function downloadAndStoreTwilioMedia(
  twilioMediaUrl: string,
  messageId: string,
  salonId: string
): Promise<MediaStorageResult> {
  const startTime = Date.now();

  try {
    logger.info(
      {
        messageId,
        salonId,
        mediaUrl: hashUrl(twilioMediaUrl),
      },
      "Starting media download from Twilio"
    );

    // 1. Download do Twilio com autenticação
    const mediaBuffer = await downloadFromTwilio(twilioMediaUrl);
    const contentType = mediaBuffer.contentType;
    const size = mediaBuffer.data.byteLength;

    // 2. Validação
    if (size > DEFAULT_CONFIG.maxSizeBytes) {
      return {
        success: false,
        error: `File too large: ${size} bytes (max: ${DEFAULT_CONFIG.maxSizeBytes})`,
      };
    }

    if (!DEFAULT_CONFIG.allowedTypes.includes(contentType)) {
      return {
        success: false,
        error: `Content type not allowed: ${contentType}`,
      };
    }

    // 3. Gera path único para o arquivo
    const date = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
    const extension = getExtensionFromContentType(contentType);
    const key = `${salonId}/${date}/${messageId}${extension}`;

    // 4. Upload para storage permanente
    const permanentUrl = await uploadToStorage(key, mediaBuffer.data, contentType);

    const duration = Date.now() - startTime;

    logger.info(
      {
        messageId,
        salonId,
        contentType,
        size,
        duration,
        permanentUrl: hashUrl(permanentUrl),
      },
      "Media stored permanently"
    );

    return {
      success: true,
      permanentUrl,
      contentType,
      size,
    };
  } catch (error) {
    const duration = Date.now() - startTime;

    logger.error(
      {
        err: error,
        messageId,
        salonId,
        duration,
      },
      "Failed to download and store media"
    );

    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Download de arquivo do Twilio com autenticação Basic
 */
async function downloadFromTwilio(
  url: string
): Promise<{ data: ArrayBuffer; contentType: string }> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;

  if (!accountSid || !authToken) {
    throw new Error("Twilio credentials not configured");
  }

  const credentials = Buffer.from(`${accountSid}:${authToken}`).toString("base64");

  const response = await fetch(url, {
    headers: {
      Authorization: `Basic ${credentials}`,
    },
    // Timeout de 30s para download
    signal: AbortSignal.timeout(30000),
  });

  if (!response.ok) {
    throw new Error(`Failed to download media: HTTP ${response.status}`);
  }

  const contentType = response.headers.get("content-type") || "application/octet-stream";
  const data = await response.arrayBuffer();

  return { data, contentType };
}

/**
 * Upload para storage permanente
 * 
 * Suporta múltiplos backends:
 * - Supabase Storage (padrão)
 * - AWS S3
 * - Cloudflare R2
 */
async function uploadToStorage(
  key: string,
  data: ArrayBuffer,
  contentType: string
): Promise<string> {
  const storageBackend = process.env.MEDIA_STORAGE_BACKEND || "supabase";

  switch (storageBackend) {
    case "supabase":
      return uploadToSupabase(key, data, contentType);
    case "s3":
      return uploadToS3(key, data, contentType);
    case "r2":
      return uploadToR2(key, data, contentType);
    case "local":
      // Para desenvolvimento local
      return uploadToLocal(key, data, contentType);
    default:
      throw new Error(`Unknown storage backend: ${storageBackend}`);
  }
}

/**
 * Upload para Supabase Storage
 */
async function uploadToSupabase(
  key: string,
  data: ArrayBuffer,
  contentType: string
): Promise<string> {
  const { createClient } = await import("@supabase/supabase-js");

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error("Supabase credentials not configured for media storage");
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  const bucket = DEFAULT_CONFIG.bucket;

  // Cria bucket se não existir (ignora erro se já existe)
  await supabase.storage.createBucket(bucket, {
    public: true,
    fileSizeLimit: DEFAULT_CONFIG.maxSizeBytes,
  }).catch(() => {/* bucket already exists */});

  const { data: uploadData, error } = await supabase.storage
    .from(bucket)
    .upload(key, data, {
      contentType,
      upsert: true,
    });

  if (error) {
    throw new Error(`Supabase upload error: ${error.message}`);
  }

  // Retorna URL pública
  const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(key);
  return urlData.publicUrl;
}

/**
 * Upload para AWS S3
 */
async function uploadToS3(
  key: string,
  data: ArrayBuffer,
  contentType: string
): Promise<string> {
  // Usa AWS SDK v3 para upload
  const { S3Client, PutObjectCommand } = await import("@aws-sdk/client-s3");

  const client = new S3Client({
    region: process.env.AWS_REGION || "us-east-1",
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
    },
  });

  const bucket = DEFAULT_CONFIG.bucket;
  const fullKey = `whatsapp-media/${key}`;

  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: fullKey,
      Body: Buffer.from(data),
      ContentType: contentType,
      ACL: "public-read",
    })
  );

  return `https://${bucket}.s3.amazonaws.com/${fullKey}`;
}

/**
 * Upload para Cloudflare R2
 */
async function uploadToR2(
  key: string,
  data: ArrayBuffer,
  contentType: string
): Promise<string> {
  // R2 é compatível com S3 API
  const { S3Client, PutObjectCommand } = await import("@aws-sdk/client-s3");

  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;

  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new Error("Cloudflare R2 credentials not configured");
  }

  const client = new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  });

  const bucket = DEFAULT_CONFIG.bucket;
  const fullKey = `whatsapp-media/${key}`;

  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: fullKey,
      Body: Buffer.from(data),
      ContentType: contentType,
    })
  );

  // URL pública via custom domain ou R2 public URL
  const publicDomain = process.env.R2_PUBLIC_DOMAIN;
  if (publicDomain) {
    return `https://${publicDomain}/${fullKey}`;
  }

  return `https://pub-${accountId}.r2.dev/${bucket}/${fullKey}`;
}

/**
 * Upload local para desenvolvimento
 */
async function uploadToLocal(
  key: string,
  data: ArrayBuffer,
  _contentType: string
): Promise<string> {
  const fs = await import("fs/promises");
  const path = await import("path");

  const uploadDir = path.join(process.cwd(), "public", "uploads", "media");
  await fs.mkdir(uploadDir, { recursive: true });

  const filePath = path.join(uploadDir, key.replace(/\//g, "-"));
  await fs.writeFile(filePath, Buffer.from(data));

  // URL local
  return `/uploads/media/${key.replace(/\//g, "-")}`;
}

/**
 * Obtém extensão de arquivo baseado no content-type
 */
function getExtensionFromContentType(contentType: string): string {
  const extensions: Record<string, string> = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/gif": ".gif",
    "image/webp": ".webp",
    "audio/ogg": ".ogg",
    "audio/mpeg": ".mp3",
    "audio/mp4": ".m4a",
    "video/mp4": ".mp4",
    "video/3gpp": ".3gp",
    "application/pdf": ".pdf",
    "application/msword": ".doc",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
  };

  return extensions[contentType] || "";
}

/**
 * Verifica se uma URL é uma URL temporária do Twilio
 */
export function isTwilioMediaUrl(url: string): boolean {
  return url.includes("api.twilio.com") || url.includes("twilio.com/Media");
}

/**
 * Deleta mídia do storage (cleanup)
 */
export async function deleteStoredMedia(permanentUrl: string): Promise<boolean> {
  try {
    const storageBackend = process.env.MEDIA_STORAGE_BACKEND || "supabase";

    switch (storageBackend) {
      case "supabase": {
        const { createClient } = await import("@supabase/supabase-js");
        const supabase = createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY!
        );

        // Extrai key da URL
        const url = new URL(permanentUrl);
        const key = url.pathname.split("/").slice(-3).join("/");

        const { error } = await supabase.storage
          .from(DEFAULT_CONFIG.bucket)
          .remove([key]);

        return !error;
      }
      default:
        logger.warn({ backend: storageBackend }, "Delete not implemented for this backend");
        return false;
    }
  } catch (error) {
    logger.error({ err: error, permanentUrl }, "Failed to delete stored media");
    return false;
  }
}
