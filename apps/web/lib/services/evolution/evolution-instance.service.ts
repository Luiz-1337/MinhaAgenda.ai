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

import { db, salons, agents, eq } from '@repo/db';
import QRCode from 'qrcode';
import { getEvolutionClient, EvolutionAPIError } from './evolution-api.service';
import { logger } from '../../infra/logger';
import { acquireLock, releaseLock } from '../../infra/redis';

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

const WEBHOOK_RETRY_ATTEMPTS = 3;
const WEBHOOK_RETRY_DELAY_MS = 1000;

/**
 * Configura o webhook da instância na Evolution API para receber connection.update e mensagens.
 * Faz até 3 tentativas com backoff para garantir que o webhook seja configurado.
 */
export async function setInstanceWebhook(instanceName: string): Promise<void> {
  const baseUrl = getWebhookBaseUrl();
  if (!baseUrl) return;

  const webhookUrl = `${baseUrl}/api/webhook/whatsapp`;
  const client = getEvolutionClient();

  // Token secreto para validar payloads recebidos (se configurado)
  const webhookToken = process.env.EVOLUTION_WEBHOOK_TOKEN || undefined;

  let lastError: unknown;

  for (let attempt = 1; attempt <= WEBHOOK_RETRY_ATTEMPTS; attempt++) {
    try {
      // Evolution API v2.1.1 requires nested "webhook" object
      await client.post(`/webhook/set/${instanceName}`, {
        webhook: {
          enabled: true,
          url: webhookUrl,
          webhookByEvents: false,
          webhookBase64: true,
          events: [...WEBHOOK_EVENTS],
          ...(webhookToken ? { headers: { 'x-webhook-secret': webhookToken } } : {}),
        },
      });
      logger.info({ instanceName, webhookUrl, attempt }, 'Evolution API webhook configured');
      return; // Sucesso - sai da função
    } catch (error) {
      lastError = error;
      logger.warn(
        { err: error, instanceName, webhookUrl, attempt, maxAttempts: WEBHOOK_RETRY_ATTEMPTS },
        'Failed to set Evolution API webhook, retrying'
      );
      if (attempt < WEBHOOK_RETRY_ATTEMPTS) {
        await sleep(WEBHOOK_RETRY_DELAY_MS * attempt); // Backoff linear
      }
    }
  }

  logger.error(
    { err: lastError, instanceName, webhookUrl },
    'Failed to set Evolution API webhook after all retries'
  );
  throw lastError;
}

const INSTANCE_LOCK_TTL_MS = 15000; // 15s lock para criação de instância

/**
 * Get or create Evolution API instance for a salon.
 * Protegido com lock distribuído para evitar criação duplicada.
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
      try {
        await setInstanceWebhook(salon.evolutionInstanceName);
      } catch (webhookErr) {
        logger.error({ err: webhookErr, instanceName: salon.evolutionInstanceName }, 'Webhook setup failed for existing instance');
        // Não bloqueia retorno - instância existe, webhook pode ser corrigido depois
      }
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

  // Lock distribuído para evitar criação duplicada de instância
  const lockId = await acquireLock(`instance-create:${salonId}`, INSTANCE_LOCK_TTL_MS);
  if (!lockId) {
    // Outra request está criando a instância - re-check DB após breve espera
    await sleep(2000);
    const refreshedSalon = await db.query.salons.findFirst({
      where: eq(salons.id, salonId),
      columns: { evolutionInstanceName: true },
    });
    if (refreshedSalon?.evolutionInstanceName) {
      const status = await getInstanceStatus(refreshedSalon.evolutionInstanceName);
      return { instanceName: refreshedSalon.evolutionInstanceName, status };
    }
    throw new Error('Could not acquire lock to create Evolution instance and no instance found');
  }

  try {
    // Re-check DB dentro do lock (double-check locking)
    const salonRecheck = await db.query.salons.findFirst({
      where: eq(salons.id, salonId),
      columns: { evolutionInstanceName: true },
    });
    if (salonRecheck?.evolutionInstanceName) {
      const status = await getInstanceStatus(salonRecheck.evolutionInstanceName);
      return { instanceName: salonRecheck.evolutionInstanceName, status };
    }

    // Create new instance
    const instanceName = process.env.EVOLUTION_INSTANCE_NAME || `salon-${salonId}`;

    // If using global instance name, check if it already exists
    if (process.env.EVOLUTION_INSTANCE_NAME) {
      try {
        const status = await getInstanceStatus(instanceName);
        await db
          .update(salons)
          .set({
            evolutionInstanceName: instanceName,
            updatedAt: new Date(),
          })
          .where(eq(salons.id, salonId));

        try {
          await setInstanceWebhook(instanceName);
        } catch (webhookErr) {
          logger.error({ err: webhookErr, instanceName }, 'Webhook setup failed for global instance');
        }

        return { instanceName, status };
      } catch (error) {
        if (!(error instanceof EvolutionAPIError && error.statusCode === 404)) {
          throw error;
        }
      }
    }

    const client = getEvolutionClient();
    logger.info({ salonId, salonName: salon.name }, 'Creating Evolution API instance');

    const response = await client.post<CreateInstanceResponse>(
      '/instance/create',
      {
        instanceName,
        qrcode: true,
        integration: 'WHATSAPP-BAILEYS',
      }
    );

    await db
      .update(salons)
      .set({
        evolutionInstanceName: instanceName,
        evolutionConnectionStatus: 'disconnected',
        updatedAt: new Date(),
      })
      .where(eq(salons.id, salonId));

    try {
      await setInstanceWebhook(instanceName);
    } catch (webhookErr) {
      logger.error({ err: webhookErr, instanceName }, 'Webhook setup failed after instance creation');
    }

    logger.info(
      { salonId, instanceName, hasQRCode: !!response.qrcode },
      'Evolution API instance created'
    );

    return {
      instanceName,
      status: 'disconnected',
      qrcode: response.qrcode?.base64,
    };
  } catch (error) {
    logger.error(
      { err: error, salonId },
      'Failed to create Evolution API instance'
    );
    throw error;
  } finally {
    await releaseLock(`instance-create:${salonId}`, lockId);
  }
}

/**
 * Get or create Evolution API instance for a specific agent (PRO/Enterprise).
 * Each agent gets its own instance named `agent-{agentId}`.
 */
export async function getOrCreateAgentInstance(
  agentId: string
): Promise<InstanceCreationResult> {
  const agent = await db.query.agents.findFirst({
    where: eq(agents.id, agentId),
    columns: {
      id: true,
      salonId: true,
      name: true,
      evolutionInstanceName: true,
      evolutionInstanceToken: true,
    },
  });

  if (!agent) {
    throw new Error('Agent not found');
  }

  // If instance already exists, ensure webhook is set and return it
  if (agent.evolutionInstanceName) {
    try {
      const status = await getInstanceStatus(agent.evolutionInstanceName);
      try {
        await setInstanceWebhook(agent.evolutionInstanceName);
      } catch (webhookErr) {
        logger.error({ err: webhookErr, instanceName: agent.evolutionInstanceName }, 'Webhook setup failed for existing agent instance');
      }
      return {
        instanceName: agent.evolutionInstanceName,
        status,
      };
    } catch (error) {
      if (error instanceof EvolutionAPIError && error.statusCode === 404) {
        logger.info(
          { instanceName: agent.evolutionInstanceName, agentId },
          'Agent instance not found in Evolution API (404), will recreate'
        );
      } else {
        throw error;
      }
    }
  }

  // Lock distribuído para evitar criação duplicada
  const lockId = await acquireLock(`instance-create:agent:${agentId}`, INSTANCE_LOCK_TTL_MS);
  if (!lockId) {
    await sleep(2000);
    const refreshed = await db.query.agents.findFirst({
      where: eq(agents.id, agentId),
      columns: { evolutionInstanceName: true },
    });
    if (refreshed?.evolutionInstanceName) {
      const status = await getInstanceStatus(refreshed.evolutionInstanceName);
      return { instanceName: refreshed.evolutionInstanceName, status };
    }
    throw new Error('Could not acquire lock to create agent Evolution instance');
  }

  try {
    // Re-check dentro do lock
    const agentRecheck = await db.query.agents.findFirst({
      where: eq(agents.id, agentId),
      columns: { evolutionInstanceName: true },
    });
    if (agentRecheck?.evolutionInstanceName) {
      const status = await getInstanceStatus(agentRecheck.evolutionInstanceName);
      return { instanceName: agentRecheck.evolutionInstanceName, status };
    }

    const instanceName = `agent-${agentId}`;
    const client = getEvolutionClient();
    logger.info({ agentId, agentName: agent.name }, 'Creating Evolution API instance for agent');

    const response = await client.post<CreateInstanceResponse>(
      '/instance/create',
      {
        instanceName,
        qrcode: true,
        integration: 'WHATSAPP-BAILEYS',
      }
    );

    await db
      .update(agents)
      .set({
        evolutionInstanceName: instanceName,
        evolutionConnectionStatus: 'disconnected',
        updatedAt: new Date(),
      })
      .where(eq(agents.id, agentId));

    try {
      await setInstanceWebhook(instanceName);
    } catch (webhookErr) {
      logger.error({ err: webhookErr, instanceName }, 'Webhook setup failed after agent instance creation');
    }

    logger.info(
      { agentId, instanceName, hasQRCode: !!response.qrcode },
      'Evolution API agent instance created'
    );

    return {
      instanceName,
      status: 'disconnected',
      qrcode: response.qrcode?.base64,
    };
  } catch (error) {
    logger.error({ err: error, agentId }, 'Failed to create Evolution API agent instance');
    throw error;
  } finally {
    await releaseLock(`instance-create:agent:${agentId}`, lockId);
  }
}

/**
 * Resolve which Evolution instance to use for sending messages.
 * Agent-level instance takes priority (PRO/Enterprise), falls back to salon-level (SOLO).
 */
export async function resolveEvolutionInstance(
  salonId: string,
  agentId?: string | null
): Promise<{ instanceName: string; connectionStatus: string | null }> {
  // Try agent-level instance first
  if (agentId) {
    const agent = await db.query.agents.findFirst({
      where: eq(agents.id, agentId),
      columns: {
        evolutionInstanceName: true,
        evolutionConnectionStatus: true,
      },
    });
    if (agent?.evolutionInstanceName) {
      return {
        instanceName: agent.evolutionInstanceName,
        connectionStatus: agent.evolutionConnectionStatus,
      };
    }
  }

  // Fallback to salon-level instance
  const salon = await db.query.salons.findFirst({
    where: eq(salons.id, salonId),
    columns: {
      evolutionInstanceName: true,
      evolutionConnectionStatus: true,
    },
  });

  if (!salon?.evolutionInstanceName) {
    throw new Error(`No Evolution instance found for salon ${salonId}`);
  }

  return {
    instanceName: salon.evolutionInstanceName,
    connectionStatus: salon.evolutionConnectionStatus,
  };
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

/** Extrai número do owner (5511999999999@s.whatsapp.net, +5511999999999, etc.) */
function extractPhoneFromOwner(owner: unknown): string | null {
  const str = typeof owner === 'string' ? owner : String(owner ?? '');
  if (!str || str === 'undefined' || str === 'null') return null;

  // Remove espaços, traços e parênteses
  const cleaned = str.replace(/[\s\-()]/g, '');

  // Tenta extrair número no formato: +5511999999999, 5511999999999@s.whatsapp.net, etc.
  const match = cleaned.match(/\+?(\d{10,15})(?:@.*)?/);
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

    logger.debug({
      instanceName,
      responseType: typeof response,
      isArray: Array.isArray(raw),
      itemCount: items.length,
    }, 'getConnectedPhoneNumber: raw response info');

    const found = items.find(
      (i: any) =>
        i?.instance?.instanceName === instanceName ||
        i?.instanceName === instanceName ||
        i?.name === instanceName
    );

    if (!found) {
      logger.warn({
        instanceName,
        itemNames: items.map((i: any) => i?.instance?.instanceName ?? i?.instanceName ?? i?.name ?? 'unknown'),
      }, 'getConnectedPhoneNumber: instance not found in response items');
      return null;
    }

    const instanceData = found.instance ?? found;

    // Check multiple fields for the phone number
    const candidates = [
      instanceData.number,      // Often present in v2
      instanceData.owner,       // Standard field
      instanceData.ownerJid,    // Alternative owner field
      instanceData.id,          // Sometimes the JID
      instanceData.wuid,        // WhatsApp User ID
      instanceData.phone,       // Direct phone field
      instanceData.phoneNumber, // Alternative phone field
    ];

    for (const candidate of candidates) {
      const phone = extractPhoneFromOwner(candidate);
      if (phone) {
        logger.info({ instanceName, phone, sourceField: candidate }, 'getConnectedPhoneNumber: extracted phone successfully');
        return phone;
      }
    }

    // Fallback: Try to extract from profilePictureUrl
    if (instanceData?.profilePictureUrl) {
      const fromUrl = extractPhoneFromOwner(instanceData.profilePictureUrl);
      if (fromUrl) {
        logger.info({ instanceName, phone: fromUrl }, 'getConnectedPhoneNumber: extracted phone from profilePictureUrl');
        return fromUrl;
      }
    }

    // Debug logging if we can't find the number - log ALL available data
    logger.warn({
      instanceName,
      availableKeys: Object.keys(instanceData),
      data: JSON.stringify(instanceData).substring(0, 500),
      number: instanceData.number,
      owner: instanceData.owner,
      ownerJid: instanceData.ownerJid,
      id: instanceData.id,
      wuid: instanceData.wuid,
      phone: instanceData.phone,
    }, 'Could not extract connected phone from Evolution API response - check raw data above');

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
