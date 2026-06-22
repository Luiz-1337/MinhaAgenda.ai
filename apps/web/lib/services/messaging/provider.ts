/**
 * MessageProvider — abstração de transporte de mensagens WhatsApp.
 *
 * Permite que o app fale com mais de um provedor de WhatsApp (Evolution API
 * hoje, WhatsApp Cloud API da Meta em seguida) atrás de uma única interface.
 * O provider concreto é resolvido por salão/agente em `getProviderForSalon`
 * (ver ./index.ts), o que viabiliza rollout gradual via feature flag.
 *
 * Esta fase (B1) adiciona apenas a interface + o adaptador da Evolution.
 * NENHUM comportamento de envio atual muda: o EvolutionProvider apenas delega
 * para as funções já existentes em services/evolution.
 */

export interface OutboundResult {
  /** ID da mensagem no provedor (Evolution: key.id; Cloud API: wamid). */
  messageId: string;
}

export interface SendTextArgs {
  /** Destinatário em E.164 (ex.: +5511999999999). */
  to: string;
  body: string;
  salonId: string;
  agentId?: string;
  /**
   * wamid da última mensagem recebida do cliente. Usado pelo CloudProvider
   * para exibir "digitando…" (read receipt + typing indicator). O EvolutionProvider
   * ignora (faz presence próprio).
   */
  replyToMessageId?: string;
}

export interface SendMediaArgs extends SendTextArgs {
  mediaUrl: string;
  mediaType: 'image' | 'audio' | 'video' | 'document';
  caption?: string;
  fileName?: string;
}

export type ProviderKind = 'evolution' | 'cloud';

export interface MessageProvider {
  readonly kind: ProviderKind;

  sendText(args: SendTextArgs): Promise<OutboundResult>;

  sendMedia(args: SendMediaArgs): Promise<OutboundResult>;

  /**
   * Envia o texto precedido de um indicador de "digitando…" (humaniza
   * mensagens geradas por IA, ex.: dispatcher de retenção).
   */
  sendTextWithTyping(args: SendTextArgs): Promise<OutboundResult>;
}
