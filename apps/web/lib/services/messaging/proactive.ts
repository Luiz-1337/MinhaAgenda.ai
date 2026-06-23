/**
 * Envio PROATIVO (iniciado pelo negócio): lembrete, marketing/retenção e envio
 * manual do painel. Resolve o provider pela flag do salão (getProviderForSalon)
 * e respeita a regra da Cloud API: fora da janela de 24h, só template aprovado.
 *
 * - Evolution: texto livre a qualquer hora (comportamento atual preservado).
 * - Cloud: dentro da janela de 24h => texto livre; fora => template (ou erro
 *   EXPLÍCITO se nenhum template foi configurado — NUNCA falha em silêncio).
 *
 * Imports relativos + @repo/* (sem alias @/), pois este módulo pode entrar no
 * grafo de serviços compartilhado com o worker.
 */

import { db, messages, eq, and, desc } from '@repo/db';
import { getProviderForSalon } from './index';
import type { OutboundResult } from './provider';

const WINDOW_MS = 24 * 60 * 60 * 1000;

export interface ProactiveTemplate {
  templateName: string;
  languageCode: string;
  bodyParams?: string[];
}

export interface SendProactiveArgs {
  salonId: string;
  to: string;
  text: string;
  agentId?: string;
  /** Quando presente, permite checar a janela de 24h (caso Cloud). */
  chatId?: string;
  /** Aplica indicador de "digitando…" no caminho Evolution (msgs de IA). */
  withTyping?: boolean;
  /** Template HSM para o caso Cloud fora da janela de 24h. */
  template?: ProactiveTemplate;
}

/** True se a última mensagem RECEBIDA do cliente no chat foi há menos de 24h. */
export async function isWithin24hWindow(chatId: string): Promise<boolean> {
  const last = await db
    .select({ createdAt: messages.createdAt })
    .from(messages)
    .where(and(eq(messages.chatId, chatId), eq(messages.role, 'user')))
    .orderBy(desc(messages.createdAt))
    .limit(1);
  const createdAt = last[0]?.createdAt;
  if (!createdAt) return false;
  return Date.now() - new Date(createdAt).getTime() < WINDOW_MS;
}

export async function sendProactiveMessage(args: SendProactiveArgs): Promise<OutboundResult> {
  const provider = await getProviderForSalon(args.salonId, args.agentId);

  // Evolution: texto livre a qualquer hora (comportamento atual).
  if (provider.kind === 'evolution') {
    return args.withTyping
      ? provider.sendTextWithTyping({ to: args.to, body: args.text, salonId: args.salonId, agentId: args.agentId })
      : provider.sendText({ to: args.to, body: args.text, salonId: args.salonId, agentId: args.agentId });
  }

  // Cloud: dentro da janela de 24h pode mandar texto livre; fora exige template.
  const insideWindow = args.chatId ? await isWithin24hWindow(args.chatId) : false;
  if (insideWindow) {
    return provider.sendText({ to: args.to, body: args.text, salonId: args.salonId, agentId: args.agentId });
  }
  if (args.template) {
    return provider.sendTemplate({
      to: args.to,
      salonId: args.salonId,
      agentId: args.agentId,
      templateName: args.template.templateName,
      languageCode: args.template.languageCode,
      bodyParams: args.template.bodyParams,
    });
  }
  throw new Error(
    'Envio proativo via WhatsApp Cloud fora da janela de 24h exige um template aprovado (ainda não configurado para este tipo de mensagem).',
  );
}
