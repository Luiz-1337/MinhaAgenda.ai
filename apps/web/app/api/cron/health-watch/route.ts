/**
 * Cron interno de auto-verificação (health-watch).
 *
 * Roda a cada poucos minutos e converte condições de falha em alertas no sistema:
 * - worker sem heartbeat → o worker dedicado (Railway) provavelmente caiu;
 * - fila acumulando (waiting/failed alto) ou pausada.
 *
 * Observação: por viver na mesma infra do app, NÃO detecta uma queda total da
 * Vercel/app. Para isso, um monitor externo apontando para /health é o ideal.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireCronAuth } from "@/lib/services/admin-auth.service";
import { getRedisClient } from "@/lib/infra/redis";
import { getQueueStats } from "@/lib/queues/message-queue";
import { recordAlert, resolveAlert } from "@/lib/services/alerts/alert.service";
import { logger } from "@/lib/infra/logger";
import { db, agents, salons, and, isNotNull, inArray } from "@repo/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const QUEUE_WAITING_ALERT = 100;
const QUEUE_FAILED_ALERT = 50;

export async function GET(request: NextRequest) {
  const authError = requireCronAuth(request.headers);
  if (authError) return authError;

  const findings: Record<string, unknown> = {};

  try {
    // 1. Liveness do worker
    const heartbeat = await getRedisClient().get("worker:heartbeat");
    if (!heartbeat) {
      findings.worker = "down";
      await recordAlert({
        scope: "global",
        type: "worker_down",
        severity: "critical",
        title: "Worker de mensagens sem heartbeat (provavelmente caiu)",
        throttleSeconds: 600,
      });
    } else {
      findings.worker = "alive";
      await resolveAlert("worker_down");
    }

    // 2. Backlog da fila
    const stats = await getQueueStats();
    findings.queue = stats;
    if (stats.waiting > QUEUE_WAITING_ALERT || stats.failed > QUEUE_FAILED_ALERT || stats.paused > 0) {
      await recordAlert({
        scope: "global",
        type: "queue_backlog",
        severity: "warning",
        title: `Fila de mensagens acumulando (waiting=${stats.waiting}, failed=${stats.failed})`,
        detail: stats,
        throttleSeconds: 900,
      });
    } else {
      await resolveAlert("queue_backlog");
    }

    // 3. Instâncias desconectadas (sinal barato via status no banco)
    const DISCONNECTED = ["closed", "disconnected"] as const;
    const [discAgents, discSalons] = await Promise.all([
      db
        .select({ name: agents.evolutionInstanceName })
        .from(agents)
        .where(and(isNotNull(agents.evolutionInstanceName), inArray(agents.evolutionConnectionStatus, DISCONNECTED as unknown as string[]))),
      db
        .select({ name: salons.evolutionInstanceName })
        .from(salons)
        .where(and(isNotNull(salons.evolutionInstanceName), inArray(salons.evolutionConnectionStatus, DISCONNECTED as unknown as string[]))),
    ]);
    const disconnected = Array.from(
      new Set([...discAgents, ...discSalons].map((r) => r.name).filter((n): n is string => !!n))
    );
    findings.disconnectedInstances = disconnected.length;
    if (disconnected.length > 0) {
      await recordAlert({
        scope: "global",
        type: "instances_disconnected",
        severity: "warning",
        title: `${disconnected.length} instância(s) WhatsApp desconectada(s)`,
        detail: { instances: disconnected.slice(0, 50) },
        throttleSeconds: 1800,
      });
    } else {
      await resolveAlert("instances_disconnected");
    }

    return NextResponse.json({ ok: true, findings });
  } catch (error) {
    logger.error({ err: error }, "health-watch cron failed");
    return new NextResponse("health-watch failed", { status: 500 });
  }
}
