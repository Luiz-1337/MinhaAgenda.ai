/**
 * Webhook da WhatsApp Cloud API (Meta) — rota SEPARADA da Evolution.
 *
 * Por que separada de /api/webhook/whatsapp: o payload e o handshake são
 * completamente diferentes (a Evolution manda eventos Baileys; a Meta manda
 * `entry[].changes[].value` + verificação GET hub.challenge + assinatura
 * X-Hub-Signature-256). Manter rotas distintas evita um parser cheio de ifs.
 *
 * Reaproveita TODO o pipeline existente: dedup, rate-limit, chat/customer,
 * saveMessage e a fila BullMQ. Some a resolução de LID (a Cloud só usa E.164).
 *
 * Escopo desta fase (B4): inbound (texto + stub de mídia), status de entrega e
 * detecção de ecos do Coexistence. O REPLY via Cloud (worker) é a próxima etapa
 * (B8: campo `provider` no job + worker usando getProviderForSalon).
 */

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { createContextLogger, createRequestContext, hashPhone } from '@/lib/infra/logger';
import { isMessageProcessed, markMessageProcessed } from '@/lib/infra/redis';
import { enqueueMessage } from '@/lib/queues/message-queue';
import { WebhookMetrics } from '@/lib/infra/metrics';
import { recordAlert } from '@/lib/services/alerts/alert.service';
import { findOrCreateChat, findOrCreateCustomer, saveMessage } from '@/lib/services/chat.service';
import { checkPhoneRateLimit } from '@/lib/infra/rate-limit';
import { withTimeout, TimeoutError } from '@/lib/utils/async.utils';
import { RateLimitError } from '@/lib/errors';
import { db, agents, messages, chats, eq, and } from '@repo/db';

export const maxDuration = 10;

const DB_TIMEOUT = 3000;
const REDIS_TIMEOUT = 2000;
const APP_SECRET = process.env.WHATSAPP_APP_SECRET || '';
const VERIFY_TOKEN = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN || '';

type ContextLogger = ReturnType<typeof createContextLogger>;

/**
 * GET — handshake de verificação do webhook (a Meta chama uma vez ao configurar).
 */
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  if (
    p.get('hub.mode') === 'subscribe' &&
    VERIFY_TOKEN.length > 0 &&
    p.get('hub.verify_token') === VERIFY_TOKEN
  ) {
    return new NextResponse(p.get('hub.challenge') ?? '', { status: 200 });
  }
  return new NextResponse('Forbidden', { status: 403 });
}

/**
 * POST — eventos do WhatsApp (mensagens recebidas, status de entrega, ecos).
 */
export async function POST(req: NextRequest) {
  const ctx = createRequestContext();
  const reqLogger = createContextLogger({ requestId: ctx.requestId });
  WebhookMetrics.received();

  try {
    // 1. Ler o corpo CRU (necessário para validar a assinatura HMAC).
    const raw = await req.text();

    // 2. Validar assinatura X-Hub-Signature-256 antes de parsear.
    // Em PRODUÇÃO é OBRIGATÓRIA: sem App Secret configurado, recusa — um POST
    // forjado poderia injetar inbound em QUALQUER salão (escolhendo o
    // phone_number_id no payload), gastando crédito de IA e agindo por terceiros.
    // Em dev fica opcional para facilitar testes locais.
    if (process.env.NODE_ENV === 'production' && APP_SECRET.length === 0) {
      reqLogger.error('Cloud webhook: WHATSAPP_APP_SECRET ausente em produção — recusando');
      WebhookMetrics.error('auth_failed');
      return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
    }
    if (APP_SECRET.length > 0) {
      const signature = req.headers.get('x-hub-signature-256') || '';
      if (!verifySignature(raw, signature, APP_SECRET)) {
        reqLogger.warn('Cloud webhook: assinatura inválida');
        WebhookMetrics.error('auth_failed');
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
    }

    // 3. Parsear JSON.
    let body: any;
    try {
      body = JSON.parse(raw);
    } catch {
      WebhookMetrics.error('invalid_json');
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    if (body?.object !== 'whatsapp_business_account') {
      return NextResponse.json({ status: 'ignored' }, { status: 200 });
    }

    // 4. Percorrer entries/changes.
    for (const entry of body.entry ?? []) {
      for (const change of entry.changes ?? []) {
        const value = change?.value ?? {};
        const phoneNumberId: string | undefined = value?.metadata?.phone_number_id;

        if (Array.isArray(value.messages)) {
          for (const msg of value.messages) {
            await handleInboundMessage(msg, value, phoneNumberId, reqLogger);
          }
        }
        if (Array.isArray(value.statuses)) {
          for (const st of value.statuses) {
            await handleStatus(st, reqLogger);
          }
        }
        // Coexistence: ecos das mensagens que o DONO envia pelo app do celular.
        if (Array.isArray(value.message_echoes)) {
          for (const echo of value.message_echoes) {
            await handleEcho(echo, phoneNumberId, reqLogger);
          }
        }
      }
    }

    return NextResponse.json({ status: 'ok' }, { status: 200 });
  } catch (error) {
    // Erro transitório (DB/Redis/fila) -> 500 para a Meta re-tentar.
    // A idempotência (jobId=wamid + dedup) garante que o retry não duplica.
    if (error instanceof TimeoutError) {
      reqLogger.error({ err: error }, 'Cloud webhook: timeout');
      WebhookMetrics.error('timeout');
      return NextResponse.json({ error: 'Timeout' }, { status: 500 });
    }
    reqLogger.error({ err: error }, 'Cloud webhook: erro ao processar');
    WebhookMetrics.error('processing_error');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * Valida a assinatura HMAC-SHA256 do corpo cru com o App Secret.
 * Header esperado: `X-Hub-Signature-256: sha256=<hex>`.
 */
function verifySignature(raw: string, header: string, secret: string): boolean {
  if (!header.startsWith('sha256=')) return false;
  const expected = crypto.createHmac('sha256', secret).update(raw, 'utf8').digest('hex');
  const a = Buffer.from(expected, 'hex');
  const b = Buffer.from(header.slice('sha256='.length), 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/**
 * Resolve o salão/agente a partir do phone_number_id, via banco.
 *
 * Espelha o ramo agent-first do webhook Evolution (que resolve por instanceName):
 * aqui o phone_number_id JÁ identifica o agente. Lookup O(1) por
 * agents.whatsapp_phone_number_id (UNIQUE — garante 1 agente por número).
 * Falha-fechado: sem mapeamento => null (o chamador descarta + alerta; NUNCA
 * chuta um agente, para não responder por outro salão).
 */
async function resolveCloudTenant(
  phoneNumberId: string | undefined,
): Promise<{ salonId: string; agentId: string } | null> {
  if (!phoneNumberId) return null;
  const agent = await withTimeout(
    db.query.agents.findFirst({
      where: eq(agents.whatsappPhoneNumberId, phoneNumberId),
      columns: { id: true, salonId: true },
    }),
    DB_TIMEOUT,
    'findAgentByPhoneNumberId',
  );
  if (agent) return { salonId: agent.salonId, agentId: agent.id };
  return null;
}

/** Extrai conteúdo textual + flags de mídia de uma mensagem da Cloud API. */
function extractContent(msg: any): {
  body: string;
  hasMedia: boolean;
  mediaType?: 'image' | 'audio' | 'video' | 'document';
  mediaId?: string;
} {
  switch (msg.type) {
    case 'text':
      return { body: msg.text?.body ?? '', hasMedia: false };
    case 'image':
      return { body: msg.image?.caption ?? '[imagem]', hasMedia: true, mediaType: 'image', mediaId: msg.image?.id };
    case 'video':
      return { body: msg.video?.caption ?? '[vídeo]', hasMedia: true, mediaType: 'video', mediaId: msg.video?.id };
    case 'audio':
      return { body: '[áudio]', hasMedia: true, mediaType: 'audio', mediaId: msg.audio?.id };
    case 'document':
      return {
        body: msg.document?.caption ?? msg.document?.filename ?? '[documento]',
        hasMedia: true,
        mediaType: 'document',
        mediaId: msg.document?.id,
      };
    case 'button':
      return { body: msg.button?.text ?? '', hasMedia: false };
    case 'interactive':
      return {
        body: msg.interactive?.button_reply?.title ?? msg.interactive?.list_reply?.title ?? '',
        hasMedia: false,
      };
    default:
      return { body: `[tipo ${msg.type} não suportado]`, hasMedia: false };
  }
}

async function handleInboundMessage(
  msg: any,
  value: any,
  phoneNumberId: string | undefined,
  reqLogger: ContextLogger,
) {
  const messageId: string = msg.id; // wamid
  const clientPhone: string = msg.from; // E.164 só dígitos (número real — nunca LID)
  const profileName: string | undefined = value?.contacts?.[0]?.profile?.name;

  // 1. Idempotência.
  if (await withTimeout(isMessageProcessed(messageId), REDIS_TIMEOUT, 'isMessageProcessed')) {
    WebhookMetrics.duplicate();
    return;
  }

  // 2. Rate limit por telefone.
  try {
    await withTimeout(checkPhoneRateLimit(clientPhone), REDIS_TIMEOUT, 'checkPhoneRateLimit');
  } catch (error) {
    if (error instanceof RateLimitError) {
      WebhookMetrics.rateLimited({ phone: hashPhone(clientPhone) });
      return;
    }
    throw error;
  }

  // 3. Resolver tenant pelo phone_number_id.
  const tenant = await resolveCloudTenant(phoneNumberId);
  if (!tenant) {
    reqLogger.error({ phoneNumberId }, 'Cloud: phone_number_id sem mapeamento para salão/agente');
    WebhookMetrics.error('salon_not_found');
    void recordAlert({
      scope: 'global',
      type: 'cloud_number_not_mapped',
      severity: 'critical',
      title: `phone_number_id sem mapeamento: ${phoneNumberId ?? 'desconhecido'}`,
      detail: { phoneNumberId },
    });
    return;
  }
  const { salonId, agentId } = tenant;
  const logger2 = reqLogger.child({ messageId, from: hashPhone(clientPhone), salonId, agentId });

  // 4. Conteúdo.
  const { body, hasMedia, mediaType, mediaId } = extractContent(msg);

  // 5. Customer + chat (paralelo).
  const [customer, chat] = await Promise.all([
    withTimeout(findOrCreateCustomer(clientPhone, salonId, profileName), DB_TIMEOUT, 'findOrCreateCustomer'),
    withTimeout(findOrCreateChat(clientPhone, salonId, agentId), DB_TIMEOUT, 'findOrCreateChat'),
  ]);

  // 6. Salvar a mensagem do cliente (guardando o tipo de mídia p/ exibir no painel).
  const userMessageId = await withTimeout(
    saveMessage(chat.id, 'user', body, hasMedia && mediaType ? { mediaType } : undefined),
    DB_TIMEOUT,
    'saveMessage',
  );

  // 7. Enfileirar (mesmo job da Evolution; campos Baileys recebem placeholders
  //    no caminho Cloud — o reply via Cloud é wiring do B8).
  await withTimeout(
    enqueueMessage({
      messageId,
      userMessageId,
      chatId: chat.id,
      salonId,
      agentId,
      customerId: customer.id,
      provider: 'cloud',
      phoneNumberId,
      instanceName: `cloud:${phoneNumberId}`,
      remoteJid: clientPhone,
      addressingMode: 'jid',
      replyToJid: clientPhone,
      clientPhone,
      body,
      hasMedia,
      mediaType: mediaType ?? undefined,
      mediaId, // Cloud: id da mídia p/ o worker baixar (B6)
      mediaUrl: undefined,
      receivedAt: new Date(Number(msg.timestamp) * 1000).toISOString(),
      profileName,
      customerName: customer.name,
    }),
    REDIS_TIMEOUT,
    'enqueueMessage',
  );

  // 8. Marcar processado só após enqueue durável.
  await withTimeout(markMessageProcessed(messageId), REDIS_TIMEOUT, 'markMessageProcessed');
  WebhookMetrics.enqueued({ salonId });
  logger2.info('Cloud inbound enfileirado');
}

/**
 * Status de entrega (sent/delivered/read/failed). Sem escada de reenvio: a Cloud
 * API não tem o status:0 silencioso da Evolution — falha vem com código claro.
 */
async function handleStatus(st: any, reqLogger: ContextLogger) {
  const wamid: string = st.id;
  const status: string = st.status;

  if (status === 'sent' || status === 'delivered' || status === 'read') {
    await withTimeout(
      db.update(messages).set({ deliveryStatus: 'delivered' }).where(eq(messages.providerMessageId, wamid)),
      DB_TIMEOUT,
      'markDelivered',
    ).catch((err) => reqLogger.warn({ err, wamid }, 'Falha ao marcar entregue'));
    return;
  }

  if (status === 'failed') {
    const errorCode = st.errors?.[0]?.code;
    const errorTitle = st.errors?.[0]?.title;
    reqLogger.error({ wamid, errorCode, errorTitle }, 'Cloud: entrega falhou');
    await withTimeout(
      db.update(messages).set({ deliveryStatus: 'failed' }).where(eq(messages.providerMessageId, wamid)),
      DB_TIMEOUT,
      'markFailed',
    ).catch((err) => reqLogger.warn({ err, wamid }, 'Falha ao marcar como failed'));
  }
}

/**
 * Tipos de eco que representam CONTEÚDO real enviado pela atendente (e que vale
 * persistir no histórico). edit/revoke/reaction/desconhecido NÃO geram bolha
 * nova — no máximo disparam o handoff — para não poluir o contexto da IA com
 * placeholders (extractContent foi escrito para INBOUND e cai num default genérico).
 */
const ECHO_CONTENT_TYPES = new Set(['text', 'image', 'audio', 'video', 'document', 'button', 'interactive']);

/**
 * Coexistence (B7): eco de uma mensagem que a ATENDENTE enviou pelo app do
 * WhatsApp Business. A Meta ecoa SÓ o que sai do app — nunca o que o bot manda
 * pela Cloud API — então um eco significa que um humano assumiu a conversa.
 * Handoff: pausamos a IA nesse chat (isManual=true) e persistimos a fala do
 * humano no histórico (contexto da IA + visibilidade no painel). O dono reativa
 * a IA pelo botão "Passar para a IA" do chat (auto-retomada por janela é
 * follow-up — exigiria nova coluna).
 */
async function handleEcho(echo: any, phoneNumberId: string | undefined, reqLogger: ContextLogger) {
  const echoId: string | undefined = echo?.id;
  // Destinatário do eco = o cliente. Normaliza p/ dígitos (igual ao inbound, que
  // grava o chat sob msg.from em E.164 só-dígitos) — senão findOrCreateChat, que
  // casa clientPhone literalmente, criaria um chat DUPLICADO e o handoff cairia
  // no chat errado.
  const customerPhone: string | undefined = echo?.to ? String(echo.to).replace(/\D/g, '') : undefined;

  // Idempotência (a Meta re-tenta em 5xx). Chave própria; não colide com inbound.
  if (
    echoId &&
    (await withTimeout(isMessageProcessed(echoId), REDIS_TIMEOUT, 'isMessageProcessed').catch(() => false))
  ) {
    WebhookMetrics.duplicate();
    return;
  }

  const tenant = await resolveCloudTenant(phoneNumberId);
  if (!tenant) {
    reqLogger.error({ phoneNumberId }, 'Cloud echo: phone_number_id sem mapeamento para salão/agente');
    return; // sem mapeamento -> retry não resolve
  }
  // Sem 'to' (ex.: revoke só traz original_message_id) -> não dá pra rotear; ignora.
  if (!customerPhone) {
    reqLogger.warn({ phoneNumberId, echoType: echo?.type }, 'Cloud echo sem destinatário (to); ignorado');
    return;
  }

  const { salonId, agentId } = tenant;

  const chat = await withTimeout(
    findOrCreateChat(customerPhone, salonId, agentId),
    DB_TIMEOUT,
    'findOrCreateChat',
  );
  // Handoff humano: pausa a IA nesse chat (só escreve se ainda não era manual,
  // p/ não bater no banco / reordenar listas por updatedAt em todo eco).
  await withTimeout(
    db.update(chats)
      .set({ isManual: true, updatedAt: new Date() })
      .where(and(eq(chats.id, chat.id), eq(chats.isManual, false))),
    DB_TIMEOUT,
    'setChatManual',
  );
  // Persiste a fala do humano (role assistant = bolha de saída) SÓ para tipos de
  // conteúdo real — edit/revoke/reaction não viram bolha (evita lixo no contexto).
  if (ECHO_CONTENT_TYPES.has(echo?.type)) {
    const { body } = extractContent(echo);
    await withTimeout(saveMessage(chat.id, 'assistant', body), DB_TIMEOUT, 'saveEcho');
  }

  if (echoId) {
    await withTimeout(markMessageProcessed(echoId), REDIS_TIMEOUT, 'markMessageProcessed');
  }
  reqLogger.info(
    { salonId, agentId, chatId: chat.id, echoType: echo?.type },
    'Coexistence: atendente ativa no app — IA pausada (modo manual)',
  );
}
