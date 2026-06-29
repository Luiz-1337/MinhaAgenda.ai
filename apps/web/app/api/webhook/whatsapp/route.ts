/**
 * Webhook do WhatsApp via Evolution API
 *
 * Processa eventos da Evolution API:
 * - messages.upsert: Mensagens recebidas
 * - connection.update: Mudanças no status de conexão
 * - qrcode.updated: QR code atualizado
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  EvolutionWebhookSchema,
  extractMessageContent,
  extractPhoneNumber,
  getAddressingMode,
  detectMediaType,
  hasMedia,
  extractMediaUrl,
  mapConnectionState,
  MessagesUpdateDataSchema,
  MessageAckStatus,
  normalizeAckStatus,
} from '@/lib/schemas/evolution';
import { logger, createContextLogger, hashPhone, createRequestContext, getDuration, getReplicaId } from '@/lib/infra/logger';
import { StageTimer } from '@/lib/infra/stage-timer';
import { isMessageProcessed, markMessageProcessed, resolveLidToPhone, storeLidMapping, getSentMessageContext, deleteSentMessageContext } from '@/lib/infra/redis';
import { enqueueMessage } from '@/lib/queues/message-queue';
import { enqueueDeliveryRetry } from '@/lib/queues/delivery-retry-queue';
import { WhatsAppMetrics } from '@/lib/infra/metrics';
import { recordAlert } from '@/lib/services/alerts/alert.service';
import { findOrCreateChat, findOrCreateCustomer, saveMessage } from '@/lib/services/chat.service';
import { checkPhoneRateLimit } from '@/lib/infra/rate-limit';
import { withTimeout, TimeoutError } from '@/lib/utils/async.utils';
import { WebhookMetrics } from '@/lib/infra/metrics';
import { RateLimitError, wrapError } from '@/lib/errors';
import { getConnectedPhoneNumber } from '@/lib/services/evolution/evolution-instance.service';
import { db, salons, chats, chatStatusEnum, messages, agents, eq, and, desc, sql } from '@repo/db';

// Timeout - webhook deve apenas validar e enfileirar
export const maxDuration = 10;

// Timeouts para operações (em ms) - mantém margem dentro do maxDuration de 10s
const DB_TIMEOUT = 3000; // 3 segundos (reduzido de 5s para dar margem)
const REDIS_TIMEOUT = 2000; // 2 segundos

// Token secreto para validar payloads (opcional mas recomendado)
const WEBHOOK_SECRET = process.env.EVOLUTION_WEBHOOK_TOKEN || '';

function ensureJid(value: string): string {
  return value.includes('@') ? value : `${value}@s.whatsapp.net`;
}

/**
 * Handler principal do webhook Evolution API
 */
export async function POST(req: NextRequest) {
  const ctx = createRequestContext();
  let reqLogger = createContextLogger({ requestId: ctx.requestId });

  // Registra métrica de recebimento
  WebhookMetrics.received();

  try {
    // 0. VERIFICAR TOKEN DE AUTENTICAÇÃO (se configurado)
    if (WEBHOOK_SECRET) {
      const receivedToken = req.headers.get('x-webhook-secret') || req.headers.get('authorization');
      if (receivedToken !== WEBHOOK_SECRET && receivedToken !== `Bearer ${WEBHOOK_SECRET}`) {
        reqLogger.warn({ hasToken: !!receivedToken }, 'Webhook authentication failed');
        WebhookMetrics.error('auth_failed');
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
    }

    // 1. PARSEAR JSON BODY (Evolution API usa JSON; pode ser objeto ou array em batch)
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      reqLogger.warn('Invalid JSON body');
      WebhookMetrics.error('invalid_json');
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    const payloads = Array.isArray(body) ? body : [body];

    for (const rawPayload of payloads) {
      try {
        const validationResult = EvolutionWebhookSchema.safeParse(rawPayload);
        if (!validationResult.success) {
          reqLogger.error(
            { errors: validationResult.error.issues, rawEvent: (rawPayload as any)?.event },
            'Schema validation failed'
          );
          WebhookMetrics.error('schema_validation');
          // Payload malformado: re-tentar não ajuda (mantém 200), mas precisa ficar
          // visível — uma mudança de formato da Evolution dropa mensagens em silêncio.
          void recordAlert({
            scope: 'global',
            type: 'webhook_schema_validation',
            severity: 'warning',
            title: 'Payload do webhook falhou na validação de schema',
            detail: { rawEvent: (rawPayload as any)?.event },
          });
          continue;
        }

        const data = validationResult.data;

        const payloadLogger = reqLogger.child({
          event: data.event,
          instance: data.instance,
        });

        switch (data.event) {
          case 'messages.upsert':
            await handleMessageUpsert(data as any, payloadLogger, ctx);
            break;
          case 'messages.update':
            await handleMessageUpdate(data as any, payloadLogger, ctx);
            break;
          case 'connection.update':
            await handleConnectionUpdate(data as any, payloadLogger, ctx);
            break;
          case 'qrcode.updated':
            await handleQRCodeUpdate(data as any, payloadLogger, ctx);
            break;
          default:
            payloadLogger.debug({ event: data.event }, 'Ignoring unknown event');
        }
      } catch (payloadError) {
        // Falha transitória (timeout de DB/Redis, enqueue, etc.) ao processar um
        // evento. NÃO engolir com 200 — re-lança para o catch externo retornar 500
        // e a Evolution RE-TENTAR. A idempotência (jobId=messageId + dedup) garante
        // que o reprocessamento não duplica.
        reqLogger.error({ err: payloadError, rawEvent: (rawPayload as any)?.event }, 'Transient error processing webhook payload — will signal retry');
        void recordAlert({
          scope: 'global',
          type: 'webhook_processing_error',
          severity: 'critical',
          title: 'Erro transitório ao processar evento do webhook (sinalizando retry)',
          detail: { rawEvent: (rawPayload as any)?.event, error: payloadError instanceof Error ? payloadError.message : String(payloadError) },
        });
        throw payloadError;
      }
    }

    return NextResponse.json({ status: 'ok' }, { status: 200 });
  } catch (error) {
    const duration = getDuration(ctx);

    // Tratamento especial para timeout
    if (error instanceof TimeoutError) {
      reqLogger.error({ err: error, duration }, 'Operation timed out');
      WebhookMetrics.error('timeout');
      return NextResponse.json({ error: 'Timeout' }, { status: 500 });
    }

    const wrappedError = wrapError(error);

    reqLogger.error(
      {
        err: wrappedError,
        code: (wrappedError as any).code,
        duration,
      },
      'Error processing webhook'
    );

    WebhookMetrics.error('processing_error');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * Handler para evento messages.upsert (mensagem recebida)
 */
async function handleMessageUpsert(
  data: any,
  reqLogger: ReturnType<typeof createContextLogger>,
  ctx: ReturnType<typeof createRequestContext>
) {
  const messageData = data.data;
  const instanceName = data.instance;

  // Ignora mensagens enviadas por nós (fromMe = true)
  if (messageData.key.fromMe) {
    reqLogger.debug('Ignoring message from self');
    return NextResponse.json({ status: 'ignored' }, { status: 200 });
  }

  const messageId = messageData.key.id;
  const remoteJid = messageData.key.remoteJid;

  // Stage timer: mede o tempo gasto em cada etapa do webhook.
  // Um log final agregado por messageId permite correlacionar com o worker.
  const timer = new StageTimer('webhook', { messageId, instanceName });

  // Ignora mensagens de grupos (@g.us)
  if (remoteJid.endsWith('@g.us')) {
    reqLogger.info({ remoteJid }, 'Ignoring group message');
    return NextResponse.json({ status: 'ignored_group' }, { status: 200 });
  }

  // Extrai número de telefone do formato Evolution (5511999999999@s.whatsapp.net)
  // IMPORTANTE: WhatsApp Business usa LIDs (@lid) em vez do número real p/ alguns contatos.
  // A Evolution ALTERNA qual campo carrega o quê entre versões:
  //   v2.3.x: key.remoteJid = <lid>@lid            | remoteJidAlt = <fone>@s.whatsapp.net
  //   v2.4.0: key.remoteJid = <fone>@s.whatsapp.net | remoteJidAlt = <lid>@lid
  // Por isso NÃO confiamos na POSIÇÃO do campo — identificamos cada um pelo SUFIXO do JID.
  // - Para RESPONDER: ecoa o remoteJid de entrada (preserva o roteamento da sessão Signal).
  // - Para o BANCO (clientPhone): sempre o número real; um @lid NUNCA deve virar "telefone".
  const remoteJidAlt = messageData.key.remoteJidAlt || messageData.remoteJidAlt || data.remoteJidAlt;
  const addressingMode = getAddressingMode(remoteJid);

  const candidateJids = [remoteJid, remoteJidAlt].filter(
    (j): j is string => typeof j === 'string' && j.length > 0
  );
  const lidJid = candidateJids.find((j) => j.endsWith('@lid')) ?? null;
  const phoneJid = candidateJids.find((j) => !j.endsWith('@lid')) ?? null;

  // Keep reply addressing exactly as inbound remoteJid to preserve Signal session routing.
  const replyToJid: string = remoteJid;
  let clientPhone: string;

  timer.mark('parsed');

  if (phoneJid) {
    // Número real veio direto no payload (caso comum; e o formato da v2.4.0).
    clientPhone = extractPhoneNumber(phoneJid);
    // Se o @lid também veio, registra o mapeamento LID -> telefone p/ resoluções futuras.
    if (lidJid) {
      await storeLidMapping(lidJid.split('@')[0], ensureJid(phoneJid), instanceName);
      reqLogger.info({ remoteJid, remoteJidAlt, clientPhone }, 'Phone resolved from payload; LID mapping stored');
    }
  } else if (lidJid) {
    // Só veio o @lid (sem telefone no payload): resolve por cache / campos auxiliares.
    const lid = lidJid.split('@')[0];
    const senderPn = messageData.senderPn || data.senderPn;
    const participant = messageData.key.participant || messageData.participant;
    const participantPn = (messageData as any).participant_pn || (data as any).participant_pn;

    const cachedPhone = await resolveLidToPhone(lid, instanceName);

    if (cachedPhone) {
      clientPhone = extractPhoneNumber(cachedPhone);
      reqLogger.info({ remoteJid, cachedPhone, clientPhone }, 'LID resolved from Redis cache');
    } else if (senderPn && !senderPn.includes(lid)) {
      const normalizedSenderPn = ensureJid(senderPn);
      clientPhone = extractPhoneNumber(normalizedSenderPn);
      await storeLidMapping(lid, normalizedSenderPn, instanceName);
      reqLogger.info({ remoteJid, senderPn: normalizedSenderPn, clientPhone }, 'Using senderPn field and storing LID mapping');
    } else if (participantPn) {
      const normalizedParticipantPn = ensureJid(participantPn);
      clientPhone = extractPhoneNumber(normalizedParticipantPn);
      await storeLidMapping(lid, normalizedParticipantPn, instanceName);
      reqLogger.info({ remoteJid, participantPn: normalizedParticipantPn, clientPhone }, 'Using participant_pn field and storing LID mapping');
    } else if (participant && !participant.includes('@lid')) {
      const normalizedParticipant = ensureJid(participant);
      clientPhone = extractPhoneNumber(normalizedParticipant);
      await storeLidMapping(lid, normalizedParticipant, instanceName);
      reqLogger.info({ remoteJid, participant: normalizedParticipant, clientPhone }, 'Using participant field and storing LID mapping');
    } else {
      clientPhone = lid;
      reqLogger.error(
        { remoteJid, remoteJidAlt, pushName: messageData.pushName, instanceName },
        'LID NOT RESOLVED - using LID as fallback client identifier'
      );
    }
  } else {
    // Sem @lid e sem telefone identificável (fallback defensivo).
    clientPhone = extractPhoneNumber(remoteJid);
  }

  reqLogger = reqLogger.child({
    messageId,
    from: hashPhone(clientPhone),
    remoteJid,
    remoteJidAlt,
    addressingMode,
    instanceName,
    replica: getReplicaId(),
    hasMedia: hasMedia(messageData),
  });

  timer.mark('lid_resolved');

  // 1. VERIFICAR IDEMPOTÊNCIA (com timeout)
  const isProcessed = await withTimeout(
    isMessageProcessed(messageId),
    REDIS_TIMEOUT,
    'isMessageProcessed'
  );

  timer.mark('dedup_checked');

  if (isProcessed) {
    reqLogger.info('Duplicate message, skipping');
    WebhookMetrics.duplicate();
    timer.flush(reqLogger, { outcome: 'duplicate' });
    return NextResponse.json({ status: 'ok' }, { status: 200 });
  }

  // 2. RATE LIMITING (antes de qualquer operação pesada)
  try {
    await withTimeout(
      checkPhoneRateLimit(clientPhone),
      REDIS_TIMEOUT,
      'checkPhoneRateLimit'
    );
  } catch (error) {
    if (error instanceof RateLimitError) {
      reqLogger.warn(
        { resetIn: (error as any).resetIn },
        'Rate limit exceeded at webhook level'
      );
      WebhookMetrics.rateLimited({ phone: hashPhone(clientPhone) });
      timer.flush(reqLogger, { outcome: 'rate_limited' });
      // Retorna 200 para não causar retry
      return NextResponse.json({ status: 'ok' }, { status: 200 });
    }
    throw error;
  }

  timer.mark('rate_limit_checked');

  // 3. BUSCAR AGENTE/SALÃO PELA INSTÂNCIA (dual-path: agent-first, salon-fallback)
  // PRO/Enterprise: instâncias nomeadas agent-{agentId} -> busca direto no agents
  // SOLO: instâncias nomeadas salon-{salonId} -> busca no salons, depois agente ativo
  let salonId: string;
  let agentId: string;
  // Provider do número — usado no guard anti double-delivery (Coexistência) abaixo.
  let messagingProvider: string | null = null;

  const agentByInstance = await withTimeout(
    db.query.agents.findFirst({
      where: eq(agents.evolutionInstanceName, instanceName),
      columns: { id: true, salonId: true, messagingProvider: true },
    }),
    DB_TIMEOUT,
    'findAgentByInstance'
  );

  if (agentByInstance) {
    // Agent-level instance (PRO/Enterprise)
    salonId = agentByInstance.salonId;
    agentId = agentByInstance.id;
    messagingProvider = agentByInstance.messagingProvider;
  } else {
    // Salon-level instance fallback (SOLO)
    const salon = await withTimeout(
      db.query.salons.findFirst({
        where: eq(salons.evolutionInstanceName, instanceName),
        columns: { id: true },
      }),
      DB_TIMEOUT,
      'findSalonByInstance'
    );

    if (!salon) {
      reqLogger.error({ instanceName }, 'No salon or agent found for instance');
      WebhookMetrics.error('salon_not_found');
      // Instância órfã (ref no banco aponta p/ instância inexistente). Visível em vez de mudo.
      void recordAlert({
        scope: 'global',
        type: 'instance_not_mapped',
        severity: 'critical',
        title: `Instância sem salão/agente: ${instanceName}`,
        detail: { instanceName },
      });
      return NextResponse.json({ status: 'ok' }, { status: 200 });
    }

    salonId = salon.id;

    const activeAgent = await withTimeout(
      db.query.agents.findFirst({
        where: and(
          eq(agents.salonId, salonId),
          eq(agents.isActive, true)
        ),
        columns: { id: true, messagingProvider: true },
      }),
      DB_TIMEOUT,
      'findActiveAgent'
    );

    if (!activeAgent) {
      reqLogger.error({ salonId }, 'No active agent for salon');
      WebhookMetrics.error('no_active_agent');
      // Persiste a mensagem (recuperável/visível no painel) + alerta o salão, em vez
      // de descartar mudo. Best-effort: nunca lança (não queremos 500/retry aqui — um
      // retry não torna o agente ativo). A IA não responde até reativarem o agente.
      try {
        const chat = await withTimeout(findOrCreateChat(clientPhone, salonId), DB_TIMEOUT, 'findOrCreateChat');
        await withTimeout(saveMessage(chat.id, 'user', extractMessageContent(messageData)), DB_TIMEOUT, 'saveMessage');
      } catch (persistErr) {
        reqLogger.warn({ err: persistErr }, 'Failed to persist inbound message on no-active-agent path');
      }
      void recordAlert({
        scope: 'salon',
        salonId,
        type: 'no_active_agent',
        severity: 'critical',
        title: 'Mensagem recebida mas nenhum agente está ativo — cliente sem resposta',
        detail: { instanceName },
      });
      return NextResponse.json({ status: 'ok' }, { status: 200 });
    }

    agentId = activeAgent.id;
    messagingProvider = activeAgent.messagingProvider;
  }

  // Defesa em profundidade (Coexistência / migração p/ Cloud): se este número já
  // é servido pela Cloud API, a Evolution NÃO deve responder — senão o cliente
  // recebe resposta DUPLA (a Cloud processa o mesmo inbound, e o dedup por
  // messageId não cruza canais: wamid != Baileys key.id). Descarta + alerta.
  if (messagingProvider === 'cloud') {
    reqLogger.warn(
      { instanceName, salonId, agentId },
      'Evolution inbound ignorado: número está na Cloud API (anti double-delivery)'
    );
    WebhookMetrics.error('evolution_on_cloud');
    void recordAlert({
      scope: 'salon',
      salonId,
      type: 'evolution_inbound_on_cloud',
      severity: 'warning',
      title: 'Mensagem chegou pela Evolution, mas o número está na Cloud API (Coexistência) — ignorada para evitar resposta dupla',
      detail: { instanceName },
    });
    return NextResponse.json({ status: 'ignored' }, { status: 200 });
  }

  reqLogger = reqLogger.child({ salonId, agentId });
  timer.mark('agent_resolved');

  // 4. PARALELO: Buscar customer e chat. checkIfNewCustomer (que chama IA)
  //    foi movido para o worker para nao segurar o webhook.
  const [customer, chat] = await Promise.all([
    withTimeout(
      findOrCreateCustomer(clientPhone, salonId, messageData.pushName),
      DB_TIMEOUT,
      'findOrCreateCustomer'
    ),
    withTimeout(
      findOrCreateChat(clientPhone, salonId, agentId),
      DB_TIMEOUT,
      'findOrCreateChat'
    ),
  ]);

  timer.mark('customer_chat_resolved');

  reqLogger = reqLogger.child({
    chatId: chat.id,
    customerId: customer.id,
  });

  // 5. EXTRAIR CONTEÚDO DA MENSAGEM
  const messageContent = extractMessageContent(messageData);
  const mediaType = detectMediaType(messageData);
  const mediaUrl = extractMediaUrl(messageData);

  // 8. SALVAR MENSAGEM RAW NO BANCO (com timeout)
  const userMessageId = await withTimeout(
    saveMessage(chat.id, 'user', messageContent, hasMedia(messageData) && mediaType ? { mediaType } : undefined),
    DB_TIMEOUT,
    'saveMessage'
  );
  reqLogger.debug('Message saved to database');

  timer.mark('message_saved');

  // 9. ENFILEIRAR PROCESSAMENTO (com timeout)
  // Enfileira ANTES de marcar processado. A idempotência é garantida por
  // jobId=messageId (BullMQ colapsa duplicatas) + o dedup do topo. Se enqueue
  // falhar, NÃO marcamos processado e o erro sobe -> 500 -> Evolution re-tenta.
  // Antes a ordem era invertida e um crash entre marcar e enfileirar perdia a
  // mensagem para sempre (dedup bloqueava o retry).
  await withTimeout(
    enqueueMessage({
      messageId,
      userMessageId,
      chatId: chat.id,
      salonId,
      agentId,
      customerId: customer.id,
      instanceName,
      clientPhone,
      remoteJid,
      remoteJidAlt: remoteJidAlt ?? undefined,
      addressingMode,
      replyToJid, // JID original para responder (pode ser LID ou número)
      body: messageContent,
      hasMedia: hasMedia(messageData),
      mediaType: mediaType ?? undefined,
      mediaUrl: mediaUrl ?? undefined,
      receivedAt: new Date(messageData.messageTimestamp * 1000).toISOString(),
      profileName: messageData.pushName,
      // isNewCustomer agora e calculado no worker (era 100-500ms de IA dentro do webhook)
      customerName: customer.name,
    }),
    REDIS_TIMEOUT,
    'enqueueMessage'
  );

  timer.mark('enqueued');

  // 10. MARCAR COMO PROCESSADO (somente após enqueue durável bem-sucedido)
  await withTimeout(
    markMessageProcessed(messageId),
    REDIS_TIMEOUT,
    'markMessageProcessed'
  );

  timer.mark('marked_processed');

  const duration = getDuration(ctx);

  // Registra métricas de sucesso
  WebhookMetrics.enqueued({ salonId });
  WebhookMetrics.latency(duration);

  // Emite log agregado com breakdown por stage (busque por messageId para ver end-to-end)
  timer.flush(reqLogger, { outcome: 'enqueued', salonId, chatId: chat.id });

  return NextResponse.json({ status: 'ok' }, { status: 200 });
}

/**
 * Handler para evento messages.update (status de entrega de uma mensagem ENVIADA).
 *
 * Só nos interessam mensagens nossas (fromMe:true):
 * - status:0 (ERROR)  -> a entrega falhou silenciosamente; dispara a escala de
 *   reenvio (reenvia -> reinicia -> reenvia -> manual) via fila dedicada.
 * - status>=2 (entregue/lido) -> marca como entregue e para de rastrear.
 *
 * O webhook só valida e enfileira (maxDuration 10s); a escala roda no worker.
 */
async function handleMessageUpdate(
  data: any,
  reqLogger: ReturnType<typeof createContextLogger>,
  ctx: ReturnType<typeof createRequestContext>
) {
  const instanceName = data.instance;
  const parsed = MessagesUpdateDataSchema.safeParse(data.data);
  if (!parsed.success) {
    reqLogger.debug({ errors: parsed.error.issues }, 'messages.update payload not parseable, ignoring');
    return NextResponse.json({ status: 'ok' }, { status: 200 });
  }

  const upd = parsed.data;
  // Só mensagens enviadas por nós carregam status de entrega que nos interessa.
  if (!upd.key.fromMe) {
    return NextResponse.json({ status: 'ok' }, { status: 200 });
  }

  const messageId = upd.key.id;
  const status = normalizeAckStatus(upd.update?.status ?? upd.status);

  // SUCESSO: entregue/lido -> marca entregue e para de rastrear.
  if (status !== null && status >= MessageAckStatus.SERVER_ACK) {
    const sent = await withTimeout(getSentMessageContext(messageId, instanceName), REDIS_TIMEOUT, 'getSentMessageContext').catch(() => null);
    if (sent) {
      await withTimeout(deleteSentMessageContext(messageId, instanceName), REDIS_TIMEOUT, 'deleteSentMessageContext').catch(() => {});
      if (sent.rootMessageId) {
        await withTimeout(
          db.update(messages).set({ deliveryStatus: 'delivered' }).where(eq(messages.providerMessageId, sent.rootMessageId)),
          DB_TIMEOUT,
          'markDelivered'
        ).catch((err) => reqLogger.warn({ err }, 'Failed to mark message delivered'));
      }
      if (sent.attempt > 1) {
        // A entrega só funcionou depois de um reenvio -> recuperação bem-sucedida.
        WhatsAppMetrics.deliveryRecovered({ instanceName, attempts: sent.attempt });
      }
    }
    return NextResponse.json({ status: 'ok' }, { status: 200 });
  }

  // FALHA: status:0 (ERROR) -> dispara a escala.
  if (status === MessageAckStatus.ERROR) {
    const sent = await withTimeout(getSentMessageContext(messageId, instanceName), REDIS_TIMEOUT, 'getSentMessageContext').catch(() => null);
    if (!sent) {
      // Não é uma mensagem rastreada (ou já tratada/expirada) — ignora.
      reqLogger.debug({ messageId }, 'status:0 for untracked/expired message — ignoring');
      return NextResponse.json({ status: 'ok' }, { status: 200 });
    }

    WhatsAppMetrics.deliveryFailed({ instanceName, ladderStep: sent.attempt });

    if (sent.rootMessageId) {
      await withTimeout(
        db.update(messages).set({ deliveryStatus: 'failed', deliveryAttempts: sent.attempt }).where(eq(messages.providerMessageId, sent.rootMessageId)),
        DB_TIMEOUT,
        'markFailed'
      ).catch((err) => reqLogger.warn({ err }, 'Failed to mark message failed'));
    }

    await withTimeout(
      enqueueDeliveryRetry({
        failedMessageId: messageId,
        rootMessageId: sent.rootMessageId,
        chatId: sent.chatId,
        salonId: sent.salonId,
        agentId: sent.agentId,
        instanceName,
        recipientJid: sent.sendTo,
        originalText: sent.text,
        attempt: sent.attempt,
      }),
      REDIS_TIMEOUT,
      'enqueueDeliveryRetry'
    ).catch((err) => reqLogger.error({ err }, 'Failed to enqueue delivery retry'));

    // Consome o contexto: o job já carrega tudo, e isso dedup-a um status:0 duplicado.
    await withTimeout(deleteSentMessageContext(messageId, instanceName), REDIS_TIMEOUT, 'deleteSentMessageContext').catch(() => {});

    reqLogger.info(
      { messageId, ladderStep: sent.attempt, chatId: sent.chatId },
      'Outbound delivery failed (status:0) — escalation enqueued'
    );
    return NextResponse.json({ status: 'ok' }, { status: 200 });
  }

  // PENDING (1) ou status desconhecido — ignora.
  return NextResponse.json({ status: 'ok' }, { status: 200 });
}

/**
 * Handler para evento connection.update (mudança de status de conexão)
 */
async function handleConnectionUpdate(
  data: any,
  reqLogger: ReturnType<typeof createContextLogger>,
  ctx: ReturnType<typeof createRequestContext>
) {
  const instanceName = data.instance;
  const connectionData = data.data;
  const statusReason =
    typeof connectionData.statusReason === 'number' || typeof connectionData.statusReason === 'string'
      ? String(connectionData.statusReason)
      : undefined;

  // Mapeia status da Evolution API para nosso enum
  const status = mapConnectionState(connectionData.state);

  reqLogger = reqLogger.child({
    instanceName,
    evolutionState: connectionData.state,
    statusReason,
    mappedStatus: status,
    replica: getReplicaId(),
  });

  try {
    WebhookMetrics.connectionUpdate(status, { instanceName, ...(statusReason ? { statusReason } : {}) });
    if (status === 'closed' || status === 'disconnected') {
      WebhookMetrics.connectionAnomaly(status, { instanceName, ...(statusReason ? { statusReason } : {}) });
    }

    // Dual-path: check if this is an agent-level instance first
    const agentByInstance = await withTimeout(
      db.query.agents.findFirst({
        where: eq(agents.evolutionInstanceName, instanceName),
        columns: { id: true, salonId: true },
      }),
      DB_TIMEOUT,
      'findAgentByInstance'
    );

    if (agentByInstance) {
      // Agent-level instance (PRO/Enterprise) - update only this agent
      const agentUpdatePayload: Record<string, unknown> = {
        evolutionConnectionStatus: status,
        updatedAt: new Date(),
      };

      if (status === 'connected') {
        agentUpdatePayload.evolutionConnectedAt = new Date();
        agentUpdatePayload.whatsappStatus = 'verified';
        agentUpdatePayload.whatsappVerifiedAt = new Date();
        agentUpdatePayload.whatsappConnectedAt = new Date();

        try {
          const phoneNumber = await getConnectedPhoneNumber(instanceName);
          if (phoneNumber) {
            agentUpdatePayload.whatsappNumber = phoneNumber;
          }
        } catch (err) {
          reqLogger.warn({ err }, 'Could not fetch connected phone number for agent');
        }
      }

      await withTimeout(
        db
          .update(agents)
          .set(agentUpdatePayload as any)
          .where(eq(agents.id, agentByInstance.id)),
        DB_TIMEOUT,
        'updateAgentConnectionStatus'
      );
    } else {
      // Salon-level instance fallback (SOLO) - update salon + all agents
      await withTimeout(
        db
          .update(salons)
          .set({
            evolutionConnectionStatus: status,
            ...(status === 'connected' ? { evolutionConnectedAt: new Date() } : {}),
            updatedAt: new Date(),
          })
          .where(eq(salons.evolutionInstanceName, instanceName)),
        DB_TIMEOUT,
        'updateSalonConnectionStatus'
      );

      if (status === 'connected') {
        const salon = await withTimeout(
          db.query.salons.findFirst({
            where: eq(salons.evolutionInstanceName, instanceName),
            columns: { id: true },
          }),
          DB_TIMEOUT,
          'findSalonByInstance'
        );

        if (salon) {
          let phoneNumber: string | null = null;
          try {
            phoneNumber = await getConnectedPhoneNumber(instanceName);
          } catch (err) {
            reqLogger.warn({ err }, 'Could not fetch connected phone number');
          }

          const updatePayload: Record<string, unknown> = {
            whatsappStatus: 'verified',
            whatsappVerifiedAt: new Date(),
            whatsappConnectedAt: new Date(),
            updatedAt: new Date(),
          };
          if (phoneNumber) {
            updatePayload.whatsappNumber = phoneNumber;
          }

          await withTimeout(
            db
              .update(agents)
              .set(updatePayload as any)
              .where(eq(agents.salonId, salon.id)),
            DB_TIMEOUT,
            'updateAgentsStatus'
          );
        }
      }
    }

    reqLogger.info('Connection status updated');

    return NextResponse.json({ status: 'ok' }, { status: 200 });
  } catch (error) {
    reqLogger.error({ err: error }, 'Failed to update connection status');
    throw error;
  }
}

/**
 * Handler para evento qrcode.updated (QR code atualizado)
 */
async function handleQRCodeUpdate(
  data: any,
  reqLogger: ReturnType<typeof createContextLogger>,
  ctx: ReturnType<typeof createRequestContext>
) {
  const instanceName = data.instance;
  const qrcode = data.data.qrcode;

  reqLogger = reqLogger.child({ instanceName });

  try {
    // Importa getRedisClient dinamicamente para evitar circular dependency
    const { getRedisClient } = await import('@/lib/infra/redis');
    const redisClient = getRedisClient();

    // Armazena QR code no cache por 5 minutos (com timeout)
    await withTimeout(
      redisClient.setex(`evolution:qrcode:${instanceName}`, 300, qrcode),
      REDIS_TIMEOUT,
      'storeQRCode'
    );

    reqLogger.info('QR code updated and cached');

    return NextResponse.json({ status: 'ok' }, { status: 200 });
  } catch (error) {
    reqLogger.error({ err: error }, 'Failed to store QR code');
    // Não falha - QR code é opcional
    return NextResponse.json({ status: 'ok' }, { status: 200 });
  }
}

