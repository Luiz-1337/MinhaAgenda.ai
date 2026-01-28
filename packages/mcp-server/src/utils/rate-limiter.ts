/**
 * Rate Limiter simples usando Map em memória
 * 
 * Ideal para proteção contra abusos em tools de agendamento.
 * Para produção de alto volume, considere usar Redis.
 */

interface RateLimitConfig {
  /** Janela de tempo em milissegundos */
  windowMs: number
  /** Máximo de requisições permitidas na janela */
  max: number
}

interface RateLimitResult {
  allowed: boolean
  remaining: number
  resetAt: number
}

// Armazena timestamps das requisições por chave
const requests = new Map<string, number[]>()

// Limpa entradas antigas periodicamente (a cada 5 minutos)
const CLEANUP_INTERVAL = 5 * 60 * 1000
let cleanupTimer: ReturnType<typeof setInterval> | null = null

function startCleanup(): void {
  if (cleanupTimer) return
  
  cleanupTimer = setInterval(() => {
    const now = Date.now()
    const maxAge = 10 * 60 * 1000 // Remove entradas mais antigas que 10 minutos
    
    for (const [key, timestamps] of requests.entries()) {
      const recent = timestamps.filter(t => now - t < maxAge)
      if (recent.length === 0) {
        requests.delete(key)
      } else {
        requests.set(key, recent)
      }
    }
  }, CLEANUP_INTERVAL)
  
  // Não bloqueia o processo de encerrar
  cleanupTimer.unref?.()
}

/**
 * Verifica se uma requisição está dentro do rate limit
 * 
 * @param key - Identificador único (ex: `${salonId}:createAppointment`)
 * @param config - Configuração do rate limit
 * @returns Resultado com status e informações
 * 
 * @example
 * const result = checkRateLimit('salon-123:createAppointment', { windowMs: 60000, max: 10 })
 * if (!result.allowed) {
 *   throw new Error(`Rate limit excedido. Tente novamente em ${Math.ceil((result.resetAt - Date.now()) / 1000)}s`)
 * }
 */
export function checkRateLimit(key: string, config: RateLimitConfig): RateLimitResult {
  startCleanup()
  
  const now = Date.now()
  const windowStart = now - config.windowMs
  
  // Filtra apenas requisições dentro da janela
  const timestamps = requests.get(key) || []
  const recentRequests = timestamps.filter(t => t > windowStart)
  
  const allowed = recentRequests.length < config.max
  const remaining = Math.max(0, config.max - recentRequests.length - (allowed ? 1 : 0))
  const oldestInWindow = recentRequests[0] || now
  const resetAt = oldestInWindow + config.windowMs
  
  if (allowed) {
    recentRequests.push(now)
    requests.set(key, recentRequests)
  }
  
  return { allowed, remaining, resetAt }
}

/**
 * Verifica rate limit e lança erro se excedido
 * 
 * @param key - Identificador único
 * @param config - Configuração do rate limit
 * @throws Error se o rate limit for excedido
 * 
 * @example
 * // Lança erro automaticamente se exceder limite
 * assertRateLimit('salon-123:createAppointment', { windowMs: 60000, max: 10 })
 */
export function assertRateLimit(key: string, config: RateLimitConfig): void {
  const result = checkRateLimit(key, config)
  
  if (!result.allowed) {
    const waitSeconds = Math.ceil((result.resetAt - Date.now()) / 1000)
    throw new Error(
      `Rate limit excedido. Máximo de ${config.max} requisições por ${config.windowMs / 1000}s. ` +
      `Tente novamente em ${waitSeconds}s.`
    )
  }
}

/**
 * Configurações padrão para diferentes operações
 */
export const RATE_LIMITS = {
  /** Limite para criação de agendamentos: 10 por minuto */
  CREATE_APPOINTMENT: { windowMs: 60_000, max: 10 },
  
  /** Limite para verificação de disponibilidade: 30 por minuto */
  CHECK_AVAILABILITY: { windowMs: 60_000, max: 30 },
  
  /** Limite para operações de atualização: 20 por minuto */
  UPDATE_APPOINTMENT: { windowMs: 60_000, max: 20 },
  
  /** Limite para cancelamentos: 10 por minuto */
  DELETE_APPOINTMENT: { windowMs: 60_000, max: 10 },
} as const

/**
 * Limpa todos os dados de rate limit (útil para testes)
 */
export function clearRateLimitData(): void {
  requests.clear()
}
