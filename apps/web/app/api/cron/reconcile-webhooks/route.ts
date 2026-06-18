/**
 * Cron: reconcilia o webhook de todas as instâncias Evolution.
 *
 * Re-aplica a URL + eventos esperados (incluindo MESSAGES_UPDATE) onde houver
 * divergência. É isso que faz a escada de entrega passar a disparar nos salões
 * já conectados (que não recebiam o evento) e corrige URL desatualizada.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireCronAuth } from "@/lib/services/admin-auth.service";
import { reconcileInstanceWebhooks } from "@/lib/services/webhook-reconciler.service";
import { logger } from "@/lib/infra/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const authError = requireCronAuth(request.headers);
  if (authError) return authError;

  try {
    const result = await reconcileInstanceWebhooks();
    logger.info({ result }, "Webhook reconciler executed");
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    logger.error({ err: error }, "reconcile-webhooks cron failed");
    return new NextResponse("reconcile-webhooks failed", { status: 500 });
  }
}
