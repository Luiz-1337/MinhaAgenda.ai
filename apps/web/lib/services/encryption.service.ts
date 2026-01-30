/**
 * Serviço de criptografia para dados sensíveis
 * Usa AES-256-GCM para criptografar tokens de subaccounts Twilio
 */

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto"

const ALGORITHM = "aes-256-gcm"
const KEY_LENGTH = 32
const IV_LENGTH = 16
const AUTH_TAG_LENGTH = 16
const SALT_LENGTH = 32

function getEncryptionKey(): Buffer {
  const key = process.env.ENCRYPTION_KEY
  if (!key) {
    throw new Error("ENCRYPTION_KEY environment variable is required for encryption")
  }
  // Use scrypt to derive a key from the environment variable
  const salt = Buffer.alloc(SALT_LENGTH, "minhaagendaai-salt") // Fixed salt for consistency
  return scryptSync(key, salt, KEY_LENGTH)
}

/**
 * Criptografa um valor sensível
 * @param plaintext Valor a ser criptografado
 * @returns String criptografada no formato: iv:authTag:ciphertext (base64)
 */
export function encrypt(plaintext: string): string {
  const key = getEncryptionKey()
  const iv = randomBytes(IV_LENGTH)
  
  const cipher = createCipheriv(ALGORITHM, key, iv)
  
  let encrypted = cipher.update(plaintext, "utf8", "base64")
  encrypted += cipher.final("base64")
  
  const authTag = cipher.getAuthTag()
  
  // Format: iv:authTag:ciphertext (all base64)
  return `${iv.toString("base64")}:${authTag.toString("base64")}:${encrypted}`
}

/**
 * Descriptografa um valor criptografado
 * @param encryptedValue Valor criptografado no formato: iv:authTag:ciphertext
 * @returns Valor original descriptografado
 */
export function decrypt(encryptedValue: string): string {
  const key = getEncryptionKey()
  
  const parts = encryptedValue.split(":")
  if (parts.length !== 3) {
    throw new Error("Invalid encrypted value format")
  }
  
  const iv = Buffer.from(parts[0], "base64")
  const authTag = Buffer.from(parts[1], "base64")
  const ciphertext = parts[2]
  
  const decipher = createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(authTag)
  
  let decrypted = decipher.update(ciphertext, "base64", "utf8")
  decrypted += decipher.final("utf8")
  
  return decrypted
}

/**
 * Verifica se um valor está criptografado (formato válido)
 */
export function isEncrypted(value: string): boolean {
  const parts = value.split(":")
  if (parts.length !== 3) return false
  
  try {
    Buffer.from(parts[0], "base64")
    Buffer.from(parts[1], "base64")
    return true
  } catch {
    return false
  }
}
