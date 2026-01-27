/**
 * Health Check Endpoint para o Webhook do WhatsApp
 * 
 * Verifica:
 * - Conectividade com Redis
 * - Status da fila BullMQ
 * - Conectividade com Database
 * - Status dos Circuit Breakers
 * - Métricas básicas
 */

import { NextRequest, NextResponse } from "next/server";
import { getRedisClient } from "@/lib/redis";
import { getQueueStats } from "@/lib/queues/message-queue";
import { getMetricsSummary } from "@/lib/metrics";
import { getAllCircuitBreakersStatus } from "@/lib/circuit-breaker";
import { logger } from "@/lib/logger";
import { db } from "@repo/db";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface HealthStatus {
  status: "healthy" | "degraded" | "unhealthy";
  timestamp: string;
  uptime: number;
  checks: {
    redis: HealthCheck;
    queue: HealthCheck;
    database: HealthCheck;
  };
  circuitBreakers?: Record<string, unknown>;
  metrics?: Record<string, unknown>;
}

interface HealthCheck {
  status: "pass" | "fail" | "warn";
  latencyMs?: number;
  message?: string;
  details?: Record<string, unknown>;
}

// Tempo de início para calcular uptime
const startTime = Date.now();

/**
 * GET /api/webhook/whatsapp/health
 * 
 * Retorna status de saúde do sistema
 */
export async function GET(req: NextRequest): Promise<NextResponse<HealthStatus>> {
  const includeMetrics = req.nextUrl.searchParams.get("metrics") === "true";
  const includeCircuitBreakers = req.nextUrl.searchParams.get("circuit_breakers") === "true";
  
  const checks = await Promise.all([
    checkRedis(),
    checkQueue(),
    checkDatabase(),
  ]);

  const [redisCheck, queueCheck, dbCheck] = checks;

  // Determina status geral
  let overallStatus: "healthy" | "degraded" | "unhealthy" = "healthy";
  
  // Database e Redis são críticos
  if (redisCheck.status === "fail" || queueCheck.status === "fail" || dbCheck.status === "fail") {
    overallStatus = "unhealthy";
  } else if (redisCheck.status === "warn" || queueCheck.status === "warn" || dbCheck.status === "warn") {
    overallStatus = "degraded";
  }

  const response: HealthStatus = {
    status: overallStatus,
    timestamp: new Date().toISOString(),
    uptime: Math.floor((Date.now() - startTime) / 1000),
    checks: {
      redis: redisCheck,
      queue: queueCheck,
      database: dbCheck,
    },
  };

  // Inclui status dos circuit breakers se solicitado
  if (includeCircuitBreakers) {
    try {
      response.circuitBreakers = getAllCircuitBreakersStatus();
    } catch (error) {
      logger.warn({ err: error }, "Failed to get circuit breakers status");
    }
  }

  // Inclui métricas se solicitado
  if (includeMetrics) {
    try {
      response.metrics = await getMetricsSummary();
    } catch (error) {
      logger.warn({ err: error }, "Failed to get metrics summary");
    }
  }

  // Define status HTTP baseado na saúde
  const httpStatus = overallStatus === "unhealthy" ? 503 : 200;

  return NextResponse.json(response, { status: httpStatus });
}

/**
 * Verifica conectividade com Redis
 */
async function checkRedis(): Promise<HealthCheck> {
  const start = Date.now();
  
  try {
    const redis = getRedisClient();
    
    // Testa conexão com PING
    const pong = await Promise.race([
      redis.ping(),
      new Promise<null>((_, reject) => 
        setTimeout(() => reject(new Error("Redis PING timeout")), 2000)
      ),
    ]);

    const latencyMs = Date.now() - start;

    if (pong !== "PONG") {
      return {
        status: "fail",
        latencyMs,
        message: "Unexpected PING response",
      };
    }

    // Verifica se a latência está aceitável
    if (latencyMs > 100) {
      return {
        status: "warn",
        latencyMs,
        message: "High latency detected",
      };
    }

    return {
      status: "pass",
      latencyMs,
    };
  } catch (error) {
    return {
      status: "fail",
      latencyMs: Date.now() - start,
      message: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Verifica status da fila BullMQ
 */
async function checkQueue(): Promise<HealthCheck> {
  const start = Date.now();
  
  try {
    const stats = await Promise.race([
      getQueueStats(),
      new Promise<null>((_, reject) => 
        setTimeout(() => reject(new Error("Queue stats timeout")), 2000)
      ),
    ]);

    const latencyMs = Date.now() - start;

    if (!stats) {
      return {
        status: "fail",
        latencyMs,
        message: "Failed to get queue stats",
      };
    }

    // Verifica condições de alerta
    const warnings: string[] = [];

    // Muitos jobs aguardando
    if (stats.waiting > 100) {
      warnings.push(`High queue depth: ${stats.waiting} waiting`);
    }

    // Muitos jobs falhos
    if (stats.failed > 50) {
      warnings.push(`High failure rate: ${stats.failed} failed`);
    }

    // Fila pausada
    if (stats.paused > 0) {
      warnings.push("Queue is paused");
    }

    if (warnings.length > 0) {
      return {
        status: "warn",
        latencyMs,
        message: warnings.join("; "),
        details: stats,
      };
    }

    return {
      status: "pass",
      latencyMs,
      details: stats,
    };
  } catch (error) {
    return {
      status: "fail",
      latencyMs: Date.now() - start,
      message: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Verifica conectividade com o Database (PostgreSQL)
 */
async function checkDatabase(): Promise<HealthCheck> {
  const start = Date.now();

  try {
    // Executa query simples com timeout
    const result = await Promise.race([
      db.execute(sql`SELECT 1 as health_check`),
      new Promise<null>((_, reject) =>
        setTimeout(() => reject(new Error("Database health check timeout")), 3000)
      ),
    ]);

    const latencyMs = Date.now() - start;

    if (!result) {
      return {
        status: "fail",
        latencyMs,
        message: "Database query returned null",
      };
    }

    // Verifica se a latência está aceitável
    if (latencyMs > 500) {
      return {
        status: "warn",
        latencyMs,
        message: "High database latency detected",
      };
    }

    return {
      status: "pass",
      latencyMs,
    };
  } catch (error) {
    return {
      status: "fail",
      latencyMs: Date.now() - start,
      message: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * HEAD /api/webhook/whatsapp/health
 * 
 * Verificação rápida (apenas status)
 */
export async function HEAD(): Promise<Response> {
  try {
    const redis = getRedisClient();
    await Promise.race([
      redis.ping(),
      new Promise<null>((_, reject) => 
        setTimeout(() => reject(new Error("timeout")), 1000)
      ),
    ]);
    
    return new Response(null, { status: 200 });
  } catch {
    return new Response(null, { status: 503 });
  }
}
