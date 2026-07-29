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

import { db, chats, messages, eq, and, desc, inArray } from '@repo/db';
import { getProviderForSalon } from './index';
import type { OutboundResult } from './provider';

const WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * Erro de quando a Cloud API exige template e não há um configurado.
 *
 * Tipado de propósito, em vez de string: o envio MANUAL do painel precisa que o
 * erro chegue no dono (ele está ali esperando), enquanto os crons de lembrete e
 * marketing precisam distinguir "faltou template" de uma falha de rede para
 * decidir entre alertar e re-tentar.
 */
export class ProactiveTemplateRequiredError extends Error {
  readonly salonId: string;

  constructor(salonId: string) {
    super(
      'Envio proativo via WhatsApp Cloud fora da janela de 24h exige um template aprovado (ainda não configurado para este tipo de mensagem).',
    );
    this.name = 'ProactiveTemplateRequiredError';
    this.salonId = salonId;
  }
}

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

/**
 * Acha o chat de um telefone dentro do salão, para o caminho proativo poder
 * checar a janela de 24h mesmo quando o chamador não tem o chatId em mãos (é o
 * caso dos crons de lembrete e marketing).
 *
 * Duas formas de telefone de propósito: `chats.client_phone` está inconsistente
 * em produção — a maioria é só-dígitos, mas parte das linhas tem o '+'. Um `eq()`
 * ingênuo erraria justamente essas. O `inArray` mantém a busca no índice único
 * (salon_id, client_phone).
 */
async function findChatIdByPhone(salonId: string, to: string): Promise<string | undefined> {
  const digits = to.replace(/\D/g, '');
  if (!digits) return undefined;

  const row = await db
    .select({ id: chats.id })
    .from(chats)
    .where(and(eq(chats.salonId, salonId), inArray(chats.clientPhone, [digits, `+${digits}`])))
    .limit(1);

  return row[0]?.id;
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
  //
  // Quando o chamador não passou chatId (os crons de lembrete e marketing não
  // têm), resolvemos pelo telefone. Sem isso a janela nunca era consultada e TODO
  // envio proativo caía na exigência de template — inclusive os que estavam na
  // janela grátis, que poderiam ser texto livre sem custo nenhum.
  const chatId = args.chatId ?? (await findChatIdByPhone(args.salonId, args.to));
  const insideWindow = chatId ? await isWithin24hWindow(chatId) : false;
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
  throw new ProactiveTemplateRequiredError(args.salonId);
}
