/**
 * Utilitários para operações assíncronas
 * 
 * Inclui:
 * - withTimeout: executa promise com timeout
 * - retry: executa função com retry automático
 * - sleep: aguarda um tempo determinado
 */

import { logger } from "../logger";

/**
 * Erro de timeout
 */
export class TimeoutError extends Error {
  constructor(
    operation: string,
    timeoutMs: number
  ) {
    super(`Operation "${operation}" timed out after ${timeoutMs}ms`);
    this.name = "TimeoutError";
  }
}

/**
 * Executa uma promise com timeout
 * @param promise - Promise a ser executada
 * @param timeoutMs - Timeout em milissegundos
 * @param operationName - Nome da operação (para logs)
 * @throws TimeoutError se a operação exceder o timeout
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  operationName = "unknown"
): Promise<T> {
  let timeoutId: NodeJS.Timeout;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new TimeoutError(operationName, timeoutMs));
    }, timeoutMs);
  });

  try {
    const result = await Promise.race([promise, timeoutPromise]);
    clearTimeout(timeoutId!);
    return result;
  } catch (error) {
    clearTimeout(timeoutId!);
    throw error;
  }
}

/**
 * Opções para retry
 */
export interface RetryOptions {
  /** Número máximo de tentativas (padrão: 3) */
  maxAttempts?: number;
  /** Delay inicial em ms (padrão: 1000) */
  initialDelayMs?: number;
  /** Fator de multiplicação do delay (padrão: 2) */
  backoffFactor?: number;
  /** Delay máximo em ms (padrão: 30000) */
  maxDelayMs?: number;
  /** Função para determinar se deve fazer retry */
  shouldRetry?: (error: unknown, attempt: number) => boolean;
  /** Nome da operação (para logs) */
  operationName?: string;
}

/**
 * Executa uma função com retry automático e backoff exponencial
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxAttempts = 3,
    initialDelayMs = 1000,
    backoffFactor = 2,
    maxDelayMs = 30000,
    shouldRetry = () => true,
    operationName = "unknown",
  } = options;

  let lastError: unknown;
  let delayMs = initialDelayMs;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (attempt >= maxAttempts || !shouldRetry(error, attempt)) {
        logger.error(
          { 
            operationName, 
            attempt, 
            maxAttempts,
            error: error instanceof Error ? error.message : String(error),
          },
          "Operation failed after retries"
        );
        throw error;
      }

      logger.warn(
        { operationName, attempt, delayMs },
        "Operation failed, retrying"
      );

      await sleep(delayMs);
      delayMs = Math.min(delayMs * backoffFactor, maxDelayMs);
    }
  }

  throw lastError;
}

/**
 * Aguarda um tempo determinado
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Executa múltiplas promises com limite de concorrência
 */
export async function withConcurrencyLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = [];
  const executing: Promise<void>[] = [];

  for (let i = 0; i < items.length; i++) {
    const promise = fn(items[i], i).then((result) => {
      results[i] = result;
    });

    executing.push(promise);

    if (executing.length >= limit) {
      await Promise.race(executing);
      // Remove promises resolvidas
      const resolved = executing.findIndex((p) => 
        Promise.race([p, Promise.resolve("pending")]).then((v) => v !== "pending")
      );
      if (resolved !== -1) {
        executing.splice(resolved, 1);
      }
    }
  }

  await Promise.all(executing);
  return results;
}

/**
 * Debounce para operações assíncronas
 */
export function debounceAsync<T extends (...args: unknown[]) => Promise<unknown>>(
  fn: T,
  waitMs: number
): T {
  let timeoutId: NodeJS.Timeout | null = null;
  let pendingPromise: Promise<unknown> | null = null;

  return ((...args: Parameters<T>) => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }

    return new Promise((resolve, reject) => {
      timeoutId = setTimeout(async () => {
        try {
          pendingPromise = fn(...args);
          const result = await pendingPromise;
          resolve(result);
        } catch (error) {
          reject(error);
        } finally {
          pendingPromise = null;
        }
      }, waitMs);
    });
  }) as T;
}
