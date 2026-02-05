/**
 * Circuit Breaker para proteção de APIs externas
 * 
 * Baseado no padrão Circuit Breaker para evitar cascading failures:
 * - CLOSED: Operações normais, monitora falhas
 * - OPEN: Rejeita chamadas imediatamente quando threshold atingido
 * - HALF-OPEN: Permite chamadas de teste após timeout
 * 
 * Features:
 * - Suporte a timeouts
 * - Fallback configurável
 * - Métricas de estado
 * - Log estruturado
 */

import { logger } from "./logger";

export type CircuitState = "CLOSED" | "OPEN" | "HALF-OPEN";

export interface CircuitBreakerOptions {
  /** Nome do circuito (para logs e métricas) */
  name: string;
  /** Timeout para cada operação em ms (padrão: 5000) */
  timeout?: number;
  /** Percentual de falhas para abrir o circuito (padrão: 50) */
  errorThresholdPercentage?: number;
  /** Número mínimo de requests antes de calcular threshold (padrão: 5) */
  volumeThreshold?: number;
  /** Tempo para tentar fechar o circuito em ms (padrão: 30000) */
  resetTimeout?: number;
  /** Função de fallback quando circuito está aberto */
  fallback?: <T>(error: Error) => T | Promise<T>;
}

interface CircuitStats {
  successes: number;
  failures: number;
  timeouts: number;
  rejects: number;
  lastFailure?: Date;
  lastSuccess?: Date;
}

/**
 * Erro lançado quando o circuito está aberto
 */
export class CircuitOpenError extends Error {
  readonly name = "CircuitOpenError";
  readonly circuitName: string;
  readonly resetIn: number;

  constructor(circuitName: string, resetIn: number) {
    super(`Circuit "${circuitName}" is OPEN. Will retry in ${resetIn}ms`);
    this.circuitName = circuitName;
    this.resetIn = resetIn;
  }
}

/**
 * Erro lançado quando operação excede timeout
 */
export class CircuitTimeoutError extends Error {
  readonly name = "CircuitTimeoutError";
  readonly circuitName: string;
  readonly timeoutMs: number;

  constructor(circuitName: string, timeoutMs: number) {
    super(`Circuit "${circuitName}" operation timed out after ${timeoutMs}ms`);
    this.circuitName = circuitName;
    this.timeoutMs = timeoutMs;
  }
}

/**
 * Classe principal do Circuit Breaker
 */
export class CircuitBreaker {
  private state: CircuitState = "CLOSED";
  private stats: CircuitStats = {
    successes: 0,
    failures: 0,
    timeouts: 0,
    rejects: 0,
  };
  private lastStateChange: Date = new Date();
  private readonly options: Required<Omit<CircuitBreakerOptions, "fallback">> & {
    fallback?: CircuitBreakerOptions["fallback"];
  };

  constructor(options: CircuitBreakerOptions) {
    this.options = {
      name: options.name,
      timeout: options.timeout ?? 5000,
      errorThresholdPercentage: options.errorThresholdPercentage ?? 50,
      volumeThreshold: options.volumeThreshold ?? 5,
      resetTimeout: options.resetTimeout ?? 30000,
      fallback: options.fallback,
    };

    logger.info(
      {
        circuit: this.options.name,
        timeout: this.options.timeout,
        errorThreshold: this.options.errorThresholdPercentage,
        resetTimeout: this.options.resetTimeout,
      },
      "Circuit breaker initialized"
    );
  }

  /**
   * Executa uma operação protegida pelo circuit breaker
   */
  async fire<T>(operation: () => Promise<T>): Promise<T> {
    // Verifica se deve tentar fechar o circuito
    this.checkHalfOpen();

    // Se circuito está aberto, rejeita ou usa fallback
    if (this.state === "OPEN") {
      this.stats.rejects++;
      const resetIn = this.getResetIn();

      logger.warn(
        {
          circuit: this.options.name,
          state: this.state,
          resetIn,
          rejects: this.stats.rejects,
        },
        "Circuit breaker rejecting call"
      );

      if (this.options.fallback) {
        return this.options.fallback(new CircuitOpenError(this.options.name, resetIn));
      }

      throw new CircuitOpenError(this.options.name, resetIn);
    }

    // Executa operação com timeout
    try {
      const result = await this.executeWithTimeout(operation);
      this.recordSuccess();
      return result;
    } catch (error) {
      this.recordFailure(error);
      throw error;
    }
  }

  /**
   * Executa operação com timeout
   */
  private async executeWithTimeout<T>(operation: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.stats.timeouts++;
        reject(new CircuitTimeoutError(this.options.name, this.options.timeout));
      }, this.options.timeout);

      operation()
        .then((result) => {
          clearTimeout(timeoutId);
          resolve(result);
        })
        .catch((error) => {
          clearTimeout(timeoutId);
          reject(error);
        });
    });
  }

  /**
   * Registra sucesso
   */
  private recordSuccess(): void {
    this.stats.successes++;
    this.stats.lastSuccess = new Date();

    // Se estava HALF-OPEN, fecha o circuito
    if (this.state === "HALF-OPEN") {
      this.setState("CLOSED");
      this.resetStats();
      logger.info(
        { circuit: this.options.name },
        "Circuit breaker closed after successful test"
      );
    }
  }

  /**
   * Registra falha
   */
  private recordFailure(error: unknown): void {
    this.stats.failures++;
    this.stats.lastFailure = new Date();

    // Se estava HALF-OPEN, abre novamente
    if (this.state === "HALF-OPEN") {
      this.setState("OPEN");
      logger.warn(
        { circuit: this.options.name, err: error },
        "Circuit breaker reopened after failed test"
      );
      return;
    }

    // Verifica se deve abrir o circuito
    if (this.shouldOpen()) {
      this.setState("OPEN");
      logger.warn(
        {
          circuit: this.options.name,
          failures: this.stats.failures,
          successes: this.stats.successes,
          threshold: this.options.errorThresholdPercentage,
        },
        "Circuit breaker opened"
      );
    }
  }

  /**
   * Verifica se deve abrir o circuito
   */
  private shouldOpen(): boolean {
    const total = this.stats.successes + this.stats.failures;

    // Só avalia se atingiu volume mínimo
    if (total < this.options.volumeThreshold) {
      return false;
    }

    const errorPercentage = (this.stats.failures / total) * 100;
    return errorPercentage >= this.options.errorThresholdPercentage;
  }

  /**
   * Verifica se deve tentar HALF-OPEN
   */
  private checkHalfOpen(): void {
    if (this.state !== "OPEN") {
      return;
    }

    const elapsed = Date.now() - this.lastStateChange.getTime();
    if (elapsed >= this.options.resetTimeout) {
      this.setState("HALF-OPEN");
      logger.info(
        { circuit: this.options.name },
        "Circuit breaker entering HALF-OPEN state"
      );
    }
  }

  /**
   * Altera estado do circuito
   */
  private setState(state: CircuitState): void {
    this.state = state;
    this.lastStateChange = new Date();
  }

  /**
   * Reseta estatísticas
   */
  private resetStats(): void {
    this.stats = {
      successes: 0,
      failures: 0,
      timeouts: 0,
      rejects: 0,
    };
  }

  /**
   * Tempo restante para tentar fechar
   */
  private getResetIn(): number {
    const elapsed = Date.now() - this.lastStateChange.getTime();
    return Math.max(0, this.options.resetTimeout - elapsed);
  }

  /**
   * Retorna estado atual do circuito
   */
  getState(): CircuitState {
    this.checkHalfOpen();
    return this.state;
  }

  /**
   * Retorna estatísticas do circuito
   */
  getStats(): CircuitStats & { state: CircuitState } {
    return {
      ...this.stats,
      state: this.getState(),
    };
  }

  /**
   * Força abertura do circuito (útil para testes)
   */
  forceOpen(): void {
    this.setState("OPEN");
    logger.warn({ circuit: this.options.name }, "Circuit breaker force opened");
  }

  /**
   * Força fechamento do circuito (útil para testes)
   */
  forceClose(): void {
    this.setState("CLOSED");
    this.resetStats();
    logger.info({ circuit: this.options.name }, "Circuit breaker force closed");
  }
}

// ============================================================================
// Circuit Breakers pré-configurados para APIs externas
// ============================================================================

/**
 * Circuit Breaker para Evolution API (WhatsApp)
 * Importado do evolution-api.service.ts
 */

/**
 * Circuit Breaker para operações de banco de dados
 */
export const databaseCircuitBreaker = new CircuitBreaker({
  name: "database",
  timeout: 5000, // 5s
  errorThresholdPercentage: 60, // Mais tolerante
  volumeThreshold: 10,
  resetTimeout: 15000, // 15s - recupera mais rápido
});

/**
 * Circuit Breaker para APIs de AI (OpenAI, etc)
 */
export const aiCircuitBreaker = new CircuitBreaker({
  name: "ai-api",
  timeout: 30000, // 30s - AI pode ser lento
  errorThresholdPercentage: 40, // Mais sensível
  volumeThreshold: 3,
  resetTimeout: 60000, // 1min - dá mais tempo para recuperar
});

/**
 * Helper para executar com circuit breaker
 */
export async function withCircuitBreaker<T>(
  breaker: CircuitBreaker,
  operation: () => Promise<T>
): Promise<T> {
  return breaker.fire(operation);
}

/**
 * Retorna status de todos os circuit breakers
 */
export async function getAllCircuitBreakersStatus(): Promise<Record<string, CircuitStats & { state: CircuitState }>> {
  // Import dinâmico para evitar dependência circular
  const { evolutionCircuitBreaker } = await import('./services/evolution-api.service');

  return {
    evolution: evolutionCircuitBreaker.getStats(),
    database: databaseCircuitBreaker.getStats(),
    ai: aiCircuitBreaker.getStats(),
  };
}
