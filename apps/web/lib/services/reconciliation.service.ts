/**
 * Reconciliação de entrada: detecta conversas onde o cliente mandou a última
 * mensagem e NÃO houve resposta do assistente dentro de uma janela. Backstop
 * universal: pega qualquer perda silenciosa (worker fora do ar, job perdido,
 * erro engolido) independentemente da causa.
 */

import { db, sql } from "@repo/db";

export interface UnansweredChat {
  chatId: string;
  salonId: string;
  clientPhone: string;
  lastUserAt: string;
}

/**
 * Lista chats ativos, não-manuais, de salões ativos, cuja ÚLTIMA mensagem é do
 * cliente, recebida há mais de `minMinutes` (deu tempo de responder) e dentro de
 * `windowHours` (limita o escopo a algo recente/acionável).
 */
export async function findUnansweredChats(opts?: {
  minMinutes?: number;
  windowHours?: number;
  limit?: number;
}): Promise<UnansweredChat[]> {
  const minMinutes = opts?.minMinutes ?? 10;
  const windowHours = opts?.windowHours ?? 6;
  const limit = opts?.limit ?? 200;

  const result = await db.execute(sql`
    SELECT c.id AS chat_id, c.salon_id, c.client_phone, m.created_at AS last_user_at
    FROM chats c
    JOIN LATERAL (
      SELECT role, created_at FROM messages WHERE chat_id = c.id ORDER BY created_at DESC LIMIT 1
    ) m ON true
    JOIN salons s ON s.id = c.salon_id
    WHERE c.status = 'active'
      AND c.is_manual = false
      AND m.role = 'user'
      AND m.created_at < now() - make_interval(mins => ${minMinutes})
      AND m.created_at > now() - make_interval(hours => ${windowHours})
      AND s.subscription_status IN ('ACTIVE','PAID','TRIAL')
    ORDER BY m.created_at ASC
    LIMIT ${limit}
  `);

  const rows = (Array.isArray(result) ? result : (result as any)?.rows ?? []) as Array<{
    chat_id: string;
    salon_id: string;
    client_phone: string;
    last_user_at: string | Date;
  }>;

  return rows.map((r) => ({
    chatId: r.chat_id,
    salonId: r.salon_id,
    clientPhone: r.client_phone,
    lastUserAt: typeof r.last_user_at === "string" ? r.last_user_at : new Date(r.last_user_at).toISOString(),
  }));
}
