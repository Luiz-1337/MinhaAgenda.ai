import { z } from 'zod'

import { decryptSecret, encryptSecret } from '../../../utils/secret-crypto.utils'

/**
 * Credencial de uma agenda externa, como fica guardada em `salon_integrations`.
 *
 * Vai INTEIRA cifrada em `refresh_token` (a coluna NOT NULL, e o lugar da
 * credencial de longa duração também no Google). `access_token`/`expires_at`
 * ficam livres para o caso de a API trocar essa credencial por um token curto.
 *
 * Diferente do Trinks (`saveTrinksToken`), nada aqui fica em texto puro: a chave
 * da agenda oficial escreve na agenda real do salão.
 */
export interface AgendaCredentials {
  /** Credencial de longa duração (API key, token gerado no painel, refresh token). */
  token: string
  /** Conta/estabelecimento que a credencial enxerga, se a API pedir em cada chamada. */
  accountId?: string
  /** Nome da conta, para mostrar ao dono ("Conectado a ..."). */
  accountName?: string
}

const credentialsSchema = z.object({
  token: z.string().min(1),
  accountId: z.string().min(1).optional(),
  accountName: z.string().min(1).optional(),
})

export function sealAgendaCredentials(credentials: AgendaCredentials): string {
  return encryptSecret(JSON.stringify(credentialsSchema.parse(credentials)))
}

/** Lança se o envelope não decifrar ou não tiver o formato esperado. */
export function openAgendaCredentials(sealed: string): AgendaCredentials {
  const parsed = credentialsSchema.safeParse(JSON.parse(decryptSecret(sealed)))
  if (!parsed.success) {
    throw new Error('Credencial da agenda externa em formato inválido.')
  }
  return parsed.data
}

/**
 * Limpa o que o dono colou: espaços, quebras de linha, aspas e um "Bearer " que
 * venha junto do painel de origem. Colar errado não pode virar "token inválido".
 */
export function normalizePastedToken(raw: string): string {
  return raw
    .trim()
    .replace(/^["'`]+|["'`]+$/g, '')
    .replace(/^bearer\s+/i, '')
    .replace(/\s+/g, '')
}
