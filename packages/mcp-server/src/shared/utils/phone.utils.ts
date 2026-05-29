/**
 * Utilitários para manipulação de telefones
 */

import { BRAZILIAN_PHONE_REGEX } from "../constants"

/**
 * Remove toda formatação de um telefone, mantendo apenas dígitos
 */
export function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, "")
}

/**
 * Formata um telefone para exibição no padrão brasileiro
 * Ex: 11987654321 -> (11) 98765-4321
 */
export function formatPhone(phone: string): string {
  const normalized = normalizePhone(phone)

  // Remove código do país se presente
  const withoutCountry = normalized.startsWith("55")
    ? normalized.slice(2)
    : normalized

  if (withoutCountry.length === 11) {
    // Celular: (XX) XXXXX-XXXX
    return `(${withoutCountry.slice(0, 2)}) ${withoutCountry.slice(2, 7)}-${withoutCountry.slice(7)}`
  }

  if (withoutCountry.length === 10) {
    // Fixo: (XX) XXXX-XXXX
    return `(${withoutCountry.slice(0, 2)}) ${withoutCountry.slice(2, 6)}-${withoutCountry.slice(6)}`
  }

  // Internacional (não-BR): exibe em E.164 simples (+DDI...).
  if (normalized.length >= 8) {
    return `+${normalized}`
  }

  // Se não conseguir formatar, retorna como está
  return phone
}

/**
 * Valida um telefone brasileiro (com ou sem DDI 55): 10 (fixo) ou 11 (celular)
 * dígitos sem país, DDD 11-99, celular começando com 9.
 */
function isValidBrazilianPhone(digits: string): boolean {
  // Remove código do país se presente
  const withoutCountry = digits.startsWith("55") ? digits.slice(2) : digits

  // Deve ter 10 (fixo) ou 11 (celular) dígitos
  if (withoutCountry.length !== 10 && withoutCountry.length !== 11) {
    return false
  }

  // DDD deve ser válido (11-99)
  const ddd = parseInt(withoutCountry.slice(0, 2), 10)
  if (ddd < 11 || ddd > 99) {
    return false
  }

  // Se for celular (11 dígitos), deve começar com 9
  if (withoutCountry.length === 11 && withoutCountry[2] !== "9") {
    return false
  }

  return true
}

/**
 * Valida se um telefone é aceitável (brasileiro OU internacional).
 *
 * Estratégia BR-first para zero regressão no caso brasileiro (maioria do
 * tráfego): primeiro aplica a regra brasileira; se não casar, aceita qualquer
 * número internacional no formato E.164 (8-15 dígitos, sem zero à esquerda).
 *
 * O telefone do cliente já vem do WhatsApp (entregável e confiável), então não
 * fazemos validação rigorosa por país — apenas barramos lixo óbvio.
 */
export function isValidPhone(phone: string): boolean {
  const digits = normalizePhone(phone)

  if (!digits) {
    return false
  }

  // Caminho BR preservado (regra original).
  if (isValidBrazilianPhone(digits)) {
    return true
  }

  // Fallback internacional: E.164 tem de 8 a 15 dígitos e não começa com 0.
  if (digits.length >= 8 && digits.length <= 15 && !digits.startsWith("0")) {
    return true
  }

  return false
}

/**
 * Extrai o DDD de um telefone.
 * BR-only: assume DDI 55 e DDD de 2 dígitos. Sem callers externos hoje.
 */
export function extractDDD(phone: string): string | null {
  const normalized = normalizePhone(phone)
  const withoutCountry = normalized.startsWith("55")
    ? normalized.slice(2)
    : normalized

  if (withoutCountry.length >= 10) {
    return withoutCountry.slice(0, 2)
  }

  return null
}

/**
 * Verifica se dois telefones são iguais (ignorando formatação).
 * BR-only: faz strip de "55" para comparação. Sem callers externos hoje.
 */
export function phonesAreEqual(phone1: string, phone2: string): boolean {
  const n1 = normalizePhone(phone1)
  const n2 = normalizePhone(phone2)

  // Remove código do país para comparação
  const clean1 = n1.startsWith("55") ? n1.slice(2) : n1
  const clean2 = n2.startsWith("55") ? n2.slice(2) : n2

  return clean1 === clean2
}

/**
 * Adiciona o código do país se não estiver presente.
 * BR-only: assume DDI 55. Sem callers externos hoje.
 */
export function addCountryCode(phone: string): string {
  const normalized = normalizePhone(phone)

  if (normalized.startsWith("55")) {
    return normalized
  }

  return `55${normalized}`
}
