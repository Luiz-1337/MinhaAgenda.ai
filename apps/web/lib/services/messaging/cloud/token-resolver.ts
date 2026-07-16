/**
 * Resolve o access token da WhatsApp Cloud API a ser usado no ENVIO, com fallback.
 *
 * Multi-tenant: cada salão que conectou via Embedded Signup guarda o SEU token
 * (cifrado em agents.whatsapp_cloud_token). Aqui resolvemos o token pelo
 * phone_number_id (chave UNIQUE do agente) e decifhramos. Sem token por-salão
 * (piloto no portfólio do dono, número de teste, ou agente conectado antes desta
 * feature) => cai no token da PLATAFORMA (env WHATSAPP_CLOUD_TOKEN).
 *
 * NUNCA lança: qualquer falha (sem número, sem linha, decifragem quebrada por
 * chave rotacionada) cai no token da env — um envio jamais deve morrer por causa
 * da resolução de token. Falha de decifragem loga warning e segue no fallback.
 *
 * IMPORTANTE: entra no grafo de import do WORKER (tsx, sem alias @/). Só imports
 * relativos / pacotes reais (@repo/*).
 */
import { db, agents, eq } from '@repo/db';
import { decryptSecret } from '../../../infra/crypto';
import { logger } from '../../../infra/logger';

function envToken(): string {
  return process.env.WHATSAPP_CLOUD_TOKEN ?? '';
}

/**
 * Decifra o token de uma linha de agente JÁ carregada (sem tocar no banco).
 * Fallback = token da plataforma. Use quando você já tem a coluna em mãos
 * (ex.: getProviderForSalon, que já leu o agente).
 */
export function decodeCloudToken(encrypted: string | null | undefined): string {
  if (!encrypted) return envToken();
  try {
    return decryptSecret(encrypted);
  } catch (err) {
    logger.warn({ err }, 'decodeCloudToken: falha ao decifrar token do salão — usando token da plataforma');
    return envToken();
  }
}

/**
 * Resolve o token a partir do phone_number_id (faz UMA leitura O(1) no índice
 * UNIQUE agents.whatsapp_phone_number_id). Use no caminho REATIVO, onde só temos
 * o número (sem a linha do agente em mãos).
 */
export async function resolveCloudToken(phoneNumberId: string | undefined): Promise<string> {
  if (!phoneNumberId) return envToken();
  try {
    const agent = await db.query.agents.findFirst({
      where: eq(agents.whatsappPhoneNumberId, phoneNumberId),
      columns: { whatsappCloudToken: true },
    });
    return decodeCloudToken(agent?.whatsappCloudToken);
  } catch (err) {
    logger.warn({ err, phoneNumberId }, 'resolveCloudToken: falha ao buscar token do salão — usando token da plataforma');
    return envToken();
  }
}
