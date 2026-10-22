/**
 * Telefone brasileiro: normalizar e comparar. Os clientes daqui chegam do
 * WhatsApp em formatos diferentes (13 dígitos com o 9, 12 sem o 9, alguns
 * formatados) e os de sistemas externos também — comparar string crua duplica
 * cliente.
 */

/**
 * Só dígitos, com DDI.
 * - 10 ou 11 dígitos: brasileiro sem DDI → prefixa 55;
 * - 12 ou 13 dígitos: já com DDI (55 ou estrangeiro);
 * - qualquer outra coisa → null. Pega o id interno do WhatsApp (LID, 15+
 *   dígitos), que existe em alguns clientes e não é telefone.
 */
export function toE164Digits(raw: string | null | undefined): string | null {
  const digits = (raw ?? '').replace(/\D/g, '')
  if (digits.length === 10 || digits.length === 11) return `55${digits}`
  if (digits.length === 12 || digits.length === 13) return digits
  return null
}

/**
 * Chave de comparação: DDD + 8 últimos dígitos. Resiste ao DDI ausente, à
 * formatação e ao 9 que o WhatsApp às vezes omite. Null se não der para extrair
 * DDD.
 */
export function phoneMatchKey(raw: string | null | undefined): string | null {
  const digits = (raw ?? '').replace(/\D/g, '')
  const national = digits.length >= 12 && digits.startsWith('55') ? digits.slice(2) : digits
  if (national.length !== 10 && national.length !== 11) return null
  return `${national.slice(0, 2)}:${national.slice(-8)}`
}

export function phonesMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  const keyA = phoneMatchKey(a)
  return keyA !== null && keyA === phoneMatchKey(b)
}
