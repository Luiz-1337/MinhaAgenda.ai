/**
 * Evolution API Instance Management Service
 *
 * Manages Evolution API instances for multi-tenant WhatsApp connections.
 * Each salon gets one Evolution API instance.
 *
 * Instance lifecycle:
 * - Creating: Instance being created
 * - Disconnected: Instance created but not connected to WhatsApp
 * - Connecting: Waiting for QR code scan
 * - Connected: Active WhatsApp connection
 * - Closed: Connection terminated
 */

import { db, salons, eq } from '@repo/db';
import QRCode from 'qrcode';
import { getEvolutionClient, EvolutionAPIError } from './evolution-api.service';
import { logger } from '../logger';

/**
 * Instance status type
 */
export type InstanceStatus = 'disconnected' | 'connecting' | 'connected' | 'closed';

/**
 * Instance data interface
 */
export interface InstanceData {
  instanceName: string;
  status: InstanceStatus;
  qrcode?: string; // Base64 QR code
  phoneNumber?: string;
}

/**
 * Instance creation result with QR code
 */
export interface InstanceCreationResult extends InstanceData {
  qrcode?: string;
}

/**
 * Evolution API instance creation response
 */
interface CreateInstanceResponse {
  instance: {
    instanceName: string;
    status: string;
  };
  qrcode?: {
    pairingCode: string | null;
    code: string;
    base64: string;
    count: number;
  };
}

/**
 * Evolution API connection response (format varies by API version)
 */
interface ConnectInstanceResponse {
  base64?: string;
  code?: string;
  pairingCode?: string | null;
  count?: number;
  qrcode?: {
    base64: string;
    code?: string;
  };
}

/**
 * Evolution API connection state response
 */
interface ConnectionStateResponse {
  instance: {
    state: string;
    status?: string;
  };
}

/** Eventos que o webhook deve receber para o fluxo WhatsApp */
const WEBHOOK_EVENTS = [
  'CONNECTION_UPDATE',
  'MESSAGES_UPSERT',
  'QRCODE_UPDATED',
] as const;

/**
 * Retorna a URL base do app para o webhook (precisa ser acessível pela Evolution API)
 */
function getWebhookBaseUrl(): string {
  const url = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL;
  if (!url) {
    logger.warn('NEXT_PUBLIC_APP_URL ou VERCEL_URL não definida; webhook não será configurado');
    return '';
  }
  // Ensure we only use the origin (protocol + host), stripping any accidental paths
  try {
    const parsed = new URL(url.startsWith('http') ? url : `https://${url}`);
    return parsed.origin;
  } catch {
    // Fallback: simple cleanup
    const base = url.startsWith('http') ? url : `https://${url}`;
    return base.replace(/\/$/, '').split('/api')[0];
  }
}

/**
 * Configura o webhook da instância na Evolution API para receber connection.update e mensagens
 */
export async function setInstanceWebhook(instanceName: string): Promise<void> {
  const baseUrl = getWebhookBaseUrl();
  if (!baseUrl) return;

  const webhookUrl = `${baseUrl}/api/webhook/whatsapp`;
  logger.info({ webhookUrl, envValue: process.env.NEXT_PUBLIC_APP_URL }, '[v2] Setting webhook URL');
  const client = getEvolutionClient();

  try {
    // Evolution API v2.1.1 requires nested "webhook" object
    await client.post(`/webhook/set/${instanceName}`, {
      webhook: {
        enabled: true,
        url: webhookUrl,
        webhookByEvents: false,
        webhookBase64: true,
        events: [...WEBHOOK_EVENTS],
      },
    });
    logger.info({ instanceName, webhookUrl }, 'Evolution API webhook configured');
  } catch (error) {
    logger.error(
      { err: error, instanceName, webhookUrl },
      'Failed to set Evolution API webhook'
    );
    throw error;
  }
}

/**
 * Get or create Evolution API instance for a salon
 *
 * Similar to getOrCreateSubaccount in Twilio service
 */
export async function getOrCreateInstance(
  salonId: string
): Promise<InstanceCreationResult> {
  // Check if instance already exists in DB
  const salon = await db.query.salons.findFirst({
    where: eq(salons.id, salonId),
    columns: {
      id: true,
      name: true,
      evolutionInstanceName: true,
      evolutionInstanceToken: true,
    },
  });

  if (!salon) {
    throw new Error('Salon not found');
  }

  // If instance exists, ensure webhook is set and return it
  if (salon.evolutionInstanceName) {
    try {
      const status = await getInstanceStatus(salon.evolutionInstanceName);
      setInstanceWebhook(salon.evolutionInstanceName).catch((err) => {
        logger.warn({ err, instanceName: salon.evolutionInstanceName }, 'Webhook set failed (continuing)');
      });
      return {
        instanceName: salon.evolutionInstanceName,
        status,
      };
    } catch (error) {
      // If instance was deleted from Evolution API but exists in DB, recreate it
      if (error instanceof EvolutionAPIError && error.statusCode === 404) {
        logger.info(
          { instanceName: salon.evolutionInstanceName, salonId },
          '[v2] Instance not found in Evolution API (404), will recreate'
        );
        // Continue below to create new instance
      } else {
        throw error;
      }
    }
  }

  // Create new instance
  // Check for environment variable override regarding instance name
  const instanceName = process.env.EVOLUTION_INSTANCE_NAME || `salon-${salonId}`;

  // If using global instance name, check if it already exists to avoid creation error
  if (process.env.EVOLUTION_INSTANCE_NAME) {
    try {
      const status = await getInstanceStatus(instanceName);
      // Update DB to link to this global instance
      await db
        .update(salons)
        .set({
          evolutionInstanceName: instanceName,
          updatedAt: new Date(),
        })
        .where(eq(salons.id, salonId));

      // Ensure webhook is set
      setInstanceWebhook(instanceName).catch((err) => {
        logger.warn({ err, instanceName }, 'Webhook set for global instance failed (continuing)');
      });

      return {
        instanceName,
        status,
      };
    } catch (error) {
      // If 404, proceed to creation
      if (!(error instanceof EvolutionAPIError && error.statusCode === 404)) {
        throw error;
      }
    }
  }

  const client = getEvolutionClient();

  // Log instance creation
  logger.info({ salonId, salonName: salon.name }, 'Creating Evolution API instance');

  try {
    const response = await client.post<CreateInstanceResponse>(
      '/instance/create',
      {
        instanceName,
        qrcode: true,
        integration: 'WHATSAPP-BAILEYS',
      }
    );

    // Save instance name to database
    await db
      .update(salons)
      .set({
        evolutionInstanceName: instanceName,
        evolutionConnectionStatus: 'disconnected',
        updatedAt: new Date(),
      })
      .where(eq(salons.id, salonId));

    // Configura webhook para receber connection.update quando o usuário escanear o QR
    setInstanceWebhook(instanceName).catch((err) => {
      logger.warn({ err, instanceName }, 'Webhook set after create failed (continuing)');
    });

    logger.info(
      { salonId, instanceName, hasQRCode: !!response.qrcode },
      'Evolution API instance created'
    );

    // Return instance data with QR code from creation response
    return {
      instanceName,
      status: 'disconnected',
      qrcode: response.qrcode?.base64,
    };
  } catch (error) {
    logger.error(
      {
        err: error,
        salonId,
        instanceName,
      },
      'Failed to create Evolution API instance'
    );
    throw error;
  }
}

const CONNECT_RETRY_ATTEMPTS = 3;
const CONNECT_RETRY_DELAY_MS = 2000;

/**
 * Sleep helper for retry delays
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Normalize base64 string (remove whitespace/newlines that break data URLs) */
function normalizeBase64(value: string): string {
  return value.replace(/\s/g, '').trim();
}

/**
 * Extract base64 QR code from Evolution API response (handles multiple formats)
 */
async function extractQRCodeBase64(response: ConnectInstanceResponse): Promise<string> {
  // Direct base64 in response
  if (response.base64) return normalizeBase64(response.base64);
  // Nested in qrcode object
  if (response.qrcode?.base64) return normalizeBase64(response.qrcode.base64);

  // Fallback: generate QR image from code string
  const code = response.code ?? response.qrcode?.code;
  if (code) {
    const dataUrl = await QRCode.toDataURL(code, { type: 'image/png', margin: 2 });
    return dataUrl.replace(/^data:image\/png;base64,/, '');
  }

  throw new Error('Resposta da Evolution API sem dados de QR code');
}

/**
 * Connect instance to WhatsApp (fetches QR code directly from Evolution API)
 *
 * Uses correct endpoint GET /instance/connect/{instanceName}.
 * Handles multiple response formats and retries for timing issues.
 */
export async function connectInstance(
  instanceName: string
): Promise<{ qrcode: string }> {
  const client = getEvolutionClient();
  let lastError: unknown;

  for (let attempt = 1; attempt <= CONNECT_RETRY_ATTEMPTS; attempt++) {
    try {
      const response = await client.get<ConnectInstanceResponse>(
        `/instance/connect/${instanceName}`
      );

      const qrcode = await extractQRCodeBase64(response);
      logger.info({ instanceName, attempt }, 'QR code fetched from Evolution API');
      return { qrcode };
    } catch (error) {
      lastError = error;
      logger.warn(
        { err: error, instanceName, attempt, maxAttempts: CONNECT_RETRY_ATTEMPTS },
        'Failed to fetch QR code from Evolution API'
      );
      if (attempt < CONNECT_RETRY_ATTEMPTS) {
        await sleep(CONNECT_RETRY_DELAY_MS);
      }
    }
  }

  logger.error(
    { err: lastError, instanceName },
    'Failed to retrieve QR code after retries'
  );

  const msg =
    lastError instanceof Error
      ? lastError.message
      : 'QR code not available. Please try again.';
  throw new Error(msg);
}

/**
 * Restart Evolution API instance (required when status is closed to get fresh QR)
 */
export async function restartInstance(instanceName: string): Promise<void> {
  const client = getEvolutionClient();

  try {
    await client.post(`/instance/restart/${instanceName}`, {});
    logger.info({ instanceName }, 'Evolution API instance restarted');
  } catch (error) {
    logger.error(
      { err: error, instanceName },
      'Failed to restart Evolution API instance'
    );
    throw error;
  }
}

/** Extrai número do owner (5511999999999@s.whatsapp.net) ou profilePictureUrl/JID */
function extractPhoneFromOwner(owner: unknown): string | null {
  const str = typeof owner === 'string' ? owner : String(owner ?? '');
  const match = str.match(/^(\d{10,15})@?/);
  return match ? `+${match[1]}` : null;
}

/**
 * Busca o número de telefone conectado à instância (Evolution API)
 * Tenta fetchInstances e /instances; aceita owner ou profilePictureUrl
 */
export async function getConnectedPhoneNumber(
  instanceName: string
): Promise<string | null> {
  const client = getEvolutionClient();

  try {
    // Evolution API v2: GET /instance/fetchInstances?instanceName=xxx
    const response = await client.get<unknown>(
      `/instance/fetchInstances?instanceName=${encodeURIComponent(instanceName)}`
    );

    // Normalize response: can be array, object with "instance", or object with "response" array
    const raw = (response as any)?.response ?? response;
    const items = Array.isArray(raw) ? raw : [raw];

    const found = items.find(
      (i: any) =>
        i?.instance?.instanceName === instanceName ||
        i?.instanceName === instanceName
    );

    if (!found) {
      return null;
    }

    const instanceData = found.instance ?? found;

    // Check multiple fields for the phone number
    const candidates = [
      instanceData.number, // Often present in v2
      instanceData.owner,  // Standard field
      instanceData.id,     // Sometimes the JID
    ];

    for (const candidate of candidates) {
      const phone = extractPhoneFromOwner(candidate);
      if (phone) return phone;
    }

    // Fallback: Try to extract from profilePictureUrl
    if (instanceData?.profilePictureUrl) {
      const fromUrl = extractPhoneFromOwner(instanceData.profilePictureUrl);
      if (fromUrl) return fromUrl;
    }

    // Debug logging if we can't find the number
    logger.warn({
      instanceName,
      availableKeys: Object.keys(instanceData),
      data: JSON.stringify(instanceData).substring(0, 200)
    }, 'Could not extract connected phone from Evolution API response');

  } catch (error) {
    logger.warn({ err: error, instanceName }, 'Error fetching connected phone from Evolution API');
  }

  return null;
}

/**
 * Get instance connection status
 */
export async function getInstanceStatus(
  instanceName: string
): Promise<InstanceStatus> {
  const client = getEvolutionClient();

  try {
    const response = await client.get<ConnectionStateResponse>(
      `/instance/connectionState/${instanceName}`
    );

    // Map Evolution API states to our enum
    const state = response.instance.state.toLowerCase();

    if (state === 'open') return 'connected';
    if (state === 'connecting') return 'connecting';
    if (state === 'close' || state === 'closed') return 'closed';

    return 'disconnected';
  } catch (error) {
    // If instance not found, propagate error (so we can recreate it if needed)
    if (error instanceof EvolutionAPIError && error.statusCode === 404) {
      throw error;
    }

    logger.error(
      {
        err: error,
        instanceName,
      },
      'Failed to get Evolution API instance status'
    );

    throw error;
  }
}

/**
 * Disconnect instance from WhatsApp
 */
export async function disconnectInstance(
  instanceName: string
): Promise<void> {
  const client = getEvolutionClient();

  try {
    await client.delete(`/instance/logout/${instanceName}`);

    logger.info({ instanceName }, 'Evolution API instance disconnected');
  } catch (error) {
    logger.error(
      {
        err: error,
        instanceName,
      },
      'Failed to disconnect Evolution API instance'
    );
    throw error;
  }
}

/**
 * Delete instance completely
 */
export async function deleteInstance(
  instanceName: string
): Promise<void> {
  const client = getEvolutionClient();

  try {
    await client.delete(`/instance/delete/${instanceName}`);

    logger.info({ instanceName }, 'Evolution API instance deleted');
  } catch (error) {
    logger.error(
      {
        err: error,
        instanceName,
      },
      'Failed to delete Evolution API instance'
    );
    throw error;
  }
}

/**
 * Map Evolution API status to agent whatsapp status
 */
export function mapEvolutionStatusToAgentStatus(
  status: InstanceStatus
): 'verified' | 'pending_verification' | 'verifying' | 'failed' {
  switch (status) {
    case 'connected':
      return 'verified';
    case 'connecting':
      return 'verifying';
    case 'disconnected':
      return 'pending_verification';
    case 'closed':
      return 'failed';
    default:
      return 'failed';
  }
}

/**
 * Chat item returned by Evolution API findChats
 */
export interface EvolutionChat {
  id?: string;
  remoteJid?: string;
  name?: string;
  conversationTimestamp?: number;
  unreadCount?: number;
  archive?: boolean;
  [key: string]: unknown;
}

/**
 * Fetch all chats for an Evolution API instance.
 * Tries GET (v1) and POST (v2) findChats endpoints.
 */
export async function getInstanceChats(
  instanceName: string
): Promise<EvolutionChat[]> {
  const client = getEvolutionClient();

  // v1: GET /chat/findChats/{instanceName} ou v2: POST /chat/findChats/{instanceName}
  try {
    const getResponse = await client.get<{ chats?: EvolutionChat[]; response?: EvolutionChat[] }>(
      `/chat/findChats/${instanceName}`
    );
    const chats = getResponse?.chats ?? getResponse?.response ?? (Array.isArray(getResponse) ? getResponse : []);
    return Array.isArray(chats) ? chats : [];
  } catch (getErr) {
    // v2 usa POST com body
    try {
      const postResponse = await client.post<{ chats?: EvolutionChat[]; response?: EvolutionChat[] }>(
        `/chat/findChats/${instanceName}`,
        {}
      );
      const chats = postResponse?.chats ?? postResponse?.response ?? (Array.isArray(postResponse) ? postResponse : []);
      return Array.isArray(chats) ? chats : [];
    } catch (postErr) {
      logger.error(
        { err: postErr, instanceName, getErr },
        'Failed to fetch chats from Evolution API (GET and POST)'
      );
      throw postErr;
    }
  }
}

/**
 * Message item returned by Evolution API findMessages
 */
export interface EvolutionMessage {
  key?: { id?: string; remoteJid?: string; fromMe?: boolean };
  message?: { conversation?: string; extendedTextMessage?: { text?: string };[key: string]: unknown };
  messageTimestamp?: number;
  [key: string]: unknown;
}

/**
 * Extract text from Evolution message object
 */
export function getMessageText(msg: EvolutionMessage): string {
  const m = msg?.message;
  if (!m) return '';
  if (typeof m.conversation === 'string') return m.conversation;
  if (m.extendedTextMessage?.text) return m.extendedTextMessage.text;
  return JSON.stringify(m);
}

/**
 * Fetch messages for a chat (Evolution API findMessages).
 * Tries POST /chat/findMessages/{instanceName} with body { remoteJid, limit }.
 */
export async function getInstanceMessages(
  instanceName: string,
  remoteJid: string,
  limit = 50
): Promise<EvolutionMessage[]> {
  const client = getEvolutionClient();

  try {
    const response = await client.post<{ messages?: EvolutionMessage[]; response?: EvolutionMessage[] }>(
      `/chat/findMessages/${instanceName}`,
      { remoteJid, limit }
    );
    const raw = response?.messages ?? response?.response ?? (Array.isArray(response) ? response : []);
    const list = Array.isArray(raw) ? raw : [];
    // Filtrar por remoteJid no cliente (API às vezes não filtra)
    const normalizedJid = remoteJid.includes('@') ? remoteJid : `${remoteJid}@s.whatsapp.net`;
    return list
      .filter((msg) => {
        const jid = msg?.key?.remoteJid ?? (msg as any).remoteJid;
        return jid === remoteJid || jid === normalizedJid;
      })
      .sort((a, b) => (a.messageTimestamp ?? 0) - (b.messageTimestamp ?? 0));
  } catch (err) {
    logger.error({ err, instanceName, remoteJid }, 'Failed to fetch messages from Evolution API');
    throw err;
  }
}

/**
 * Extract E.164 number from JID (5511999999999@s.whatsapp.net -> +5511999999999).
 * For groups (@g.us), returns the full JID — Evolution API expects JID for groups.
 */
export function jidToNumber(remoteJid: string): string {
  // Grupos: Evolution API aceita o JID completo no parâmetro "number"
  if (remoteJid.endsWith('@g.us')) {
    return remoteJid;
  }
  const beforeAt = remoteJid.split('@')[0];
  const digits = (beforeAt || '').replace(/\D/g, '');
  if (!digits) return remoteJid;
  return digits.startsWith('55') ? `+${digits}` : `+55${digits}`;
}

/**
 * Send a text message via Evolution API (for test screen).
 * Uses instanceName and remoteJid (JID) to send.
 * Supports direct chats (@s.whatsapp.net) and groups (@g.us).
 */
/** Timeout para envio de teste (grupos podem demorar muito na Evolution API) */
const TEST_SEND_TIMEOUT_MS = 60_000; // 60s, sem circuit breaker

export async function sendTestMessage(
  instanceName: string,
  remoteJid: string,
  text: string
): Promise<{ messageId: string }> {
  const client = getEvolutionClient();
  // Para grupos usa JID completo; para contatos usa número E.164
  const number = jidToNumber(remoteJid);

  // Usa postWithTimeout para não passar pelo circuit breaker (envio para grupo pode levar >30s)
  const result = await client.postWithTimeout<{ key?: { id?: string }; messageId?: string }>(
    `/message/sendText/${instanceName}`,
    { number, text },
    TEST_SEND_TIMEOUT_MS
  );
  const messageId = result?.key?.id ?? result?.messageId ?? '';
  return { messageId };
}
