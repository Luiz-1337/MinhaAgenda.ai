/**
 * Dados cadastrais do cliente — regra pura, sem I/O (docs/ROADMAP.md, fase 7,
 * fatia 7a).
 *
 * A ficha ganha o que não tinha onde morar: nascimento, CPF, gênero, endereço e
 * "como conheceu". Tudo opcional — o cadastro que nasce do WhatsApp continua só
 * com nome e telefone.
 *
 * Mesmo desenho dos outros módulos: o serviço busca os dados, estas funções
 * decidem, o serviço grava.
 */
import { isCalendarDate } from './finance'

export const CUSTOMER_GENDERS = ['female', 'male', 'other'] as const
export type CustomerGender = (typeof CUSTOMER_GENDERS)[number]

export const BRAZIL_STATES = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA',
  'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
] as const

const MAX_STREET_LENGTH = 120
const MAX_SHORT_LENGTH = 60
const MAX_NUMBER_LENGTH = 20
const MAX_REFERRAL_LENGTH = 80

// ============================================================================
// CPF
// ============================================================================

/**
 * Os 11 dígitos de um CPF válido (com os dois dígitos verificadores certos).
 * Sequências repetidas ("111.111.111-11") passam na conta mas não existem.
 */
export function isValidCpf(value: string): boolean {
  const digits = value.replace(/\D/g, '')
  if (digits.length !== 11 || /^(\d)\1{10}$/.test(digits)) return false

  const checkDigit = (length: number) => {
    let sum = 0
    for (let i = 0; i < length; i++) sum += Number(digits[i]) * (length + 1 - i)
    const rest = (sum * 10) % 11
    return rest === 10 ? 0 : rest
  }

  return checkDigit(9) === Number(digits[9]) && checkDigit(10) === Number(digits[10])
}

/** "12345678909" → "123.456.789-09". Fora do padrão, devolve como veio. */
export function formatCpf(cpf: string | null | undefined): string {
  const digits = (cpf ?? '').replace(/\D/g, '')
  if (digits.length !== 11) return cpf ?? ''
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`
}

/** Só os dois últimos dígitos: "•••.•••.•••-09". Para quem não pode ver o CPF inteiro. */
export function maskCpf(cpf: string | null | undefined): string | null {
  const digits = (cpf ?? '').replace(/\D/g, '')
  if (digits.length !== 11) return null
  return `•••.•••.•••-${digits.slice(9)}`
}

/** "01310100" → "01310-100". */
export function formatZipCode(zipCode: string | null | undefined): string {
  const digits = (zipCode ?? '').replace(/\D/g, '')
  if (digits.length !== 8) return zipCode ?? ''
  return `${digits.slice(0, 5)}-${digits.slice(5)}`
}

// ============================================================================
// Idade e aniversário
// ============================================================================

/** Anos completos em `today` ("YYYY-MM-DD"). NULL sem data de nascimento. */
export function customerAge(birthDate: string | null | undefined, today: string): number | null {
  if (!birthDate || !isCalendarDate(birthDate) || !isCalendarDate(today) || birthDate > today) return null
  const years = Number(today.slice(0, 4)) - Number(birthDate.slice(0, 4))
  // Ainda não fez aniversário neste ano?
  return today.slice(5) < birthDate.slice(5) ? years - 1 : years
}

/**
 * Hoje é o aniversário? Quem nasceu em 29/fev comemora em 28/fev nos anos que não
 * são bissextos — senão passaria três anos em cada quatro sem aniversário.
 */
export function isBirthday(birthDate: string | null | undefined, today: string): boolean {
  if (!birthDate || !isCalendarDate(birthDate) || !isCalendarDate(today)) return false
  const born = birthDate.slice(5)
  const now = today.slice(5)
  if (born === now) return true
  return born === '02-29' && now === '02-28' && !isCalendarDate(`${today.slice(0, 4)}-02-29`)
}

// ============================================================================
// Gravar
// ============================================================================

export type CustomerProfileDraft = {
  birthDate?: string | null
  cpf?: string | null
  gender?: string | null
  zipCode?: string | null
  addressStreet?: string | null
  addressNumber?: string | null
  addressComplement?: string | null
  addressDistrict?: string | null
  addressCity?: string | null
  addressState?: string | null
  referralSource?: string | null
}

export type CustomerProfile = {
  /** "YYYY-MM-DD". */
  birthDate: string | null
  /** Só os 11 dígitos. */
  cpf: string | null
  gender: CustomerGender | null
  /** Só os 8 dígitos. */
  zipCode: string | null
  addressStreet: string | null
  addressNumber: string | null
  addressComplement: string | null
  addressDistrict: string | null
  addressCity: string | null
  /** UF, duas letras maiúsculas. */
  addressState: string | null
  referralSource: string | null
}

export const EMPTY_CUSTOMER_PROFILE: CustomerProfile = {
  birthDate: null,
  cpf: null,
  gender: null,
  zipCode: null,
  addressStreet: null,
  addressNumber: null,
  addressComplement: null,
  addressDistrict: null,
  addressCity: null,
  addressState: null,
  referralSource: null,
}

function clean(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim().replace(/\s+/g, ' ') : null
}

/**
 * Valida e normaliza os dados cadastrais. Campo em branco vira NULL; CPF e CEP
 * ficam só com dígitos; UF em maiúsculas.
 */
export function planCustomerProfile(
  draft: CustomerProfileDraft,
  today: string
): { ok: true; profile: CustomerProfile } | { ok: false; error: string } {
  const birthDate = clean(draft.birthDate)
  if (birthDate) {
    if (!isCalendarDate(birthDate)) return { ok: false, error: 'Data de nascimento inválida' }
    if (birthDate > today) return { ok: false, error: 'A data de nascimento não pode ser no futuro' }
    if (birthDate < '1900-01-01') return { ok: false, error: 'Data de nascimento inválida' }
  }

  const cpfRaw = clean(draft.cpf)
  const cpf = cpfRaw ? cpfRaw.replace(/\D/g, '') : null
  if (cpfRaw && (!cpf || !isValidCpf(cpf))) return { ok: false, error: 'CPF inválido' }

  const genderRaw = clean(draft.gender)
  if (genderRaw && !(CUSTOMER_GENDERS as readonly string[]).includes(genderRaw)) {
    return { ok: false, error: 'Gênero inválido' }
  }
  const gender = (genderRaw as CustomerGender | null) ?? null

  const zipRaw = clean(draft.zipCode)
  const zipCode = zipRaw ? zipRaw.replace(/\D/g, '') : null
  if (zipRaw && zipCode?.length !== 8) return { ok: false, error: 'CEP inválido: são 8 dígitos' }

  const stateRaw = clean(draft.addressState)
  const addressState = stateRaw ? stateRaw.toUpperCase() : null
  if (addressState && !(BRAZIL_STATES as readonly string[]).includes(addressState)) {
    return { ok: false, error: 'UF inválida' }
  }

  const addressStreet = clean(draft.addressStreet)
  const addressNumber = clean(draft.addressNumber)
  const addressComplement = clean(draft.addressComplement)
  const addressDistrict = clean(draft.addressDistrict)
  const addressCity = clean(draft.addressCity)
  const referralSource = clean(draft.referralSource)

  if (addressStreet && addressStreet.length > MAX_STREET_LENGTH) return { ok: false, error: 'Endereço muito longo' }
  if (addressNumber && addressNumber.length > MAX_NUMBER_LENGTH) return { ok: false, error: 'Número muito longo' }
  if (addressComplement && addressComplement.length > MAX_SHORT_LENGTH) {
    return { ok: false, error: 'Complemento muito longo' }
  }
  if (addressDistrict && addressDistrict.length > MAX_SHORT_LENGTH) return { ok: false, error: 'Bairro muito longo' }
  if (addressCity && addressCity.length > MAX_SHORT_LENGTH) return { ok: false, error: 'Cidade muito longa' }
  if (referralSource && referralSource.length > MAX_REFERRAL_LENGTH) {
    return { ok: false, error: '"Como conheceu" muito longo' }
  }

  return {
    ok: true,
    profile: {
      birthDate,
      cpf,
      gender,
      zipCode: zipCode || null,
      addressStreet,
      addressNumber,
      addressComplement,
      addressDistrict,
      addressCity,
      addressState,
      referralSource,
    },
  }
}

/** "Rua X, 10 - Apto 2 · Centro · São Paulo/SP · 01310-100". Vazio = sem endereço. */
export function formatCustomerAddress(profile: Pick<
  CustomerProfile,
  'zipCode' | 'addressStreet' | 'addressNumber' | 'addressComplement' | 'addressDistrict' | 'addressCity' | 'addressState'
>): string {
  const street = [profile.addressStreet, profile.addressNumber].filter(Boolean).join(', ')
  const line = [street, profile.addressComplement].filter(Boolean).join(' - ')
  const city = [profile.addressCity, profile.addressState].filter(Boolean).join('/')
  return [line, profile.addressDistrict, city, profile.zipCode ? formatZipCode(profile.zipCode) : null]
    .filter(Boolean)
    .join(' · ')
}
