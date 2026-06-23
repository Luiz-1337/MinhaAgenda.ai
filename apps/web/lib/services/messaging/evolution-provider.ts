/**
 * EvolutionProvider — adaptador da Evolution API para a interface MessageProvider.
 *
 * NÃO contém lógica nova: apenas delega para as funções já existentes em
 * services/evolution/evolution-message.service. O objetivo é embrulhar o
 * provedor atual sem mudar nenhum comportamento, para que o CloudProvider
 * (Bloco B3) possa entrar ao lado com a mesma assinatura.
 */

import {
  sendWhatsAppMessage,
  sendWithTypingIndicator,
} from '../evolution/evolution-message.service';
import type {
  MessageProvider,
  OutboundResult,
  SendMediaArgs,
  SendTemplateArgs,
  SendTextArgs,
} from './provider';

export class EvolutionProvider implements MessageProvider {
  readonly kind = 'evolution' as const;

  sendText(args: SendTextArgs): Promise<OutboundResult> {
    return sendWhatsAppMessage(args.to, args.body, args.salonId, {
      agentId: args.agentId,
    });
  }

  sendMedia(args: SendMediaArgs): Promise<OutboundResult> {
    return sendWhatsAppMessage(args.to, args.caption ?? args.body, args.salonId, {
      agentId: args.agentId,
      mediaUrl: args.mediaUrl,
      mediaType: args.mediaType,
      caption: args.caption,
      fileName: args.fileName,
    });
  }

  sendTextWithTyping(args: SendTextArgs): Promise<OutboundResult> {
    return sendWithTypingIndicator(args.to, args.body, args.salonId, {
      agentId: args.agentId,
    });
  }

  // A Evolution envia texto livre a qualquer hora — não usa templates HSM.
  // Os call-sites proativos usam sendText quando o provider é Evolution; este
  // método nunca deve ser chamado nesse caminho (rejeita por segurança).
  sendTemplate(_args: SendTemplateArgs): Promise<OutboundResult> {
    return Promise.reject(
      new Error('EvolutionProvider não suporta templates (use sendText).'),
    );
  }
}
