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
  detectMediaType,
  hasMedia,
  extractMediaUrl,
  mapConnectionState,
} from '@/lib/schemas/evolution';
import { logger, createContextLogger, hashPhone, createRequestContext, getDuration } from '@/lib/logger';
import { isMessageProcessed, markMessageProcessed, resolveLidToPhone, storeLidMapping } from '@/lib/redis';
import { enqueueMessage } from '@/lib/queues/message-queue';
import { findOrCreateChat, findOrCreateCustomer, saveMessage } from '@/lib/services/chat.service';
import { checkIfNewCustomer } from '@/lib/services/ai/generate-response.service';
import { checkPhoneRateLimit } from '@/lib/rate-limit';
import { withTimeout, TimeoutError } from '@/lib/utils/async.utils';
import { WebhookMetrics } from '@/lib/metrics';
import { RateLimitError, wrapError } from '@/lib/errors';
import { getConnectedPhoneNumber } from '@/lib/services/evolution-instance.service';
import { db, salons, chats, chatStatusEnum, messages, agents, eq, and, desc, sql } from '@repo/db';

// Timeout - webhook deve apenas validar e enfileirar
export const maxDuration = 10;

// Timeouts para operações (em ms)
const DB_TIMEOUT = 5000; // 5 segundos
const REDIS_TIMEOUT = 2000; // 2 segundos

/**
 * Handler principal do webhook Evolution API
 */
export async function POST(req: NextRequest) {
  const ctx = createRequestContext();
  let reqLogger = createContextLogger({ requestId: ctx.requestId });

  // Registra métrica de recebimento
  WebhookMetrics.received();

  try {
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
        reqLogger.warn({ err: payloadError, rawPayload }, 'Error processing webhook payload');
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

  // Ignora mensagens de grupos (@g.us)
  if (remoteJid.endsWith('@g.us')) {
    reqLogger.info({ remoteJid }, 'Ignoring group message');
    return NextResponse.json({ status: 'ignored_group' }, { status: 200 });
  }

  // Extrai número de telefone do formato Evolution (5511999999999@s.whatsapp.net)
  // IMPORTANTE: WhatsApp Business às vezes usa LIDs (@lid) em vez de números reais
  // - remoteJid pode ser: 5511999999999@s.whatsapp.net (normal) ou 123456789@lid (LID)
  // - Para RESPONDER: usar remoteJid diretamente (Evolution API faz o roteamento)
  // - Para BANCO: usar senderPn (número real) se disponível, senão usar o número do LID
  let clientPhone: string;
  let replyToJid: string = remoteJid; // Sempre usar remoteJid para responder

  if (remoteJid.endsWith('@lid')) {
    // LID detectado - tentar resolver para número real
    const lid = remoteJid.split('@')[0];
    const instanceName = data.instance;

    // 1. Primeiro, verificar cache Redis
    const cachedPhone = await resolveLidToPhone(lid, instanceName);
    if (cachedPhone) {
      clientPhone = extractPhoneNumber(cachedPhone);
      replyToJid = cachedPhone;
      reqLogger.info({ remoteJid, cachedPhone, clientPhone }, 'LID resolved from Redis cache');
    } else {
      // 2. Tentar extrair de campos do payload
      const senderPn = messageData.senderPn || data.senderPn;
      const participant = messageData.key.participant || messageData.participant;
      const participantPn = (messageData as any).participant_pn || (data as any).participant_pn;

      // DEBUG: Log campos disponíveis
      reqLogger.debug({
        remoteJid,
        senderPn,
        participant,
        participantPn,
        dataSender: data.sender,
        pushName: messageData.pushName,
        messageDataKeys: Object.keys(messageData),
      }, 'LID detected - checking available fields');

      if (senderPn && !senderPn.includes(lid)) {
        // senderPn tem o formato: 5511999999999@s.whatsapp.net
        clientPhone = extractPhoneNumber(senderPn);
        replyToJid = senderPn;
        // Armazenar mapeamento para uso futuro
        await storeLidMapping(lid, senderPn, instanceName);
        reqLogger.info({ remoteJid, senderPn, clientPhone }, 'Using senderPn field and storing LID mapping');
      } else if (participantPn) {
        clientPhone = extractPhoneNumber(participantPn);
        replyToJid = participantPn.includes('@') ? participantPn : `${participantPn}@s.whatsapp.net`;
        await storeLidMapping(lid, replyToJid, instanceName);
        reqLogger.info({ remoteJid, participantPn, clientPhone }, 'Using participant_pn field and storing LID mapping');
      } else if (participant && !participant.includes('@lid')) {
        clientPhone = extractPhoneNumber(participant);
        replyToJid = participant;
        await storeLidMapping(lid, replyToJid, instanceName);
        reqLogger.info({ remoteJid, participant, clientPhone }, 'Using participant field and storing LID mapping');
      } else {
        // Fallback: usar o próprio LID como identificador
        // ATENÇÃO: Não será possível enviar mensagens para este contato!
        clientPhone = lid;
        reqLogger.error({
          remoteJid,
          pushName: messageData.pushName,
          instanceName,
        }, 'LID NOT RESOLVED - Cannot send messages to this contact. Manual mapping required.');
      }
    }
  } else {
    clientPhone = extractPhoneNumber(remoteJid);
  }

  reqLogger = reqLogger.child({
    messageId,
    from: hashPhone(clientPhone),
    hasMedia: hasMedia(messageData),
  });

  // 1. VERIFICAR IDEMPOTÊNCIA (com timeout)
  const isProcessed = await withTimeout(
    isMessageProcessed(messageId),
    REDIS_TIMEOUT,
    'isMessageProcessed'
  );

  if (isProcessed) {
    reqLogger.info('Duplicate message, skipping');
    WebhookMetrics.duplicate();
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
      // Retorna 200 para não causar retry
      return NextResponse.json({ status: 'ok' }, { status: 200 });
    }
    throw error;
  }

  // 3. BUSCAR SALÃO PELA INSTÂNCIA (com timeout)
  const salon = await withTimeout(
    db.query.salons.findFirst({
      where: eq(salons.evolutionInstanceName, instanceName),
      columns: { id: true },
    }),
    DB_TIMEOUT,
    'findSalonByInstance'
  );

  if (!salon) {
    reqLogger.error({ instanceName }, 'Salon not found for instance');
    WebhookMetrics.error('salon_not_found');
    return NextResponse.json({ status: 'ok' }, { status: 200 });
  }

  const salonId = salon.id;
  reqLogger = reqLogger.child({ salonId });

  // 4. BUSCAR AGENTE ATIVO DO SALÃO (com timeout)
  const agent = await withTimeout(
    db.query.agents.findFirst({
      where: and(
        eq(agents.salonId, salonId),
        eq(agents.isActive, true)
      ),
      columns: { id: true },
    }),
    DB_TIMEOUT,
    'findActiveAgent'
  );

  if (!agent) {
    reqLogger.error({ salonId }, 'No active agent for salon');
    return NextResponse.json({ status: 'ok' }, { status: 200 });
  }

  const agentId = agent.id;
  reqLogger = reqLogger.child({ agentId });

  // 5. CRIAR/BUSCAR CUSTOMER E CHAT (com timeouts)
  const customer = await withTimeout(
    findOrCreateCustomer(clientPhone, salonId, messageData.pushName),
    DB_TIMEOUT,
    'findOrCreateCustomer'
  );

  const chat = await withTimeout(
    findOrCreateChat(clientPhone, salonId),
    DB_TIMEOUT,
    'findOrCreateChat'
  );

  reqLogger = reqLogger.child({
    chatId: chat.id,
    customerId: customer.id,
  });

  // 6. EXTRAIR CONTEÚDO DA MENSAGEM
  const messageContent = extractMessageContent(messageData);
  const mediaType = detectMediaType(messageData);
  const mediaUrl = extractMediaUrl(messageData);

  // 7. VERIFICAR SE É CLIENTE NOVO (com timeout)
  const isNewCustomer = await withTimeout(
    checkIfNewCustomer(salonId, clientPhone),
    DB_TIMEOUT,
    'checkIfNewCustomer'
  );

  // 8. SALVAR MENSAGEM RAW NO BANCO (com timeout)
  await withTimeout(
    saveMessage(chat.id, 'user', messageContent),
    DB_TIMEOUT,
    'saveMessage'
  );
  reqLogger.debug('Message saved to database');

  // 9. ENFILEIRAR PROCESSAMENTO (com timeout)
  await withTimeout(
    enqueueMessage({
      messageId,
      chatId: chat.id,
      salonId,
      agentId,
      customerId: customer.id,
      clientPhone,
      replyToJid, // JID original para responder (pode ser LID ou número)
      body: messageContent,
      hasMedia: hasMedia(messageData),
      mediaType: mediaType ?? undefined,
      mediaUrl: mediaUrl ?? undefined,
      receivedAt: new Date(messageData.messageTimestamp * 1000).toISOString(),
      profileName: messageData.pushName,
      isNewCustomer,
      customerName: customer.name,
    }),
    REDIS_TIMEOUT,
    'enqueueMessage'
  );

  // 10. MARCAR COMO PROCESSADO (idempotência, com timeout)
  await withTimeout(
    markMessageProcessed(messageId),
    REDIS_TIMEOUT,
    'markMessageProcessed'
  );

  const duration = getDuration(ctx);

  // Registra métricas de sucesso
  WebhookMetrics.enqueued({ salonId });
  WebhookMetrics.latency(duration);

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

  // Mapeia status da Evolution API para nosso enum
  const status = mapConnectionState(connectionData.state);

  reqLogger = reqLogger.child({
    instanceName,
    evolutionState: connectionData.state,
    mappedStatus: status,
  });

  try {
    // Atualiza status de conexão do salão (com timeout)
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

    // Se conectado, busca número da Evolution e atualiza agents
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
    const { getRedisClient } = await import('@/lib/redis');
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
