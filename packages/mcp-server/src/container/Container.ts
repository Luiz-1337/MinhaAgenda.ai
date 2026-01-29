/**
 * Factory para criação de instâncias
 */
type Factory<T> = () => T

/**
 * Container simples de Injeção de Dependências
 */
export class Container {
  private factories = new Map<string, Factory<unknown>>()
  private singletons = new Map<string, unknown>()
  private singletonTokens = new Set<string>()

  /**
   * Registra uma factory para um token
   * Cria nova instância a cada resolve
   */
  register<T>(token: string, factory: Factory<T>): void {
    this.factories.set(token, factory)
  }

  /**
   * Registra uma factory como singleton
   * Reutiliza a mesma instância em todos os resolves
   */
  singleton<T>(token: string, factory: Factory<T>): void {
    this.factories.set(token, factory)
    this.singletonTokens.add(token)
  }

  /**
   * Resolve uma dependência pelo token
   */
  resolve<T>(token: string): T {
    // Se é singleton e já foi criado, retorna instância existente
    if (this.singletonTokens.has(token) && this.singletons.has(token)) {
      return this.singletons.get(token) as T
    }

    // Busca factory
    const factory = this.factories.get(token)
    if (!factory) {
      throw new Error(`Dependência não registrada: ${token}`)
    }

    // Cria instância
    const instance = factory() as T

    // Se é singleton, armazena para reuso
    if (this.singletonTokens.has(token)) {
      this.singletons.set(token, instance)
    }

    return instance
  }

  /**
   * Verifica se um token está registrado
   */
  has(token: string): boolean {
    return this.factories.has(token)
  }

  /**
   * Remove um registro
   */
  unregister(token: string): void {
    this.factories.delete(token)
    this.singletons.delete(token)
    this.singletonTokens.delete(token)
  }

  /**
   * Limpa todas as instâncias singleton (para testes)
   */
  clearSingletons(): void {
    this.singletons.clear()
  }

  /**
   * Limpa todo o container
   */
  clear(): void {
    this.factories.clear()
    this.singletons.clear()
    this.singletonTokens.clear()
  }
}

// Instância global do container
export const container = new Container()
