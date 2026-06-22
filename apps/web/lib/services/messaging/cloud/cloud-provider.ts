/**
 * CloudProvider — envio via WhatsApp Cloud API (Graph API da Meta).
 *
 * Implementa a mesma interface MessageProvider que o EvolutionProvider, então
 * entra ao lado dele sem mexer no pipeline. O `phone_number_id` e o token vêm
 * da config (hoje via env, no piloto de número único; no SaaS virão por salão).
 *
 * Endpoint de envio: POST https://graph.facebook.com/{ver}/{phone_number_id}/messages
 */

import { WhatsAppMessageError } from '@/lib/services/evolution/evolution-message.service';
import { logger, hashPhone } from '@/lib/infra/logger';
import type {
  MessageProvider,
  OutboundResult,
  SendMediaArgs,
  SendTextArgs,
} from '../provider';
import { mapMetaError } from './errors';

export interface CloudProviderConfig {
  token: string;
  phoneNumberId: string;
  graphVersion?: string;
}

/** Mantém apenas os dígitos do E.164 (a Graph API espera o número sem '+'). */
function digitsOnly(phone: string): string {
  return phone.replace(/\D/g, '');
}

export class CloudProvider implements MessageProvider {
  readonly kind = 'cloud' as const;
  private readonly messagesUrl: string;
  private readonly token: string;

  constructor(cfg: CloudProviderConfig) {
    const ver = cfg.graphVersion ?? 'v25.0';
    this.token = cfg.token;
    this.messagesUrl = `https://graph.facebook.com/${ver}/${cfg.phoneNumberId}/messages`;
  }

  private async send(payload: Record<string, unknown>, to: string): Promise<OutboundResult> {
    const start = Date.now();
    const res = await fetch(this.messagesUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const json = (await res.json().catch(() => undefined)) as
      | { messages?: Array<{ id?: string }> }
      | undefined;

    if (!res.ok) {
      const err = mapMetaError(res.status, json);
      logger.error(
        { status: res.status, to: hashPhone(to), retryable: err.retryable, duration: Date.now() - start },
        'Cloud API send failed',
      );
      throw err;
    }

    const messageId = json?.messages?.[0]?.id;
    if (!messageId) {
      // 2xx sem messageId é anômalo — trata como transitório.
      throw new WhatsAppMessageError('Cloud API: resposta 2xx sem messageId', true, res.status);
    }

    logger.info(
      { messageId, to: hashPhone(to), duration: Date.now() - start },
      'WhatsApp message sent via Cloud API',
    );
    return { messageId };
  }

  sendText(args: SendTextArgs): Promise<OutboundResult> {
    return this.send(
      {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: digitsOnly(args.to),
        type: 'text',
        text: { preview_url: false, body: args.body },
      },
      args.to,
    );
  }

  sendMedia(args: SendMediaArgs): Promise<OutboundResult> {
    const media: Record<string, unknown> = { link: args.mediaUrl };
    // Áudio não aceita caption na Cloud API.
    if (args.mediaType !== 'audio') {
      media.caption = args.caption ?? args.body;
    }
    if (args.mediaType === 'document' && args.fileName) {
      media.filename = args.fileName;
    }
    return this.send(
      {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: digitsOnly(args.to),
        type: args.mediaType,
        [args.mediaType]: media,
      },
      args.to,
    );
  }

  async sendTextWithTyping(args: SendTextArgs): Promise<OutboundResult> {
    // Indicador de "digitando…" vai junto do read receipt da última msg recebida.
    // Best-effort: nunca bloqueia o envio do texto.
    if (args.replyToMessageId) {
      await this.markReadWithTyping(args.replyToMessageId).catch((err) => {
        logger.warn({ err }, 'Cloud typing indicator falhou (seguindo com o envio)');
      });
    }
    return this.sendText(args);
  }

  private async markReadWithTyping(wamid: string): Promise<void> {
    await fetch(this.messagesUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        status: 'read',
        message_id: wamid,
        typing_indicator: { type: 'text' },
      }),
    });
  }
}

/**
 * Cria um CloudProvider a partir das variáveis de ambiente (piloto de número
 * único). No SaaS multi-tenant, o phone_number_id/token virão por salão.
 */
export function createCloudProviderFromEnv(overrides?: Partial<CloudProviderConfig>): CloudProvider {
  const token = overrides?.token ?? process.env.WHATSAPP_CLOUD_TOKEN;
  const phoneNumberId = overrides?.phoneNumberId ?? process.env.WHATSAPP_PHONE_NUMBER_ID;
  const graphVersion = overrides?.graphVersion ?? process.env.WHATSAPP_GRAPH_VERSION ?? 'v25.0';

  if (!token || !phoneNumberId) {
    throw new Error(
      'CloudProvider exige WHATSAPP_CLOUD_TOKEN e WHATSAPP_PHONE_NUMBER_ID nas variáveis de ambiente',
    );
  }
  return new CloudProvider({ token, phoneNumberId, graphVersion });
}
