/**
 * Cifra simétrica em repouso para segredos por-tenant guardados pelo @repo/db
 * (ex.: o token da agenda externa de cada salão em `salon_integrations`).
 *
 * MESMO formato e MESMA derivação de chave de `apps/web/lib/infra/crypto.ts`
 * (AES-256-GCM, envelope "v1:<ivB64>:<tagB64>:<ctB64>", chave = SHA-256 de
 * ENCRYPTION_KEY): um lado decifra o que o outro cifrou. Existe uma cópia aqui
 * porque `packages/*` não pode importar de `apps/*` — se mudar o formato, mude
 * os dois e mantenha o prefixo de versão.
 *
 * Sem dependências além de node:crypto, de propósito: entra no grafo do worker.
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'

const VERSION = 'v1'
const ALGO = 'aes-256-gcm'
const IV_BYTES = 12 // recomendado para GCM

function getKey(): Buffer {
  const raw = process.env.ENCRYPTION_KEY
  if (!raw) {
    throw new Error('ENCRYPTION_KEY ausente — necessária para cifrar segredos em repouso.')
  }
  // KDF determinístico: qualquer segredo → 32 bytes (chave AES-256). Sem cache de
  // propósito: o custo é desprezível e o teste consegue trocar a chave.
  return createHash('sha256').update(raw, 'utf8').digest()
}

/** True se o valor tem o envelope de cifra desta versão. */
export function isEncryptedSecret(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.startsWith(`${VERSION}:`)
}

/** Cifra um texto claro. Retorna o envelope "v1:iv:tag:ct" (partes em base64). */
export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv(ALGO, getKey(), iv)
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `${VERSION}:${iv.toString('base64')}:${tag.toString('base64')}:${ct.toString('base64')}`
}

/**
 * Decifra o envelope. Lança se o formato/versão for inválido ou se a autenticação
 * falhar (chave errada / adulteração).
 */
export function decryptSecret(blob: string): string {
  const parts = blob.split(':')
  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw new Error('Formato de segredo cifrado inválido.')
  }
  const [, ivB64, tagB64, ctB64] = parts
  const decipher = createDecipheriv(ALGO, getKey(), Buffer.from(ivB64, 'base64'))
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'))
  const pt = Buffer.concat([decipher.update(Buffer.from(ctB64, 'base64')), decipher.final()])
  return pt.toString('utf8')
}
