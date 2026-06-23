/**
 * Resolução do provider de mensageria por salão/agente.
 *
 * Dois caminhos:
 *  - getProviderForJob: caminho REATIVO (responder a mensagem recebida). O
 *    provider vem do job (o canal que recebeu responde). NÃO bate no banco.
 *  - getProviderForSalon: caminho PROATIVO (lembrete/marketing/envio manual).
 *    LÊ a flag agents.messaging_provider no banco para escolher o provider.
 *
 * IMPORTANTE: este arquivo entra no grafo de import do WORKER (via
 * message-processor e delivery-retry), que roda sob tsx e NÃO resolve o alias
 * `@/`. Use SEMPRE caminhos relativos / pacotes reais (@repo/*) aqui.
 */

import { db, agents, eq, and } from '@repo/db';
import { EvolutionProvider } from './evolution-provider';
import { createCloudProviderFromEnv } from './cloud/cloud-provider';
import type { MessageProvider, ProviderKind } from './provider';

const evolutionProvider = new EvolutionProvider();

/**
 * Provider para um job JÁ RECEBIDO (caminho REATIVO): o canal que recebeu a
 * mensagem responde. 'cloud' envia a partir do phone_number_id do próprio job
 * (o número do salão; token da plataforma vem da env). Job 'cloud' sem
 * phoneNumberId => erro — recusa enviar para não usar número errado/de teste
 * (vazamento cross-tenant). Default ('evolution'/ausente) => Evolution.
 */
export function getProviderForJob(
  job: { provider?: ProviderKind; phoneNumberId?: string },
): MessageProvider {
  if (job.provider === 'cloud') {
    if (!job.phoneNumberId) {
      throw new Error(
        'Job cloud sem phoneNumberId — envio recusado para evitar remetente incorreto (cross-tenant).',
      );
    }
    return createCloudProviderFromEnv({ phoneNumberId: job.phoneNumberId });
  }
  return evolutionProvider;
}

/**
 * Provider para envios INICIADOS pelo app (PROATIVOS: lembrete, marketing,
 * envio manual). Lê a flag agents.messaging_provider + o número do agente no
 * banco. 'cloud' + phone_number_id => CloudProvider (token de env da
 * plataforma; envia a partir do número do salão); senão Evolution.
 * Default 'evolution' preserva 100% o comportamento atual.
 */
export async function getProviderForSalon(
  salonId: string,
  _agentId?: string,
): Promise<MessageProvider> {
  // Cloud é por-salão: resolve o agente do salão que TEM a config Cloud,
  // INDEPENDENTE de qual agente está ativo. Evita split-brain — se o agente
  // ativo mudar, o número continua ligado a quem conectou, e o proativo
  // (que segue o número, igual ao inbound) não diverge. Sem agente Cloud =>
  // Evolution (default), comportamento atual preservado.
  const cloudAgent = await db.query.agents.findFirst({
    where: and(eq(agents.salonId, salonId), eq(agents.messagingProvider, 'cloud')),
    columns: { whatsappPhoneNumberId: true },
  });
  if (cloudAgent?.whatsappPhoneNumberId) {
    return createCloudProviderFromEnv({ phoneNumberId: cloudAgent.whatsappPhoneNumberId });
  }
  return evolutionProvider;
}

export type {
  MessageProvider,
  OutboundResult,
  SendTextArgs,
  SendMediaArgs,
  ProviderKind,
} from './provider';
