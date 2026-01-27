/**
 * Sistema de Rate Limiting usando Redis
 * 
 * Implementa rate limiting por:
 * - Telefone do cliente (padrão: 10 mensagens por minuto)
 * - Salão (padrão: 100 mensagens por minuto)
 * - IP (para proteção contra abuso)
 */

import { checkRateLimit, getRateLimitInfo, resetRateLimit } from "./redis";
import { logger, hashPhone } from "./logger";
import { RateLimitError } from "./errors";

// Configurações padrão
const DEFAULT_CONFIG = {
  // Rate limit por telefone do cliente
  PHONE_LIMIT: parseInt(process.env.RATE_LIMIT_MESSAGES_PER_MINUTE || "10", 10),
  PHONE_WINDOW: 60, // 1 minuto

  // Rate limit por salão
  SALON_LIMIT: parseInt(process.env.RATE_LIMIT_SALON_PER_MINUTE || "100", 10),
  SALON_WINDOW: 60, // 1 minuto

  // Rate limit por IP (proteção contra abuso)
  IP_LIMIT: parseInt(process.env.RATE_LIMIT_IP_PER_MINUTE || "60", 10),
  IP_WINDOW: 60, // 1 minuto

  // Rate limit global (emergência)
  GLOBAL_LIMIT: parseInt(process.env.RATE_LIMIT_GLOBAL_PER_MINUTE || "1000", 10),
  GLOBAL_WINDOW: 60, // 1 minuto
} as const;

/**
 * Resultado da verificação de rate limit
 */
export interface RateLimitResult {
  allowed: boolean;
  current: number;
  limit: number;
  remaining: number;
  resetIn: number;
  identifier: string;
  type: "phone" | "salon" | "ip" | "global";
}

/**
 * Verifica rate limit por telefone do cliente
 * @throws RateLimitError se o limite for excedido
 */
export async function checkPhoneRateLimit(phone: string): Promise<RateLimitResult> {
  const identifier = normalizePhone(phone);
  const key = `phone:${identifier}`;

  const result = await checkRateLimit(
    key,
    DEFAULT_CONFIG.PHONE_LIMIT,
    DEFAULT_CONFIG.PHONE_WINDOW
  );

  const rateLimitResult: RateLimitResult = {
    ...result,
    identifier: hashPhone(identifier),
    type: "phone",
  };

  if (!result.allowed) {
    logger.warn(
      {
        phone: hashPhone(identifier),
        current: result.current,
        limit: result.limit,
        resetIn: result.resetIn,
      },
      "Phone rate limit exceeded"
    );

    throw new RateLimitError(result.resetIn, {
      phone: hashPhone(identifier),
      type: "phone",
    });
  }

  return rateLimitResult;
}

/**
 * Verifica rate limit por salão
 * @throws RateLimitError se o limite for excedido
 */
export async function checkSalonRateLimit(salonId: string): Promise<RateLimitResult> {
  const key = `salon:${salonId}`;

  const result = await checkRateLimit(
    key,
    DEFAULT_CONFIG.SALON_LIMIT,
    DEFAULT_CONFIG.SALON_WINDOW
  );

  const rateLimitResult: RateLimitResult = {
    ...result,
    identifier: salonId.slice(0, 8), // Mostra apenas início do UUID
    type: "salon",
  };

  if (!result.allowed) {
    logger.warn(
      {
        salonId: salonId.slice(0, 8),
        current: result.current,
        limit: result.limit,
        resetIn: result.resetIn,
      },
      "Salon rate limit exceeded"
    );

    throw new RateLimitError(result.resetIn, {
      salonId: salonId.slice(0, 8),
      type: "salon",
    });
  }

  return rateLimitResult;
}

/**
 * Verifica rate limit por IP
 * @throws RateLimitError se o limite for excedido
 */
export async function checkIpRateLimit(ip: string): Promise<RateLimitResult> {
  const key = `ip:${ip}`;

  const result = await checkRateLimit(
    key,
    DEFAULT_CONFIG.IP_LIMIT,
    DEFAULT_CONFIG.IP_WINDOW
  );

  const rateLimitResult: RateLimitResult = {
    ...result,
    identifier: maskIp(ip),
    type: "ip",
  };

  if (!result.allowed) {
    logger.warn(
      {
        ip: maskIp(ip),
        current: result.current,
        limit: result.limit,
        resetIn: result.resetIn,
      },
      "IP rate limit exceeded"
    );

    throw new RateLimitError(result.resetIn, {
      ip: maskIp(ip),
      type: "ip",
    });
  }

  return rateLimitResult;
}

/**
 * Verifica rate limit global (todas as requisições)
 * @throws RateLimitError se o limite for excedido
 */
export async function checkGlobalRateLimit(): Promise<RateLimitResult> {
  const key = "global";

  const result = await checkRateLimit(
    key,
    DEFAULT_CONFIG.GLOBAL_LIMIT,
    DEFAULT_CONFIG.GLOBAL_WINDOW
  );

  const rateLimitResult: RateLimitResult = {
    ...result,
    identifier: "global",
    type: "global",
  };

  if (!result.allowed) {
    logger.error(
      {
        current: result.current,
        limit: result.limit,
        resetIn: result.resetIn,
      },
      "GLOBAL rate limit exceeded - system under heavy load"
    );

    throw new RateLimitError(result.resetIn, { type: "global" });
  }

  return rateLimitResult;
}

/**
 * Verifica todos os rate limits aplicáveis
 * @param phone - Telefone do cliente
 * @param salonId - ID do salão
 * @param ip - IP da requisição (opcional)
 * @throws RateLimitError se qualquer limite for excedido
 */
export async function checkAllRateLimits(
  phone: string,
  salonId: string,
  ip?: string
): Promise<{
  phone: RateLimitResult;
  salon: RateLimitResult;
  ip?: RateLimitResult;
}> {
  // Verifica em paralelo para performance
  const checks = [
    checkPhoneRateLimit(phone),
    checkSalonRateLimit(salonId),
  ];

  if (ip) {
    checks.push(checkIpRateLimit(ip));
  }

  const results = await Promise.all(checks);

  return {
    phone: results[0],
    salon: results[1],
    ip: results[2],
  };
}

/**
 * Obtém informações de rate limit sem incrementar contador
 */
export async function getPhoneRateLimitInfo(phone: string): Promise<RateLimitResult> {
  const identifier = normalizePhone(phone);
  const key = `phone:${identifier}`;

  const result = await getRateLimitInfo(key, DEFAULT_CONFIG.PHONE_LIMIT);

  return {
    ...result,
    allowed: result.current < result.limit,
    identifier: hashPhone(identifier),
    type: "phone",
  };
}

/**
 * Reseta rate limit de um telefone (útil para testes/admin)
 */
export async function resetPhoneRateLimit(phone: string): Promise<void> {
  const identifier = normalizePhone(phone);
  const key = `phone:${identifier}`;
  await resetRateLimit(key);
  logger.info({ phone: hashPhone(identifier) }, "Phone rate limit reset");
}

/**
 * Reseta rate limit de um salão (útil para testes/admin)
 */
export async function resetSalonRateLimit(salonId: string): Promise<void> {
  const key = `salon:${salonId}`;
  await resetRateLimit(key);
  logger.info({ salonId: salonId.slice(0, 8) }, "Salon rate limit reset");
}

// Helpers

/**
 * Normaliza telefone para uso como chave
 */
function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, "");
}

/**
 * Mascara IP para logging
 */
function maskIp(ip: string): string {
  // IPv4: mostra apenas os dois primeiros octetos
  if (ip.includes(".")) {
    const parts = ip.split(".");
    return `${parts[0]}.${parts[1]}.*.*`;
  }

  // IPv6: mostra apenas os primeiros 4 grupos
  if (ip.includes(":")) {
    const parts = ip.split(":");
    return `${parts.slice(0, 4).join(":")}:*`;
  }

  return "***";
}

// Re-exporta configurações para uso em testes
export const RATE_LIMIT_CONFIG = DEFAULT_CONFIG;
