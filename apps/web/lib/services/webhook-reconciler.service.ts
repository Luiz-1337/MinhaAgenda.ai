/**
 * Reconciliador de webhook das instâncias Evolution.
 *
 * Garante que CADA instância ativa esteja assinando o webhook correto (URL atual
 * do app) E o conjunto de eventos esperado — incluindo MESSAGES_UPDATE, que os
 * salões já conectados NÃO recebem (setInstanceWebhook só re-aplica ao
 * criar/reconectar a instância). Sem isso, a escada de entrega fica inerte p/ eles.
 *
 * Também corrige a URL de webhook desatualizada após uma troca de domínio
 * (a Evolution continuaria postando no host antigo → mensagens somem).
 */

import { db, salons, agents, isNotNull } from "@repo/db";
import {
  getInstanceWebhook,
  getExpectedWebhookConfig,
  setInstanceWebhook,
} from "./evolution/evolution-instance.service";
import { recordAlert } from "./alerts/alert.service";
import { logger } from "../infra/logger";

export interface WebhookReconcileResult {
  checked: number;
  fixed: number;
  failed: number;
}

function safeHost(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}

export async function reconcileInstanceWebhooks(): Promise<WebhookReconcileResult> {
  const expected = getExpectedWebhookConfig();
  if (!expected.url) {
    logger.warn("Webhook reconciler: no base URL configured; skipping");
    return { checked: 0, fixed: 0, failed: 0 };
  }
  const expectedHost = safeHost(expected.url);

  // Instâncias distintas: agents (PRO/Enterprise) + salons (SOLO).
  const [agentRows, salonRows] = await Promise.all([
    db.select({ name: agents.evolutionInstanceName }).from(agents).where(isNotNull(agents.evolutionInstanceName)),
    db.select({ name: salons.evolutionInstanceName }).from(salons).where(isNotNull(salons.evolutionInstanceName)),
  ]);
  const instanceNames = Array.from(
    new Set([...agentRows, ...salonRows].map((r) => r.name).filter((n): n is string => !!n))
  );

  let fixed = 0;
  let failed = 0;

  for (const instanceName of instanceNames) {
    try {
      const current = await getInstanceWebhook(instanceName);
      const urlOk = current?.url ? safeHost(current.url) === expectedHost : false;
      const eventsOk = current ? expected.events.every((e) => current.events.includes(e)) : false;

      if (urlOk && eventsOk) continue; // já está correto

      await setInstanceWebhook(instanceName); // re-aplica URL + eventos (inclui MESSAGES_UPDATE)
      fixed++;
      logger.info({ instanceName, urlOk, eventsOk }, "Webhook reconciler: re-applied webhook config");
      await recordAlert({
        scope: "global",
        type: "webhook_drift_fixed",
        severity: "warning",
        title: `Webhook reconfigurado na instância ${instanceName}`,
        detail: { instanceName, previousUrl: current?.url ?? null, hadEvents: current?.events ?? [], urlOk, eventsOk },
        throttleSeconds: 3600,
      });
    } catch (err) {
      failed++;
      logger.error({ err, instanceName }, "Webhook reconciler: failed to reconcile instance");
      await recordAlert({
        scope: "global",
        type: "webhook_reconcile_failed",
        severity: "critical",
        title: `Falha ao reconciliar webhook da instância ${instanceName}`,
        detail: { instanceName, error: err instanceof Error ? err.message : String(err) },
        throttleSeconds: 3600,
      });
    }
  }

  return { checked: instanceNames.length, fixed, failed };
}
