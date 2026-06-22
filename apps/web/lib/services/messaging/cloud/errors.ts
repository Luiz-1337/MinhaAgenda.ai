/**
 * Classificação dos erros da WhatsApp Cloud API.
 *
 * Diferente da Evolution (status:0 silencioso), a Cloud API devolve o erro
 * SÍNCRONO no POST (ou um webhook status=failed com código). Aqui mapeamos os
 * códigos da Meta para o WhatsAppMessageError que o pipeline já entende,
 * preservando a semântica de `retryable` (o worker/BullMQ decide o reenvio).
 *
 * Referência de códigos: Cloud API error codes (Meta).
 */

import { WhatsAppMessageError } from '../../evolution/evolution-message.service';

// NÃO adianta reenviar: problema de destinatário, janela de 24h, template ou política.
const NON_RETRYABLE = new Set<number>([
  100, // parâmetro inválido
  131026, // mensagem não entregável (número não é WhatsApp / incapaz de receber)
  131047, // re-engagement: fora da janela de 24h -> exige template
  131051, // tipo de mensagem não suportado
  131052, // falha ao baixar a mídia enviada pelo usuário
  131053, // falha ao subir a mídia
  132000, // nº de parâmetros do template não confere
  132001, // template não existe / não aprovado naquele idioma
  132005, // texto do template excede o limite
  132007, // conteúdo viola política do template
  132012, // formato de parâmetro do template inválido
  132015, // template pausado por baixa qualidade
  132016, // template desabilitado
  133010, // número não registrado para a Cloud API
  131008, // parâmetro obrigatório ausente
  368, // bloqueio temporário por violação de política
]);

// Transitórios: vale reenviar com backoff.
const RETRYABLE = new Set<number>([
  1, // erro desconhecido da API
  2, // serviço da API temporariamente indisponível
  4, // limite de chamadas da aplicação
  80007, // rate limit da WABA
  130429, // rate limit de throughput de mensagens
  131056, // (pair rate limit) muitas mensagens para o mesmo par em pouco tempo
  133016, // rate limit de operações de registro
]);

export function isRetryableMetaCode(code: number | undefined, httpStatus: number): boolean {
  if (code != null) {
    if (NON_RETRYABLE.has(code)) return false;
    if (RETRYABLE.has(code)) return true;
  }
  // Fallback pelo HTTP: 5xx é transitório, 4xx é definitivo.
  return httpStatus >= 500;
}

interface MetaErrorBody {
  error?: {
    message?: string;
    type?: string;
    code?: number;
    error_subcode?: number;
    fbtrace_id?: string;
    error_data?: { details?: string };
  };
}

/** Converte a resposta de erro da Cloud API em WhatsAppMessageError. */
export function mapMetaError(httpStatus: number, body: unknown): WhatsAppMessageError {
  const err = (body as MetaErrorBody | undefined)?.error;
  const code = err?.code;
  const detail = err?.error_data?.details ?? err?.message ?? `HTTP ${httpStatus}`;
  const retryable = isRetryableMetaCode(code, httpStatus);
  return new WhatsAppMessageError(
    `Cloud API error${code != null ? ` ${code}` : ''}: ${detail}`,
    retryable,
    httpStatus,
  );
}
