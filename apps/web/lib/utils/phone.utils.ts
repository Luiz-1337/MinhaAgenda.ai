/**
 * Utilitários de telefone para a camada web (UI + Server Actions).
 *
 * Módulo puro (sem "use client"/"use server") — pode ser importado tanto por
 * Server Actions quanto por Client Components.
 *
 * Espelha a lógica de packages/mcp-server/src/shared/utils/phone.utils.ts.
 * Não importamos cross-package de propósito: o mcp-server é pacote de
 * worker/server e o repo já mantém variações locais de formatPhone.
 */

/** Remove toda formatação, mantendo apenas dígitos. */
export function normalizePhone(phone: string | null | undefined): string {
  return (phone ?? "").replace(/\D/g, "")
}

/**
 * Formata um telefone para exibição no padrão brasileiro.
 * Remove o DDI 55 quando presente.
 * Ex.: "5511958138013" -> "(11) 95813-8013"; "1133334444" -> "(11) 3333-4444".
 */
export function formatPhoneBR(phone: string | null | undefined): string {
  if (!phone) return ""
  const d = normalizePhone(phone)
  // Remove código do país se presente (DDI 55).
  const local = d.startsWith("55") ? d.slice(2) : d

  if (local.length === 11) {
    // Celular: (XX) XXXXX-XXXX
    return `(${local.slice(0, 2)}) ${local.slice(2, 7)}-${local.slice(7)}`
  }

  if (local.length === 10) {
    // Fixo: (XX) XXXX-XXXX
    return `(${local.slice(0, 2)}) ${local.slice(2, 6)}-${local.slice(6)}`
  }

  // Internacional (não-BR): exibe em E.164 simples (+DDI...).
  if (d.length >= 8) {
    return `+${d}`
  }

  // Não foi possível formatar: devolve o original.
  return phone
}

/**
 * Formata um telefone para exibição COM o DDI, separando o 9 do celular.
 * Ex.: "5511943605814" -> "+55 11 9 4360-5814"; "551133334444" -> "+55 11 3333-4444".
 *
 * Usado onde o número exibido é o do próprio salão (conexão do WhatsApp), em que
 * o DDI importa — é o número como a Meta o conhece. Para telefone de cliente
 * dentro do painel, prefira formatPhoneBR (padrão local "(11) 94360-5814").
 */
export function formatPhoneIntl(phone: string | null | undefined): string {
  if (!phone) return ""
  const d = normalizePhone(phone)
  // Números BR podem chegar com ou sem o DDI; trata os dois como locais.
  const local = d.startsWith("55") && (d.length === 12 || d.length === 13) ? d.slice(2) : d

  if (local.length === 11) {
    // Celular: +55 XX 9 XXXX-XXXX
    return `+55 ${local.slice(0, 2)} ${local.slice(2, 3)} ${local.slice(3, 7)}-${local.slice(7)}`
  }

  if (local.length === 10) {
    // Fixo: +55 XX XXXX-XXXX
    return `+55 ${local.slice(0, 2)} ${local.slice(2, 6)}-${local.slice(6)}`
  }

  // Internacional (não-BR) ou tamanho inesperado: E.164 simples, sem inventar grupos.
  if (d.length >= 8) {
    return `+${d}`
  }

  // Não foi possível formatar: devolve o original.
  return phone
}

/**
 * Máscara progressiva para inputs de telefone (formata enquanto o usuário digita).
 * Trabalha sobre dígitos locais (sem DDI), montando "(XX) XXXXX-XXXX" parcialmente.
 * O servidor normaliza para dígitos no submit, então isto é só UX.
 */
export function formatPhoneInput(value: string): string {
  let d = normalizePhone(value)
  // Remove DDI 55 colado (ex.: número vindo do WhatsApp) antes de mascarar como local.
  if (d.length > 11 && d.startsWith("55")) d = d.slice(2)
  d = d.slice(0, 11) // limita ao tamanho de um celular BR

  if (d.length === 0) return ""
  if (d.length <= 2) return `(${d}`
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`
  if (d.length <= 10) {
    // Trata como fixo (até 10 dígitos): (XX) XXXX-XXXX
    return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  }
  // Celular completo: (XX) XXXXX-XXXX
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
}
