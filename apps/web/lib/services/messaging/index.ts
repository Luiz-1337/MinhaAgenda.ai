/**
 * Resolução do provider de mensageria por salão/agente.
 *
 * Estado atual (Bloco B1): existe apenas o EvolutionProvider, então esta
 * função sempre o retorna — comportamento idêntico ao de hoje.
 *
 * Próximos passos:
 *  - B3: implementar o CloudProvider (WhatsApp Cloud API da Meta).
 *  - B8: criar a coluna `agents.messaging_provider` ('evolution' | 'cloud')
 *        e fazer esta função LER essa flag para escolher o provider por salão,
 *        habilitando rollout gradual e rollback instantâneo.
 */

import { EvolutionProvider } from './evolution-provider';
import { createCloudProviderFromEnv } from './cloud/cloud-provider';
import type { MessageProvider, ProviderKind } from './provider';

const evolutionProvider = new EvolutionProvider();

/**
 * Resolve o provider pelo "kind" que veio no job: 'cloud' -> CloudProvider
 * (criado das env vars, piloto de número único), senão -> EvolutionProvider
 * (singleton). É o que o worker usa para enviar a resposta no MESMO canal em
 * que a mensagem chegou.
 */
export function getProviderByKind(kind: ProviderKind | undefined): MessageProvider {
  return kind === 'cloud' ? createCloudProviderFromEnv() : evolutionProvider;
}

export async function getProviderForSalon(
  _salonId: string,
  _agentId?: string,
): Promise<MessageProvider> {
  // TODO(B8): ler agents.messaging_provider e retornar CloudProvider quando 'cloud'.
  return evolutionProvider;
}

export type {
  MessageProvider,
  OutboundResult,
  SendTextArgs,
  SendMediaArgs,
  ProviderKind,
} from './provider';
