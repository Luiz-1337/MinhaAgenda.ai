/**
 * Zod validation schemas for Evolution API webhooks
 *
 * Validates:
 * - Event types (messages.upsert, connection.update, etc.)
 * - Message format
 * - Media types
 * - Connection states
 */

import { z } from 'zod/v4';

/**
 * Evolution API event types (formato com ponto - nosso padrão interno)
 */
export const EvolutionEventType = z.enum([
  'messages.upsert',
  'messages.update',
  'messages.delete',
  'send.message',
  'connection.update',
  'qrcode.updated',
  'application.startup',
]);

/** Mapeia eventos Evolution API v2 (UPPER_SNAKE) para nosso formato */
const EVENT_FORMAT_MAP: Record<string, string> = {
  MESSAGES_UPSERT: 'messages.upsert',
  MESSAGES_UPDATE: 'messages.update',
  MESSAGES_DELETE: 'messages.delete',
  SEND_MESSAGE: 'send.message',
  CONNECTION_UPDATE: 'connection.update',
  QRCODE_UPDATED: 'qrcode.updated',
  APPLICATION_STARTUP: 'application.startup',
  GROUPS_UPSERT: 'groups.upsert',
  GROUPS_UPDATE: 'groups.update',
  CHATS_UPSERT: 'chats.upsert',
  CHATS_UPDATE: 'chats.update',
  CONTACTS_UPSERT: 'contacts.upsert',
  CONTACTS_UPDATE: 'contacts.update',
};

/**
 * Normaliza o nome do evento (Evolution v2 envia UPPER_SNAKE)
 */
export function normalizeWebhookEvent(raw: string): string {
  return EVENT_FORMAT_MAP[raw] ?? raw.toLowerCase().replace(/_/g, '.');
}

/**
 * Message key schema (WhatsApp message identifier)
 */
const MessageKeySchema = z.object({
  remoteJid: z.string(), // Phone number in format: 5511999999999@s.whatsapp.net
  fromMe: z.boolean(),
  id: z.string(), // Message ID
});

/**
 * Message content types
 */
const MessageContentSchema = z.object({
  // Text message
  conversation: z.string().optional(),

  // Extended text (with links, mentions, etc.)
  extendedTextMessage: z
    .object({
      text: z.string(),
    })
    .optional(),

  // Image message
  imageMessage: z
    .object({
      url: z.string().optional(),
      mimetype: z.string().optional(),
      caption: z.string().optional(),
      fileSha256: z.string().optional(),
      fileLength: z.number().optional(),
    })
    .optional(),

  // Video message
  videoMessage: z
    .object({
      url: z.string().optional(),
      mimetype: z.string().optional(),
      caption: z.string().optional(),
      fileSha256: z.string().optional(),
      fileLength: z.number().optional(),
    })
    .optional(),

  // Audio message
  audioMessage: z
    .object({
      url: z.string().optional(),
      mimetype: z.string().optional(),
      fileSha256: z.string().optional(),
      fileLength: z.number().optional(),
      seconds: z.number().optional(),
    })
    .optional(),

  // Document message
  documentMessage: z
    .object({
      url: z.string().optional(),
      mimetype: z.string().optional(),
      caption: z.string().optional(),
      fileSha256: z.string().optional(),
      fileLength: z.number().optional(),
      fileName: z.string().optional(),
    })
    .optional(),

  // Location message
  locationMessage: z
    .object({
      degreesLatitude: z.number(),
      degreesLongitude: z.number(),
      name: z.string().optional(),
      address: z.string().optional(),
    })
    .optional(),

  // Contact message
  contactMessage: z
    .object({
      displayName: z.string(),
      vcard: z.string(),
    })
    .optional(),
});

/**
 * MESSAGES_UPSERT event data schema
 */
const MessagesUpsertDataSchema = z.object({
  key: MessageKeySchema,
  message: MessageContentSchema,
  messageType: z.string(), // 'conversation', 'imageMessage', etc.
  messageTimestamp: z.number(), // Unix timestamp
  pushName: z.string().optional().nullable(), // Sender name (can be null/undefined)
  broadcast: z.boolean().optional(),
});

/**
 * CONNECTION_UPDATE event data schema
 */
const ConnectionUpdateDataSchema = z.object({
  state: z.enum(['open', 'connecting', 'close', 'closed']),
  statusReason: z.number().optional(),
  qr: z.string().optional(), // QR code if in connecting state
});

/**
 * QRCODE_UPDATED event data schema
 */
const QRCodeUpdatedDataSchema = z.object({
  qrcode: z.string(), // Base64 QR code
});

/**
 * Schema permissivo para o payload raw da Evolution API (aceita v1 e v2)
 */
const EvolutionWebhookRawSchema = z.object({
  event: z.string(),
  instance: z.string(),
  data: z.union([z.record(z.string(), z.any()), z.array(z.any()), z.object({})]),
  destination: z.string().optional(),
  date_time: z.string().optional(),
  sender: z.string().optional(),
  server_url: z.string().optional(),
  apikey: z.string().optional(),
});

/**
 * Extrai data como objeto (Evolution v2 pode enviar data como array)
 */
function extractDataAsObject(data: unknown): Record<string, unknown> {
  if (Array.isArray(data) && data.length > 0) {
    return typeof data[0] === 'object' && data[0] !== null ? (data[0] as Record<string, unknown>) : {};
  }
  if (typeof data === 'object' && data !== null) return data as Record<string, unknown>;
  return {};
}

/**
 * Main Evolution API webhook schema - valida e normaliza
 */
export const EvolutionWebhookSchema = EvolutionWebhookRawSchema.transform((raw) => {
  const event = normalizeWebhookEvent(raw.event);
  const data = extractDataAsObject(raw.data);
  return {
    event,
    instance: raw.instance,
    data,
    destination: raw.destination,
    date_time: raw.date_time,
    sender: raw.sender,
    server_url: raw.server_url,
    apikey: raw.apikey,
  };
});

/**
 * Type inferred from schema
 */
export type EvolutionWebhookData = z.infer<typeof EvolutionWebhookSchema>;

/**
 * Type for messages.upsert event
 */
export type MessagesUpsertEvent = {
  event: 'messages.upsert';
  instance: string;
  data: z.infer<typeof MessagesUpsertDataSchema>;
};

/**
 * Type for connection.update event
 */
export type ConnectionUpdateEvent = {
  event: 'connection.update';
  instance: string;
  data: z.infer<typeof ConnectionUpdateDataSchema>;
};

/**
 * Type for qrcode.updated event
 */
export type QRCodeUpdatedEvent = {
  event: 'qrcode.updated';
  instance: string;
  data: z.infer<typeof QRCodeUpdatedDataSchema>;
};

/**
 * Supported media types
 */
export const SUPPORTED_MEDIA_TYPES = {
  IMAGE: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
  AUDIO: ['audio/ogg', 'audio/mpeg', 'audio/mp4', 'audio/amr'],
  VIDEO: ['video/mp4', 'video/3gpp'],
  DOCUMENT: ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
} as const;

/**
 * Extract text content from Evolution message
 */
export function extractMessageContent(messageData: z.infer<typeof MessagesUpsertDataSchema>): string {
  const msg = messageData.message;

  if (msg.conversation) return msg.conversation;
  if (msg.extendedTextMessage?.text) return msg.extendedTextMessage.text;
  if (msg.imageMessage?.caption) return `[IMAGE] ${msg.imageMessage.caption}`;
  if (msg.videoMessage?.caption) return `[VIDEO] ${msg.videoMessage.caption}`;
  if (msg.documentMessage?.caption) return `[DOCUMENT] ${msg.documentMessage.caption}`;
  if (msg.audioMessage) return '[AUDIO]';
  if (msg.locationMessage) return `[LOCATION] ${msg.locationMessage.name || 'Location'}`;
  if (msg.contactMessage) return `[CONTACT] ${msg.contactMessage.displayName}`;

  return '[MESSAGE]';
}

/**
 * Detect media type from Evolution message
 */
export function detectMediaType(
  messageData: z.infer<typeof MessagesUpsertDataSchema>
): 'image' | 'audio' | 'video' | 'document' | null {
  const msg = messageData.message;

  if (msg.imageMessage) return 'image';
  if (msg.audioMessage) return 'audio';
  if (msg.videoMessage) return 'video';
  if (msg.documentMessage) return 'document';

  return null;
}

/**
 * Extract phone number from Evolution remoteJid format
 *
 * @param remoteJid Format: 5511999999999@s.whatsapp.net
 * @returns Phone number: 5511999999999
 */
export function extractPhoneNumber(remoteJid: string): string {
  return remoteJid.split('@')[0];
}

/**
 * Check if message has media
 */
export function hasMedia(messageData: z.infer<typeof MessagesUpsertDataSchema>): boolean {
  const msg = messageData.message;
  return !!(
    msg.imageMessage ||
    msg.audioMessage ||
    msg.videoMessage ||
    msg.documentMessage
  );
}

/**
 * Extract media URL from message
 */
export function extractMediaUrl(messageData: z.infer<typeof MessagesUpsertDataSchema>): string | null {
  const msg = messageData.message;

  if (msg.imageMessage?.url) return msg.imageMessage.url;
  if (msg.audioMessage?.url) return msg.audioMessage.url;
  if (msg.videoMessage?.url) return msg.videoMessage.url;
  if (msg.documentMessage?.url) return msg.documentMessage.url;

  return null;
}

/**
 * Map Evolution connection state to our status enum
 */
export function mapConnectionState(
  state: string
): 'connected' | 'connecting' | 'disconnected' | 'closed' {
  const normalized = state.toLowerCase();

  if (normalized === 'open') return 'connected';
  if (normalized === 'connecting') return 'connecting';
  if (normalized === 'close' || normalized === 'closed') return 'closed';

  return 'disconnected';
}

/**
 * Schema for Evolution API configuration validation
 */
export const EvolutionConfigSchema = z.object({
  EVOLUTION_API_URL: z.string().url('EVOLUTION_API_URL must be a valid URL'),
  EVOLUTION_API_KEY: z.string().min(1, 'EVOLUTION_API_KEY is required'),
});

export type EvolutionConfig = z.infer<typeof EvolutionConfigSchema>;
