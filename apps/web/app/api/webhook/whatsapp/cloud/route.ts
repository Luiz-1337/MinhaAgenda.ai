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
import { db, agents, messages, chats, eq, and, or, ne, isNull, notInArray, sql } from '@repo/db';
import {
  extractCloudContent,
  isCloudContentType,
  getReactionTarget,
  buildReactionLabel,
  extractAdReferral,
} from '@/lib/services/messaging/cloud/content';
import type { AdReferral } from '@/lib/services/messaging/cloud/content';

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

        // O número legível do salão vem no metadata de TODO payload — mensagem,
        // status ou eco. Capturar AQUI, e não dentro de handleInboundMessage,
        // porque o dono pode passar o dia respondendo pelo celular (só ecos) e o
        // número nunca seria preenchido.
        await captureDisplayPhoneNumber(phoneNumberId, value?.metadata?.display_phone_number, reqLogger);

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

        // Tudo o que NÃO for um dos três acima passava em silêncio, com 200.
        //
        // Os três `if` acima ficam intocados de propósito: NÃO trocar este
        // dispatch por um `switch (change.field)`. Se a Meta rotular o eco com
        // outro nome de campo, um switch DESCARTA mensagem — e foi exatamente
        // "evento com nome inesperado" que deixou a Coexistência um dia sem
        // conectar. Aqui só se acrescenta ao caminho que hoje é mudo.
        const handledArrays =
          Array.isArray(value.messages) ||
          Array.isArray(value.statuses) ||
          Array.isArray(value.message_echoes);
        if (!handledArrays) {
          await handleOtherField(change?.field, value, reqLogger);
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
 * Guarda o número legível do salão ("+55 11 98604-9295"), que a Meta manda no
 * `metadata` de TODO payload do webhook.
 *
 * O painel mostra isso; o phone_number_id é um id opaco que não diz nada ao dono.
 * Fica no laço principal, e não dentro de handleInboundMessage, porque o dono pode
 * passar o dia respondendo pelo celular — só ecos — e nesse caso o número nunca
 * seria capturado.
 *
 * Escreve apenas quando difere do gravado, então em regime é uma leitura barata e
 * ZERO escrita. Awaited de propósito: promise solta em função serverless morre
 * quando a lambda congela após a resposta. Nunca lança — um rótulo de UI não pode
 * derrubar o webhook e fazer a Meta re-tentar a mensagem.
 */
async function captureDisplayPhoneNumber(
  phoneNumberId: string | undefined,
  displayPhoneNumber: string | undefined,
  reqLogger: ContextLogger,
): Promise<void> {
  if (!phoneNumberId || !displayPhoneNumber) return;
  try {
    await withTimeout(
      db
        .update(agents)
        .set({ whatsappNumber: displayPhoneNumber })
        .where(
          and(
            eq(agents.whatsappPhoneNumberId, phoneNumberId),
            // isNull É OBRIGATÓRIO aqui: em SQL `NULL != 'x'` resulta em NULL, não
            // em true, então um `ne` sozinho NUNCA atualizaria a linha ainda vazia
            // — exatamente o caso que este código existe para resolver.
            or(isNull(agents.whatsappNumber), ne(agents.whatsappNumber, displayPhoneNumber)),
          ),
        ),
      DB_TIMEOUT,
      'captureDisplayPhoneNumber',
    );
  } catch (err) {
    reqLogger.warn({ err, phoneNumberId }, 'Falha ao guardar o número legível do salão (ignorado)');
  }
}

/**
 * Grava a origem de anúncio na mensagem que a carregou.
 *
 * Na MENSAGEM, e não no chat, de propósito: o fato é "esta mensagem nasceu deste
 * anúncio". Guardar no chat obrigaria a escolher entre sobrescrever (perde o
 * primeiro anúncio) e manter o primeiro (a IA perde o anúncio atual quando a
 * cliente clica num segundo) — uma decisão que a mensagem não força.
 *
 * Nunca lança: ver o comentário no ponto de chamada. Atribuição não pode custar
 * uma mensagem.
 */
async function persistAdReferral(
  messageRowId: string,
  referral: AdReferral,
  reqLogger: ContextLogger,
): Promise<void> {
  try {
    await withTimeout(
      db.update(messages).set({ adReferral: referral }).where(eq(messages.id, messageRowId)),
      DB_TIMEOUT,
      'persistAdReferral',
    );
  } catch (err) {
    reqLogger.warn(
      { err, messageRowId },
      'Falha ao gravar a origem do anúncio (ignorado — migration 031 aplicada?)',
    );
  }
}

/**
 * Campos do webhook que a Meta manda e que NÃO carregam mensagem: avisos sobre a
 * conta e sobre o número. Antes caíam no vazio com 200 — e `account_update` é
 * como a Meta avisa que o número foi desabilitado, restringido ou banido, o que
 * jamais deveria ser silencioso num número de negócio em produção.
 *
 * Nunca lança: um aviso mal-parseado não pode virar 500 e fazer a Meta re-tentar.
 */
async function handleOtherField(
  field: string | undefined,
  value: Record<string, unknown>,
  reqLogger: ContextLogger,
): Promise<void> {
  try {
    // Erros de plataforma no nível do webhook. Distinto do `st.errors` que
    // handleStatus já lê (aquele é por mensagem; este é da conta/número).
    const errors = value.errors;
    if (Array.isArray(errors) && errors.length > 0) {
      const first = errors[0] as { code?: number; title?: string } | undefined;
      reqLogger.error({ field, code: first?.code, title: first?.title }, 'Cloud: erro de plataforma no webhook');
      void recordAlert({
        scope: 'global',
        type: 'cloud_webhook_error',
        severity: 'critical',
        title: `Erro de plataforma da Meta: ${first?.title ?? 'sem título'}`,
        detail: { field, code: first?.code, title: first?.title },
      });
      return;
    }

    if (field === 'account_update') {
      const event = typeof value.event === 'string' ? value.event : undefined;
      // Ban/restrição/desabilitação derrubam o canal inteiro — critical. Os
      // demais account_update (ex.: mudança de nome aprovada) são informativos.
      const grave =
        !!value.ban_info ||
        !!value.restriction_info ||
        (event !== undefined &&
          ['DISABLED_UPDATE', 'ACCOUNT_VIOLATION', 'ACCOUNT_RESTRICTION', 'PARTNER_APP_UNINSTALLED'].includes(event));
      if (grave) {
        reqLogger.error({ field, event }, 'Cloud: account_update grave');
        void recordAlert({
          scope: 'global',
          type: 'cloud_account_update',
          severity: 'critical',
          title: `Conta WhatsApp com problema: ${event ?? 'restrição/ban'}`,
          detail: { event, banInfo: value.ban_info, restrictionInfo: value.restriction_info },
        });
      } else {
        reqLogger.info({ field, event }, 'Cloud: account_update informativo');
      }
      return;
    }

    if (field === 'phone_number_quality_update') {
      const event = typeof value.event === 'string' ? value.event : undefined;
      reqLogger.warn({ field, event, currentLimit: value.current_limit }, 'Cloud: qualidade do número mudou');
      if (event === 'FLAGGED' || event === 'DOWNGRADE') {
        void recordAlert({
          scope: 'global',
          type: 'cloud_quality_downgrade',
          severity: 'warning',
          title: `Qualidade do número caiu (${event})`,
          detail: { event, currentLimit: value.current_limit },
        });
      }
      return;
    }

    // Campo desconhecido: só log + contador. Não é erro nosso, e a Meta adiciona
    // campos com frequência — o que importa é deixar de ser invisível.
    reqLogger.warn({ field, valueKeys: Object.keys(value) }, 'Cloud: campo de webhook não tratado');
    WebhookMetrics.unhandledField(field ?? 'unknown');
  } catch (err) {
    reqLogger.warn({ err, field }, 'Cloud: falha ao processar campo não-mensagem (ignorado)');
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

  // 3b. O número legível do SALÃO chega no metadata de todo inbound e era jogado
  //     fora. Guardar aqui é o que faz o painel mostrar "+55 11 ..." em vez do
  //     phone_number_id — e alcança conexões feitas antes desta mudança, sem
  //     exigir reconexão. Escreve só quando difere, para não bater no banco a
  //     cada mensagem.

  // 4. Conteúdo, pela tabela única (mesma que decide o gate do eco).
  const { body: rawBody, hasMedia, mediaType, mediaId, wakeAI, known } = extractCloudContent(msg);
  if (!known) {
    // Tipo que a Meta passou a mandar e a gente ainda não conhece: não é erro
    // nosso, mas tem que ser visível.
    reqLogger.warn({ type: msg.type }, 'Cloud: tipo de mensagem não reconhecido');
    WebhookMetrics.unhandledField(`type:${msg.type ?? 'unknown'}`);
  }

  // 4a. Origem da conversa: `referral` só vem quando a cliente clicou num anúncio
  //     (CTWA) ou post. É a ÚNICA vez que a Meta manda o texto do anúncio — se for
  //     descartado aqui, não há como recuperar depois, e a IA responde "sobre qual
  //     serviço você quer saber?" a quem acabou de clicar num anúncio que já dizia
  //     o serviço. Vai para o job (contexto da IA) e para o banco (atribuição).
  const adReferral = extractAdReferral(msg);
  if (adReferral) {
    reqLogger.info(
      { sourceType: adReferral.sourceType, sourceId: adReferral.sourceId, hasCtwaClid: !!adReferral.ctwaClid },
      'Cloud inbound veio de anúncio/post (CTWA)',
    );
  }

  // 4b. Reação: o rótulo só é útil citando a mensagem reagida. Uma leitura
  //     indexada por provider_message_id, e só neste tipo.
  let body = rawBody;
  const reaction = getReactionTarget(msg);
  if (reaction) {
    const original = await withTimeout(
      db.query.messages.findFirst({
        where: eq(messages.providerMessageId, reaction.messageId),
        columns: { content: true },
      }),
      DB_TIMEOUT,
      'findReactedMessage',
    ).catch(() => null);
    body = buildReactionLabel(reaction.emoji, original?.content);
  }

  // 5. Customer + chat (paralelo).
  const [customer, chat] = await Promise.all([
    withTimeout(findOrCreateCustomer(clientPhone, salonId, profileName), DB_TIMEOUT, 'findOrCreateCustomer'),
    withTimeout(findOrCreateChat(clientPhone, salonId, agentId), DB_TIMEOUT, 'findOrCreateChat'),
  ]);

  // 6. Salvar SEMPRE — inclusive o que não acorda a IA (reação, aviso de
  //    sistema): o painel mostra e o contexto da IA registra.
  //    providerMessageId agora é gravado no inbound também: sem o wamid do
  //    cliente no banco, reação a mensagem DELE seria irresolvível.
  const userMessageId = await withTimeout(
    saveMessage(chat.id, 'user', body, {
      providerMessageId: messageId,
      ...(hasMedia && mediaType ? { mediaType } : {}),
    }),
    DB_TIMEOUT,
    'saveMessage',
  );

  // 6b. Origem do anúncio no banco. Escrita SEPARADA e não-fatal de propósito, em
  //     vez de entrar no INSERT do saveMessage: a coluna `ad_referral` chega pela
  //     migration 031, e o deploy do código não pode depender dela. Se a coluna
  //     ainda não existir, isto loga e segue — enquanto se estivesse no INSERT,
  //     todo lead de anúncio derrubaria o webhook com 500, a Meta re-tentaria em
  //     vão e o lead pago seria perdido. Mesmo princípio de
  //     captureDisplayPhoneNumber: atribuição não pode derrubar entrega.
  if (adReferral) {
    await persistAdReferral(userMessageId, adReferral, reqLogger);
  }

  // 7. Enfileirar SÓ o que deve acordar a IA. Reação e aviso de sistema não são
  //    pedido a responder — a IA respondendo a um 👍 é ruído para o cliente.
  if (wakeAI) {
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
        // Contexto do anúncio pelo JOB, não pelo banco: é o que faz a correção
        // valer no deploy, sem esperar a migration 031.
        ...(adReferral ? { adReferral } : {}),
      }),
      REDIS_TIMEOUT,
      'enqueueMessage',
    );
    WebhookMetrics.enqueued({ salonId });
    logger2.info('Cloud inbound enfileirado');
  } else {
    logger2.info({ type: msg.type }, 'Cloud inbound registrado sem acordar a IA');
  }

  // 8. Marcar processado. INCONDICIONAL de propósito: é a idempotência do
  //    webhook. Deixar de marcar o que não foi enfileirado faria a Meta re-tentar
  //    e gravar a mesma reação várias vezes.
  await withTimeout(markMessageProcessed(messageId), REDIS_TIMEOUT, 'markMessageProcessed');
}

/**
 * Escada de progresso da entrega. A Meta manda os três como eventos separados e
 * eles significam coisas MUITO diferentes: `sent` é só "a Meta aceitou", `delivered`
 * é "chegou no aparelho", `read` é "abriu".
 *
 * Isto existia achatado nos três → 'delivered'. O custo apareceu na primeira
 * pergunta séria de negócio: com dois leads pagos calados, era impossível saber
 * pelo banco se eles tinham recebido a resposta ou se a entrega falhou — a única
 * coisa que se sabia era que a Meta não tinha reclamado.
 *
 * ELSE 0 cobre NULL e os estados da escada da Evolution ('retrying'): ambos são
 * superados por qualquer evento da Meta, que é informação mais nova.
 */
const DELIVERY_PROGRESS_RANK: Record<string, number> = { sent: 1, delivered: 2, read: 3 };

/** Estados terminais de falha: nunca são sobrescritos por evento de progresso. */
const DELIVERY_TERMINAL = ['failed', 'undelivered'];

/**
 * Status de entrega (sent/delivered/read/failed). Sem escada de reenvio: a Cloud
 * API não tem o status:0 silencioso da Evolution — falha vem com código claro.
 */
async function handleStatus(st: any, reqLogger: ContextLogger) {
  const wamid: string = st.id;
  const status: string = st.status;

  const rank = DELIVERY_PROGRESS_RANK[status];
  if (rank !== undefined) {
    // Só AVANÇA. A Meta não garante ordem de entrega dos webhooks: um `delivered`
    // atrasado chegando depois do `read` regrediria a tela de "lida" para
    // "entregue", e um `sent` atrasado apagaria o aviso vermelho de falha. As duas
    // guardas vão no WHERE, e não em ler-decidir-escrever, para que dois webhooks
    // simultâneos não se atropelem.
    await withTimeout(
      db
        .update(messages)
        .set({ deliveryStatus: status })
        .where(
          and(
            eq(messages.providerMessageId, wamid),
            sql`case ${messages.deliveryStatus}
                  when 'sent' then 1
                  when 'delivered' then 2
                  when 'read' then 3
                  else 0
                end < ${rank}`,
            // O isNull é obrigatório junto do notInArray: em SQL, `NULL NOT IN (...)`
            // resulta em NULL, não em true — sem ele a PRIMEIRA transição de uma
            // mensagem ainda sem status nunca gravaria.
            or(isNull(messages.deliveryStatus), notInArray(messages.deliveryStatus, DELIVERY_TERMINAL)),
          ),
        ),
      DB_TIMEOUT,
      'advanceDeliveryStatus',
    ).catch((err) => reqLogger.warn({ err, wamid, status }, 'Falha ao avançar status de entrega'));
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
  // Handoff humano: pausa a IA nesse chat. `manual_since` é REFRESCADO em todo
  // eco: o relógio da retomada automática tem que contar do ÚLTIMO que a
  // atendente falou, senão a IA voltaria no meio de um atendimento em andamento.
  //
  // Isso substitui de propósito o guard `eq(isManual, false)` que existia aqui
  // para evitar escrita repetida. A escrita passou a ser necessária (é o relógio),
  // e o efeito colateral que o guard evitava — o chat subir na lista por
  // updatedAt — é agora o comportamento desejado: a atendente acabou de falar
  // ali, a conversa TEM que ir para o topo.
  const now = new Date();
  await withTimeout(
    db.update(chats)
      .set({
        isManual: true,
        manualSince: now,
        manualReason: 'human_echo',
        updatedAt: now,
      })
      .where(eq(chats.id, chat.id)),
    DB_TIMEOUT,
    'setChatManual',
  );
  // Persiste a fala do humano (role assistant = bolha de saída) SÓ para tipos de
  // conteúdo real: edit/revoke/reaction disparam o handoff mas não viram bolha,
  // para não poluir o contexto da IA. O gate vem da MESMA tabela do inbound
  // (isCloudContentType), então acrescentar um tipo cobre os dois caminhos.
  // fromHuman separa esta fala das da IA dentro do mesmo role, e o wamid do eco
  // permite resolver uma reação a algo que a atendente mandou pelo celular.
  if (isCloudContentType(echo?.type)) {
    const { body } = extractCloudContent(echo);
    await withTimeout(
      saveMessage(chat.id, 'assistant', body, {
        fromHuman: true,
        ...(echoId ? { providerMessageId: echoId } : {}),
      }),
      DB_TIMEOUT,
      'saveEcho',
    );
  }

  if (echoId) {
    await withTimeout(markMessageProcessed(echoId), REDIS_TIMEOUT, 'markMessageProcessed');
  }
  reqLogger.info(
    { salonId, agentId, chatId: chat.id, echoType: echo?.type },
    'Coexistence: atendente ativa no app — IA pausada (modo manual)',
  );
}
