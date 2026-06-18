/**
 * Cron de reconciliação de entrada (backstop).
 *
 * A cada poucos minutos procura conversas em que o cliente falou por último e
 * não houve resposta dentro da janela, e abre um alerta no salão para que alguém
 * assuma. Pega perdas silenciosas independentemente da causa (worker fora do ar,
 * job perdido, erro engolido).
 */

import { NextRequest, NextResponse } from "next/server";
import { requireCronAuth } from "@/lib/services/admin-auth.service";
import { findUnansweredChats } from "@/lib/services/reconciliation.service";
import { recordAlert } from "@/lib/services/alerts/alert.service";
import { logger } from "@/lib/infra/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const authError = requireCronAuth(request.headers);
  if (authError) return authError;

  try {
    const unanswered = await findUnansweredChats({ minMinutes: 10, windowHours: 6 });

    // Agrupa por salão para emitir UM alerta por salão (e não um por conversa).
    const bySalon = new Map<string, string[]>();
    for (const u of unanswered) {
      const arr = bySalon.get(u.salonId) ?? [];
      arr.push(u.chatId);
      bySalon.set(u.salonId, arr);
    }

    for (const [salonId, chatIds] of bySalon) {
      await recordAlert({
        scope: "salon",
        salonId,
        type: "unanswered_message",
        severity: "critical",
        title: `${chatIds.length} conversa(s) sem resposta há mais de 10 min`,
        detail: { chatIds: chatIds.slice(0, 50), count: chatIds.length },
        throttleSeconds: 1800,
      });
    }

    return NextResponse.json({ ok: true, unanswered: unanswered.length, salons: bySalon.size });
  } catch (error) {
    logger.error({ err: error }, "reconcile-unanswered cron failed");
    return new NextResponse("reconcile-unanswered failed", { status: 500 });
  }
}
