/**
 * Cache in-memory genérico com TTL
 *
 * Usado nos repositórios singleton para evitar queries repetidas ao banco.
 * Dados de catálogo (serviços, produtos, profissionais) raramente mudam
 * e não precisam ser buscados a cada chamada de tool.
 */
export class InMemoryCache<T> {
  private store = new Map<string, { data: T; timestamp: number }>()

  constructor(private ttlMs: number) {}

  get(key: string): T | undefined {
    const entry = this.store.get(key)
    if (!entry) return undefined

    if (Date.now() - entry.timestamp > this.ttlMs) {
      this.store.delete(key)
      return undefined
    }

    return entry.data
  }

  set(key: string, data: T): void {
    this.store.set(key, { data, timestamp: Date.now() })
  }

  invalidate(key: string): void {
    this.store.delete(key)
  }

  clear(): void {
    this.store.clear()
  }
}
