/**
 * Sistema de Filas BullMQ para processamento assíncrono de mensagens WhatsApp
 * 
 * Features:
 * - Retry automático com backoff exponencial
 * - Priorização de mensagens de texto sobre mídia
 * - Rate limiting integrado
 * - Métricas de jobs
 */

import { Queue, QueueEvents, Job } from "bullmq";
import { getRedisClient } from "../infra/redis";
import { logger } from "../infra/logger";

/**
 * Dados do job de processamento de mensagem
 */
export interface MessageJobData {
  // Identificadores
  messageId: string;
  chatId: string;
  salonId: string;
  agentId: string; // ID do agente que receberá a mensagem
  customerId: string;
  instanceName: string;
  remoteJid: string;
  remoteJidAlt?: string;
  addressingMode: "lid" | "jid";
  clientPhone: string;
  replyToJid?: string; // JID original para responder (pode ser LID ou número)

  // Conteúdo
  body: string;

  // Mídia
  hasMedia: boolean;
  mediaType?: "image" | "audio" | "video" | "document";
  mediaUrl?: string;

  // Metadados
  receivedAt: string; // ISO timestamp
  profileName?: string;

  // Contexto adicional
  isNewCustomer?: boolean;
  customerName?: string;
}

/**
 * Resultado do processamento de mensagem
 */
export interface MessageJobResult {
  status: "success" | "manual_mode" | "media_handled" | "rate_limited" | "out_of_credits" | "error" | "coalesced" | "deferred";
  chatId: string;
  messageId: string;
  responseText?: string;
  tokensUsed?: number;
  duration?: number;
  error?: string;
}

// Nome da fila
const QUEUE_NAME = "whatsapp-messages";

// Janela de debounce: mensagens do mesmo chat enviadas dentro deste intervalo
// serão coalescidas (apenas a mais recente gera resposta de IA).
// Configurável via CHAT_DEBOUNCE_MS. Padrão: 1500ms.
const CHAT_DEBOUNCE_MS = parseInt(process.env.CHAT_DEBOUNCE_MS ?? "1500", 10);

// Prefixo da chave Redis que rastreia a mensagem mais recente por chat.
// Valor formato: "<receivedAtMs>:<messageId>"
// Comparamos por timestamp (nao por ordem de SET) para evitar bug onde webhook
// com latencia variavel sobrescreve o sentinel com mensagem mais antiga.
export const CHAT_LATEST_JOB_KEY = (chatId: string) => `chat:latest-job:${chatId}`;

// Lua script atomico: so atualiza o sentinel se o novo timestamp for mais novo.
// Evita race onde 2 webhooks em paralelo tentam SET e o mais antigo "ganha"
// porque terminou de executar depois.
const SET_LATEST_IF_NEWER_LUA = `
  local current = redis.call('GET', KEYS[1])
  if current then
    local currentTs = tonumber(string.match(current, '^(%d+)'))
    local newTs = tonumber(ARGV[2])
    if currentTs and newTs and currentTs >= newTs then
      return current
    end
  end
  redis.call('SET', KEYS[1], ARGV[1], 'EX', tonumber(ARGV[3]))
  return ARGV[1]
`;

/**
 * Parse o sentinel "<timestampMs>:<messageId>".
 * Aceita formato antigo (sem timestamp) para compatibilidade com jobs ja em fila.
 */
export function parseLatestJobSentinel(value: string | null): { timestampMs: number; messageId: string } | null {
  if (!value) return null;
  const colonIdx = value.indexOf(':');
  if (colonIdx === -1) {
    // Formato antigo: apenas messageId, sem timestamp.
    return { timestampMs: 0, messageId: value };
  }
  const tsStr = value.slice(0, colonIdx);
  const id = value.slice(colonIdx + 1);
  const ts = Number.parseInt(tsStr, 10);
  if (Number.isNaN(ts)) {
    // Formato invalido - assume que o valor inteiro e o messageId.
    return { timestampMs: 0, messageId: value };
  }
  return { timestampMs: ts, messageId: id };
}

// Singleton da fila
let messageQueue: Queue<MessageJobData, MessageJobResult> | null = null;
let queueEvents: QueueEvents | null = null;

/**
 * Obtém ou cria a instância da fila
 */
export function getMessageQueue(): Queue<MessageJobData, MessageJobResult> {
  if (messageQueue) {
    return messageQueue;
  }

  const connection = getRedisClient();

  messageQueue = new Queue<MessageJobData, MessageJobResult>(QUEUE_NAME, {
    connection,
    defaultJobOptions: {
      // Retry com backoff exponencial
      attempts: 3,
      backoff: {
        type: "exponential",
        delay: 2000, // 2s, 4s, 8s
      },
      // Remoção automática de jobs concluídos
      removeOnComplete: {
        age: 86400, // 24 horas
        count: 1000, // Mantém últimos 1000
      },
      // Remoção de jobs falhos após 7 dias
      removeOnFail: {
        age: 604800, // 7 dias
        count: 5000, // Mantém últimos 5000
      },
    },
  });

  logger.info({ queue: QUEUE_NAME }, "Message queue initialized");

  return messageQueue;
}

/**
 * Obtém eventos da fila para monitoramento
 */
export function getQueueEvents(): QueueEvents {
  if (queueEvents) {
    return queueEvents;
  }

  const connection = getRedisClient();
  queueEvents = new QueueEvents(QUEUE_NAME, { connection });

  // Log de eventos importantes
  queueEvents.on("completed", ({ jobId, returnvalue }) => {
    logger.info({ jobId, result: returnvalue }, "Job completed");
  });

  queueEvents.on("failed", ({ jobId, failedReason }) => {
    logger.error({ jobId, error: failedReason }, "Job failed");
  });

  queueEvents.on("stalled", ({ jobId }) => {
    logger.warn({ jobId }, "Job stalled");
  });

  return queueEvents;
}

/**
 * Enfileira uma mensagem para processamento assíncrono
 */
export async function enqueueMessage(
  data: MessageJobData
): Promise<Job<MessageJobData, MessageJobResult>> {
  const queue = getMessageQueue();
  const redis = getRedisClient();

  // Prioridade: texto (1) > mídia (2)
  // Menor número = maior prioridade
  const priority = data.hasMedia ? 2 : 1;

  const job = await queue.add("process-message", data, {
    jobId: data.messageId, // Garante unicidade (idempotência)
    priority,
    delay: CHAT_DEBOUNCE_MS, // Aguarda antes de processar para permitir coalescing
  });

  // Atualiza o sentinel de última mensagem do chat DEPOIS de enfileirar.
  // O worker usa esse valor para decidir se deve gerar resposta de IA ou
  // se uma mensagem mais recente já assumiu a responsabilidade (coalescing).
  // Feito após queue.add para evitar sentinel setado sem job correspondente.
  //
  // Usamos `receivedAt` (timestamp real da mensagem no WhatsApp) e Lua atomico
  // para garantir que so atualizamos se for de fato mais novo. Sem isso, webhook
  // com latencia variavel pode sobrescrever sentinel com mensagem mais antiga,
  // fazendo a mensagem realmente mais nova ser descartada como "coalesced".
  const receivedAtMs = new Date(data.receivedAt).getTime();
  const sentinelValue = `${receivedAtMs}:${data.messageId}`;
  await redis.eval(
    SET_LATEST_IF_NEWER_LUA,
    1,
    CHAT_LATEST_JOB_KEY(data.chatId),
    sentinelValue,
    String(receivedAtMs),
    "300"
  );

  logger.info(
    {
      jobId: job.id,
      messageId: data.messageId,
      chatId: data.chatId,
      priority,
      hasMedia: data.hasMedia,
      debounceMs: CHAT_DEBOUNCE_MS,
    },
    "Message enqueued"
  );

  return job;
}

/**
 * Obtém estatísticas da fila
 */
export async function getQueueStats(): Promise<{
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
  paused: number;
}> {
  const queue = getMessageQueue();

  const [waiting, active, completed, failed, delayed, paused] = await Promise.all([
    queue.getWaitingCount(),
    queue.getActiveCount(),
    queue.getCompletedCount(),
    queue.getFailedCount(),
    queue.getDelayedCount(),
    queue.isPaused().then((p) => (p ? 1 : 0)),
  ]);

  return {
    waiting,
    active,
    completed,
    failed,
    delayed,
    paused,
  };
}

/**
 * Obtém jobs ativos de um chat específico
 */
export async function getChatActiveJobs(
  chatId: string
): Promise<Job<MessageJobData, MessageJobResult>[]> {
  const queue = getMessageQueue();
  const activeJobs = await queue.getActive();

  return activeJobs.filter((job) => job.data.chatId === chatId);
}

/**
 * Pausa a fila (útil para manutenção)
 */
export async function pauseQueue(): Promise<void> {
  const queue = getMessageQueue();
  await queue.pause();
  logger.warn("Message queue paused");
}

/**
 * Resume a fila
 */
export async function resumeQueue(): Promise<void> {
  const queue = getMessageQueue();
  await queue.resume();
  logger.info("Message queue resumed");
}

/**
 * Remove um job específico
 */
export async function removeJob(jobId: string): Promise<boolean> {
  const queue = getMessageQueue();
  const job = await queue.getJob(jobId);

  if (job) {
    await job.remove();
    logger.info({ jobId }, "Job removed");
    return true;
  }

  return false;
}

/**
 * Limpa todos os jobs (útil para testes)
 */
export async function clearQueue(): Promise<void> {
  const queue = getMessageQueue();
  await queue.obliterate({ force: true });
  logger.warn("Message queue cleared");
}

/**
 * Fecha conexões (cleanup)
 */
export async function closeQueue(): Promise<void> {
  if (queueEvents) {
    await queueEvents.close();
    queueEvents = null;
  }

  if (messageQueue) {
    await messageQueue.close();
    messageQueue = null;
  }

  logger.info("Message queue connections closed");
}

// Tipos úteis para o worker
export type { Job };
