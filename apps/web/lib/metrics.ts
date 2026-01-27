/**
 * Sistema de métricas simples para observabilidade
 * 
 * Em produção, pode ser integrado com:
 * - Prometheus
 * - DataDog
 * - New Relic
 * - CloudWatch
 */

import { logger } from "./logger";
import { getRedisClient } from "./redis";

// Tipos de métricas
export type MetricType = "counter" | "gauge" | "histogram";

// Interface para métricas
export interface Metric {
  name: string;
  type: MetricType;
  value: number;
  tags?: Record<string, string>;
  timestamp: number;
}

// Buffer de métricas em memória
const metricsBuffer: Metric[] = [];
const MAX_BUFFER_SIZE = 1000;

// Prefixo Redis para métricas
const METRICS_PREFIX = "metrics:";

/**
 * Registra uma métrica de contador (incrementa)
 */
export function incrementCounter(
  name: string,
  value = 1,
  tags?: Record<string, string>
): void {
  recordMetric(name, value, "counter", tags);
}

/**
 * Registra uma métrica de gauge (valor absoluto)
 */
export function setGauge(
  name: string,
  value: number,
  tags?: Record<string, string>
): void {
  recordMetric(name, value, "gauge", tags);
}

/**
 * Registra uma métrica de histograma (latência, etc.)
 */
export function recordHistogram(
  name: string,
  value: number,
  tags?: Record<string, string>
): void {
  recordMetric(name, value, "histogram", tags);
}

/**
 * Registra uma métrica genérica
 */
function recordMetric(
  name: string,
  value: number,
  type: MetricType,
  tags?: Record<string, string>
): void {
  const metric: Metric = {
    name,
    type,
    value,
    tags,
    timestamp: Date.now(),
  };

  // Log estruturado
  logger.debug(
    { metric: name, value, type, tags },
    "Metric recorded"
  );

  // Adiciona ao buffer
  metricsBuffer.push(metric);

  // Limpa buffer se muito grande
  if (metricsBuffer.length > MAX_BUFFER_SIZE) {
    metricsBuffer.splice(0, metricsBuffer.length - MAX_BUFFER_SIZE);
  }

  // Persiste no Redis de forma assíncrona (fire-and-forget)
  persistMetricToRedis(metric).catch((err) => {
    logger.warn({ err, metric: name }, "Failed to persist metric to Redis");
  });
}

/**
 * Persiste métrica no Redis
 */
async function persistMetricToRedis(metric: Metric): Promise<void> {
  try {
    const redis = getRedisClient();
    const key = `${METRICS_PREFIX}${metric.name}`;
    const tagKey = metric.tags ? `:${Object.entries(metric.tags).map(([k, v]) => `${k}=${v}`).join(",")}` : "";
    const fullKey = `${key}${tagKey}`;

    switch (metric.type) {
      case "counter":
        await redis.incrbyfloat(fullKey, metric.value);
        break;
      case "gauge":
        await redis.set(fullKey, metric.value.toString());
        break;
      case "histogram":
        // Para histograma, armazena em uma lista para calcular percentis depois
        await redis.lpush(`${fullKey}:values`, metric.value.toString());
        await redis.ltrim(`${fullKey}:values`, 0, 999); // Mantém últimos 1000
        break;
    }

    // Define TTL de 1 hora para métricas
    await redis.expire(fullKey, 3600);
  } catch {
    // Silencia erros de Redis para não afetar a operação principal
  }
}

/**
 * Helper para medir latência de uma operação
 */
export function measureLatency(
  name: string,
  tags?: Record<string, string>
): () => void {
  const start = Date.now();

  return () => {
    const duration = Date.now() - start;
    recordHistogram(`${name}.latency`, duration, tags);
  };
}

/**
 * Decorator para medir latência de funções
 */
export function withMetrics<T extends (...args: unknown[]) => Promise<unknown>>(
  name: string,
  fn: T,
  tags?: Record<string, string>
): T {
  return (async (...args: Parameters<T>) => {
    const endMeasure = measureLatency(name, tags);
    try {
      const result = await fn(...args);
      incrementCounter(`${name}.success`, 1, tags);
      return result;
    } catch (error) {
      incrementCounter(`${name}.error`, 1, tags);
      throw error;
    } finally {
      endMeasure();
    }
  }) as T;
}

/**
 * Obtém métricas do buffer (para debug/health check)
 */
export function getBufferedMetrics(): Metric[] {
  return [...metricsBuffer];
}

/**
 * Obtém estatísticas resumidas das métricas
 */
export async function getMetricsSummary(): Promise<Record<string, unknown>> {
  try {
    const redis = getRedisClient();
    
    // Busca todas as chaves de métricas
    const keys = await redis.keys(`${METRICS_PREFIX}*`);
    
    const summary: Record<string, unknown> = {};
    
    for (const key of keys) {
      const shortKey = key.replace(METRICS_PREFIX, "");
      const type = await redis.type(key);
      
      if (type === "string") {
        summary[shortKey] = await redis.get(key);
      } else if (type === "list") {
        const values = await redis.lrange(key, 0, -1);
        const numValues = values.map(Number);
        summary[shortKey] = {
          count: numValues.length,
          avg: numValues.reduce((a, b) => a + b, 0) / numValues.length,
          min: Math.min(...numValues),
          max: Math.max(...numValues),
          p50: percentile(numValues, 50),
          p95: percentile(numValues, 95),
          p99: percentile(numValues, 99),
        };
      }
    }
    
    return summary;
  } catch (error) {
    logger.warn({ err: error }, "Failed to get metrics summary");
    return {};
  }
}

/**
 * Calcula percentil
 */
function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, index)];
}

// Métricas pré-definidas para o webhook
export const WebhookMetrics = {
  received: (tags?: Record<string, string>) => 
    incrementCounter("webhook.received", 1, tags),
  
  enqueued: (tags?: Record<string, string>) => 
    incrementCounter("webhook.enqueued", 1, tags),
  
  duplicate: (tags?: Record<string, string>) => 
    incrementCounter("webhook.duplicate", 1, tags),
  
  rateLimited: (tags?: Record<string, string>) => 
    incrementCounter("webhook.rate_limited", 1, tags),
  
  error: (errorCode: string, tags?: Record<string, string>) => 
    incrementCounter("webhook.error", 1, { ...tags, error_code: errorCode }),
  
  latency: (durationMs: number, tags?: Record<string, string>) => 
    recordHistogram("webhook.latency", durationMs, tags),
};

export const WorkerMetrics = {
  processed: (status: string, tags?: Record<string, string>) => 
    incrementCounter("worker.processed", 1, { ...tags, status }),
  
  aiTokens: (tokens: number, tags?: Record<string, string>) => 
    incrementCounter("worker.ai_tokens", tokens, tags),
  
  latency: (durationMs: number, tags?: Record<string, string>) => 
    recordHistogram("worker.latency", durationMs, tags),
  
  queueSize: (size: number) => 
    setGauge("worker.queue_size", size),
};
