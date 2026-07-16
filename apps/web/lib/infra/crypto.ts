/**
 * Cifra simétrica em repouso para segredos por-tenant (ex.: o access token da
 * WhatsApp Cloud API de cada salão). AES-256-GCM — autenticado: a verificação da
 * tag detecta adulteração ou chave errada no momento de decifrar.
 *
 * Formato de saída: "v1:<ivB64>:<tagB64>:<ctB64>". O prefixo de versão permite
 * rotação de chave/algoritmo no futuro sem ambiguidade na leitura.
 *
 * Chave AES: derivada de ENCRYPTION_KEY (env) via SHA-256 → 32 bytes. Assim
 * qualquer segredo de tamanho razoável vira uma chave AES-256 válida sem exigir
 * um formato específico no env (o valor já é alta entropia). ENCRYPTION_KEY é
 * exigida e tem piso de tamanho validado no boot (lib/env.ts).
 *
 * IMPORTANTE: este módulo NÃO tem dependências além de node:crypto de propósito —
 * ele entra no grafo de import do WORKER (roda sob tsx, que NÃO resolve o alias
 * `@/`). Nos módulos do worker, importe por caminho RELATIVO (ex.:
 * `../../../infra/crypto`), nunca `@/lib/infra/crypto`.
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

const VERSION = 'v1';
const ALGO = 'aes-256-gcm';
const IV_BYTES = 12; // recomendado para GCM

let cachedKey: Buffer | null = null;

function getKey(): Buffer {
  if (cachedKey) return cachedKey;
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) {
    throw new Error('ENCRYPTION_KEY ausente — necessária para cifrar segredos em repouso.');
  }
  // KDF determinístico: qualquer segredo → 32 bytes (chave AES-256).
  cachedKey = createHash('sha256').update(raw, 'utf8').digest();
  return cachedKey;
}

/** True se o valor tem o envelope de cifra desta versão. */
export function isEncrypted(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.startsWith(`${VERSION}:`);
}

/** Cifra um texto claro. Retorna o envelope "v1:iv:tag:ct" (partes em base64). */
export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGO, getKey(), iv);
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${VERSION}:${iv.toString('base64')}:${tag.toString('base64')}:${ct.toString('base64')}`;
}

/**
 * Decifra o envelope. Lança se o formato/versão for inválido ou se a autenticação
 * falhar (chave errada / adulteração). Chamadores no caminho de ENVIO devem
 * capturar e cair no fallback do token da plataforma — nunca derrubar um envio
 * por falha de decifragem.
 */
export function decryptSecret(blob: string): string {
  const parts = blob.split(':');
  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw new Error('Formato de segredo cifrado inválido.');
  }
  const [, ivB64, tagB64, ctB64] = parts;
  const decipher = createDecipheriv(ALGO, getKey(), Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  const pt = Buffer.concat([decipher.update(Buffer.from(ctB64, 'base64')), decipher.final()]);
  return pt.toString('utf8');
}
