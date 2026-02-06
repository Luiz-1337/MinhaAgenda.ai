/**
 * Cliente Redis para cache, idempotência e locks distribuídos
 * 
 * Usado pelo webhook do WhatsApp para:
 * - Verificar e marcar mensagens como processadas (idempotência)
 * - Adquirir/liberar locks distribuídos por chat
 * - Rate limiting por telefone
 */

import { Redis } from "ioredis";
import { logger } from "../lib/logger";

// Singleton do cliente Redis
let redis: Redis | null = null;

/**
 * Obtém ou cria uma instância do cliente Redis
 */
export function getRedisClient(): Redis {
  if (redis) {
    return redis;
  }

  const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";

  redis = new Redis(redisUrl, {
    maxRetriesPerRequest: 3,
    retryStrategy(times) {
      const delay = Math.min(times * 100, 3000);
      logger.warn({ times, delay }, "Redis connection retry");
      return delay;
    },
    reconnectOnError(err) {
      const targetErrors = ["READONLY", "ECONNRESET", "ETIMEDOUT"];
      return targetErrors.some((e) => err.message.includes(e));
    },
  });

  redis.on("error", (err) => {
    logger.error({ err }, "Redis client error");
  });

  redis.on("connect", () => {
    logger.info("Redis client connected");
  });

  redis.on("ready", () => {
    logger.info("Redis client ready");
  });

  return redis;
}

/**
 * Cria uma nova instância do cliente Redis para BullMQ
 * BullMQ requer maxRetriesPerRequest: null para operações blocking
 */
export function createRedisClientForBullMQ(): Redis {
  const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";

  const client = new Redis(redisUrl, {
    maxRetriesPerRequest: null, // Requerido pelo BullMQ
    enableReadyCheck: false,
    retryStrategy(times) {
      const delay = Math.min(times * 100, 3000);
      logger.warn({ times, delay }, "BullMQ Redis connection retry");
      return delay;
    },
    reconnectOnError(err) {
      const targetErrors = ["READONLY", "ECONNRESET", "ETIMEDOUT"];
      return targetErrors.some((e) => err.message.includes(e));
    },
  });

  client.on("error", (err) => {
    logger.error({ err }, "BullMQ Redis client error");
  });

  client.on("connect", () => {
    logger.info("BullMQ Redis client connected");
  });

  return client;
}

// Keys prefixes
const KEYS = {
  PROCESSED_MESSAGE: "twilio:processed:",
  LOCK: "lock:",
  RATE_LIMIT: "rate:",
  LID_MAPPING: "lid:mapping:",
} as const;

/**
 * Verifica se uma mensagem já foi processada (idempotência)
 * @param messageId - ID da mensagem do Twilio (MessageSid)
 * @returns true se a mensagem já foi processada
 */
export async function isMessageProcessed(messageId: string): Promise<boolean> {
  const client = getRedisClient();
  const key = `${KEYS.PROCESSED_MESSAGE}${messageId}`;
  const exists = await client.exists(key);
  return exists === 1;
}

/**
 * Marca uma mensagem como processada
 * @param messageId - ID da mensagem do Twilio (MessageSid)
 * @param ttl - Tempo de vida em segundos (padrão: 24 horas)
 */
export async function markMessageProcessed(
  messageId: string,
  ttl = 86400
): Promise<void> {
  const client = getRedisClient();
  const key = `${KEYS.PROCESSED_MESSAGE}${messageId}`;
  await client.setex(key, ttl, new Date().toISOString());
}

/**
 * Tenta adquirir um lock distribuído
 * @param resource - Nome do recurso a ser bloqueado (ex: "chat:uuid-do-chat")
 * @param ttl - Tempo de vida do lock em milissegundos (padrão: 30 segundos)
 * @returns ID do lock se adquirido com sucesso, null caso contrário
 */
export async function acquireLock(
  resource: string,
  ttl = 30000
): Promise<string | null> {
  const client = getRedisClient();
  const lockId = `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
  const key = `${KEYS.LOCK}${resource}`;

  // SET key value PX ttl NX - só define se não existir
  const result = await client.set(key, lockId, "PX", ttl, "NX");

  if (result === "OK") {
    logger.debug({ resource, lockId, ttl }, "Lock acquired");
    return lockId;
  }

  logger.debug({ resource }, "Failed to acquire lock");
  return null;
}

/**
 * Libera um lock distribuído
 * @param resource - Nome do recurso bloqueado
 * @param lockId - ID do lock retornado por acquireLock
 */
export async function releaseLock(
  resource: string,
  lockId: string
): Promise<void> {
  const client = getRedisClient();
  const key = `${KEYS.LOCK}${resource}`;

  // Script Lua para garantir atomicidade: só deleta se o valor for igual ao lockId
  const script = `
    if redis.call("get", KEYS[1]) == ARGV[1] then
      return redis.call("del", KEYS[1])
    else
      return 0
    end
  `;

  const result = await client.eval(script, 1, key, lockId);

  if (result === 1) {
    logger.debug({ resource, lockId }, "Lock released");
  } else {
    logger.warn({ resource, lockId }, "Lock release failed (not owner or expired)");
  }
}

/**
 * Tenta estender o TTL de um lock existente
 * @param resource - Nome do recurso bloqueado
 * @param lockId - ID do lock
 * @param ttl - Novo TTL em milissegundos
 * @returns true se o lock foi estendido, false caso contrário
 */
export async function extendLock(
  resource: string,
  lockId: string,
  ttl: number
): Promise<boolean> {
  const client = getRedisClient();
  const key = `${KEYS.LOCK}${resource}`;

  // Script Lua para garantir atomicidade: só estende se o valor for igual ao lockId
  const script = `
    if redis.call("get", KEYS[1]) == ARGV[1] then
      return redis.call("pexpire", KEYS[1], ARGV[2])
    else
      return 0
    end
  `;

  const result = await client.eval(script, 1, key, lockId, ttl);
  return result === 1;
}

/**
 * Incrementa contador de rate limit
 * @param identifier - Identificador único (ex: telefone normalizado)
 * @param limit - Limite máximo de requisições
 * @param windowSeconds - Janela de tempo em segundos
 * @returns Objeto com informações do rate limit
 */
export async function checkRateLimit(
  identifier: string,
  limit: number,
  windowSeconds: number
): Promise<{
  allowed: boolean;
  current: number;
  limit: number;
  remaining: number;
  resetIn: number;
}> {
  const client = getRedisClient();
  const key = `${KEYS.RATE_LIMIT}${identifier}`;

  const current = await client.incr(key);

  // Define TTL apenas na primeira requisição
  if (current === 1) {
    await client.expire(key, windowSeconds);
  }

  const ttl = await client.ttl(key);
  const resetIn = ttl > 0 ? ttl : windowSeconds;

  const allowed = current <= limit;
  const remaining = Math.max(0, limit - current);

  if (!allowed) {
    logger.warn(
      { identifier: hashPhone(identifier), current, limit, resetIn },
      "Rate limit exceeded"
    );
  }

  return {
    allowed,
    current,
    limit,
    remaining,
    resetIn,
  };
}

/**
 * Obtém informações atuais do rate limit sem incrementar
 * @param identifier - Identificador único
 * @param limit - Limite máximo de requisições
 */
export async function getRateLimitInfo(
  identifier: string,
  limit: number
): Promise<{
  current: number;
  limit: number;
  remaining: number;
  resetIn: number;
}> {
  const client = getRedisClient();
  const key = `${KEYS.RATE_LIMIT}${identifier}`;

  const currentStr = await client.get(key);
  const current = currentStr ? parseInt(currentStr, 10) : 0;
  const ttl = await client.ttl(key);
  const resetIn = ttl > 0 ? ttl : 60;

  return {
    current,
    limit,
    remaining: Math.max(0, limit - current),
    resetIn,
  };
}

/**
 * Reseta o rate limit de um identificador (útil para testes)
 * @param identifier - Identificador único
 */
export async function resetRateLimit(identifier: string): Promise<void> {
  const client = getRedisClient();
  const key = `${KEYS.RATE_LIMIT}${identifier}`;
  await client.del(key);
}

/**
 * Fecha a conexão Redis (útil para cleanup em testes)
 */
export async function closeRedisConnection(): Promise<void> {
  if (redis) {
    await redis.quit();
    redis = null;
    logger.info("Redis connection closed");
  }
}

/**
 * Hash de telefone para logs (sanitização de PII)
 */
function hashPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 8) return "***";
  return `${digits.slice(0, 4)}***${digits.slice(-4)}`;
}

// Exporta o cliente para casos de uso avançados
export { getRedisClient as redis };

// ===== LID MAPPING (WhatsApp Business LID to Phone) =====

/**
 * LID mapping TTL: 30 days
 * LID mappings são relativamente estáveis, mas podem mudar se o cliente trocar de número
 */
const LID_MAPPING_TTL = 60 * 60 * 24 * 30; // 30 dias

/**
 * Armazena um mapeamento LID → número de telefone
 * @param lid - LID do WhatsApp (ex: "123463247351852")
 * @param phoneJid - JID com número real (ex: "5511993989330@s.whatsapp.net")
 * @param instanceName - Nome da instância Evolution (para namespacing)
 */
export async function storeLidMapping(
  lid: string,
  phoneJid: string,
  instanceName: string
): Promise<void> {
  const client = getRedisClient();
  const key = `${KEYS.LID_MAPPING}${instanceName}:${lid}`;
  await client.set(key, phoneJid, "EX", LID_MAPPING_TTL);
  logger.info({ lid: hashPhone(lid), phone: hashPhone(phoneJid), instanceName }, "LID mapping stored");
}

/**
 * Busca o número real a partir de um LID
 * @param lid - LID do WhatsApp (ex: "123463247351852")
 * @param instanceName - Nome da instância Evolution
 * @returns JID com número real ou null se não encontrado
 */
export async function resolveLidToPhone(
  lid: string,
  instanceName: string
): Promise<string | null> {
  const client = getRedisClient();
  const key = `${KEYS.LID_MAPPING}${instanceName}:${lid}`;
  const phoneJid = await client.get(key);

  if (phoneJid) {
    logger.debug({ lid: hashPhone(lid), phone: hashPhone(phoneJid) }, "LID mapping found");
  }

  return phoneJid;
}

/**
 * Define um mapeamento LID → número manualmente (útil para correções)
 * @param lid - LID do WhatsApp (ex: "123463247351852")
 * @param phone - Número de telefone (ex: "5511993989330")
 * @param instanceName - Nome da instância Evolution
 */
export async function setManualLidMapping(
  lid: string,
  phone: string,
  instanceName: string
): Promise<void> {
  // Garante formato JID
  const phoneJid = phone.includes("@") ? phone : `${phone}@s.whatsapp.net`;
  await storeLidMapping(lid, phoneJid, instanceName);
}

/**
 * Remove um mapeamento LID
 * @param lid - LID do WhatsApp
 * @param instanceName - Nome da instância Evolution
 */
export async function removeLidMapping(
  lid: string,
  instanceName: string
): Promise<void> {
  const client = getRedisClient();
  const key = `${KEYS.LID_MAPPING}${instanceName}:${lid}`;
  await client.del(key);
  logger.info({ lid: hashPhone(lid), instanceName }, "LID mapping removed");
}
