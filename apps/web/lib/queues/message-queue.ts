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
import { getRedisClient } from "../redis";
import { logger } from "../logger";

/**
 * Dados do job de processamento de mensagem
 */
export interface MessageJobData {
  // Identificadores
  messageId: string; // MessageSid do Twilio
  chatId: string;
  salonId: string;
  agentId: string; // ID do agente que receberá a mensagem
  customerId: string;
  clientPhone: string;

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
  status: "success" | "manual_mode" | "media_handled" | "rate_limited" | "error";
  chatId: string;
  messageId: string;
  responseText?: string;
  tokensUsed?: number;
  duration?: number;
  error?: string;
}

// Nome da fila
const QUEUE_NAME = "whatsapp-messages";

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

  // Prioridade: texto (1) > mídia (2)
  // Menor número = maior prioridade
  const priority = data.hasMedia ? 2 : 1;

  const job = await queue.add("process-message", data, {
    jobId: data.messageId, // Garante unicidade (idempotência)
    priority,
    // Dados para agrupamento (jobs do mesmo chat processados em ordem)
    // Nota: BullMQ não tem groups nativamente, usamos isso para logging
  });

  logger.info(
    {
      jobId: job.id,
      messageId: data.messageId,
      chatId: data.chatId,
      priority,
      hasMedia: data.hasMedia,
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
