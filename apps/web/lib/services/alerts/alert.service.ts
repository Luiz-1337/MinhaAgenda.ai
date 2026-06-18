/**
 * Alertas operacionais exibidos no próprio sistema (tabela system_alerts).
 *
 * Converte falhas hoje silenciosas em eventos duráveis que o painel mostra.
 * recordAlert é throttled por (type + entity) via Redis NX/EX para não criar
 * uma enxurrada de alertas idênticos quando uma condição fica "piscando".
 *
 * Regra de ouro: alertar NUNCA pode lançar erro no caminho de quem chama.
 */

import { db, systemAlerts, and, eq, isNull, desc } from "@repo/db";
import { getRedisClient } from "../../infra/redis";
import { logger } from "../../infra/logger";

export type AlertScope = "global" | "salon";
export type AlertSeverity = "critical" | "warning";

export interface RecordAlertInput {
  scope: AlertScope;
  salonId?: string | null;
  type: string;
  severity: AlertSeverity;
  title: string;
  detail?: Record<string, unknown>;
  /** Janela de throttle em segundos (padrão 1h) — evita alertas repetidos. */
  throttleSeconds?: number;
}

function cooldownKey(type: string, entity: string): string {
  return `alert:cooldown:${type}:${entity}`;
}

/**
 * Grava um alerta operacional (uma vez por janela de throttle por type+entidade).
 */
export async function recordAlert(input: RecordAlertInput): Promise<void> {
  const entity = input.salonId ?? "global";
  const throttle = input.throttleSeconds ?? 3600;
  try {
    const redis = getRedisClient();
    const fresh = await redis.set(cooldownKey(input.type, entity), "1", "EX", throttle, "NX");
    if (fresh === null) return; // já alertado nesta janela

    await db.insert(systemAlerts).values({
      scope: input.scope,
      salonId: input.salonId ?? null,
      type: input.type,
      severity: input.severity,
      title: input.title,
      detail: input.detail ?? null,
    });

    logger.warn(
      { alertType: input.type, scope: input.scope, salonId: input.salonId, severity: input.severity },
      `system alert: ${input.title}`
    );
  } catch (err) {
    logger.error({ err, alertType: input.type }, "Failed to record system alert");
  }
}

/**
 * Fecha (resolve) os alertas abertos de um type+entidade e libera o cooldown,
 * para que um novo alerta possa ser gerado se a condição voltar a falhar.
 */
export async function resolveAlert(type: string, salonId?: string | null): Promise<void> {
  const entity = salonId ?? "global";
  try {
    const redis = getRedisClient();
    await redis.del(cooldownKey(type, entity));

    const salonCond = salonId ? eq(systemAlerts.salonId, salonId) : isNull(systemAlerts.salonId);
    await db
      .update(systemAlerts)
      .set({ status: "resolved", resolvedAt: new Date() })
      .where(and(eq(systemAlerts.type, type), eq(systemAlerts.status, "open"), salonCond));
  } catch (err) {
    logger.error({ err, alertType: type }, "Failed to resolve system alert");
  }
}

/**
 * Marca um alerta específico como resolvido (ação do painel).
 */
export async function resolveAlertById(id: string): Promise<void> {
  await db
    .update(systemAlerts)
    .set({ status: "resolved", resolvedAt: new Date() })
    .where(eq(systemAlerts.id, id));
}

/**
 * Lista alertas abertos. Sem salonId → alertas globais (ops). Com salonId →
 * alertas daquele salão.
 */
export async function listOpenAlerts(opts: { salonId?: string | null; limit?: number } = {}) {
  const limit = opts.limit ?? 50;
  const scopeCond =
    opts.salonId !== undefined
      ? opts.salonId === null
        ? and(eq(systemAlerts.scope, "global"), isNull(systemAlerts.salonId))
        : eq(systemAlerts.salonId, opts.salonId)
      : undefined;

  return db
    .select()
    .from(systemAlerts)
    .where(scopeCond ? and(eq(systemAlerts.status, "open"), scopeCond) : eq(systemAlerts.status, "open"))
    .orderBy(desc(systemAlerts.createdAt))
    .limit(limit);
}
