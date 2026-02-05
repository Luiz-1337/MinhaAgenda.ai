/**
 * Evolution API Base HTTP Client
 *
 * Provides HTTP client for Evolution API with:
 * - Circuit breaker protection
 * - Automatic retries
 * - Error handling
 * - Type-safe API calls
 */

import { CircuitBreaker } from '../circuit-breaker';
import { logger } from '../logger';

/**
 * Evolution API Error
 */
export class EvolutionAPIError extends Error {
  readonly name = 'EvolutionAPIError';
  readonly retryable: boolean;
  readonly statusCode?: number;
  readonly evolutionCode?: string;

  constructor(
    message: string,
    statusCode?: number,
    evolutionCode?: string
  ) {
    super(message);
    this.statusCode = statusCode;
    this.evolutionCode = evolutionCode;

    // Determine if retryable based on status code
    this.retryable = isRetryableStatusCode(statusCode);
  }
}

/**
 * Check if status code indicates retryable error
 */
function isRetryableStatusCode(code?: number): boolean {
  if (!code) return true;

  // Server errors and timeouts are retryable
  if (code >= 500) return true;
  if (code === 408) return true; // Request timeout
  if (code === 429) return true; // Rate limit

  // Client errors are not retryable
  return false;
}

/**
 * Evolution API Circuit Breaker
 */
export const evolutionCircuitBreaker = new CircuitBreaker({
  name: 'evolution-api',
  timeout: 30000, // 30s - envio para grupos pode demorar; status/connect costumam ser rápidos
  errorThresholdPercentage: 50,
  volumeThreshold: 5,
  resetTimeout: 30000, // 30s
  fallback: (error) => {
    logger.error(
      { err: error },
      'Evolution API circuit breaker fallback triggered'
    );
    throw new Error('WhatsApp service temporarily unavailable. Please try again later.');
  },
});

/**
 * Evolution API Base HTTP Client
 */
export class EvolutionAPIClient {
  private baseUrl: string;
  private apiKey: string;

  constructor() {
    this.baseUrl = process.env.EVOLUTION_API_URL!;
    this.apiKey = process.env.EVOLUTION_API_KEY!;

    if (!this.baseUrl) {
      throw new Error('EVOLUTION_API_URL environment variable is required');
    }

    if (!this.apiKey) {
      throw new Error('EVOLUTION_API_KEY environment variable is required');
    }
  }

  /**
   * Make HTTP request to Evolution API
   *
   * Protected by circuit breaker
   */
  async request<T>(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    path: string,
    body?: unknown
  ): Promise<T> {
    const startTime = Date.now();

    try {
      return await evolutionCircuitBreaker.fire(async () => {
        const url = `${this.baseUrl}${path}`;

        logger.debug(
          {
            method,
            url,
            hasBody: !!body,
          },
          'Evolution API request'
        );

        const response = await fetch(url, {
          method,
          headers: {
            'apikey': this.apiKey,
            'Content-Type': 'application/json',
          },
          body: body ? JSON.stringify(body) : undefined,
        });

        const duration = Date.now() - startTime;

        // Try to parse error body
        if (!response.ok) {
          let errorBody: any;
          try {
            errorBody = await response.json();
          } catch {
            errorBody = { message: await response.text().catch(() => 'Unknown error') };
          }

          logger.error(
            {
              method,
              url,
              status: response.status,
              error: errorBody,
              duration,
            },
            'Evolution API request failed'
          );

          throw new EvolutionAPIError(
            errorBody.message || `Evolution API error: ${response.status}`,
            response.status,
            errorBody.code
          );
        }

        // Parse success response
        const data = await response.json();

        logger.debug(
          {
            method,
            url,
            status: response.status,
            duration,
          },
          'Evolution API request successful'
        );

        return data as T;
      });
    } catch (error) {
      const duration = Date.now() - startTime;

      // Re-throw Evolution API errors
      if (error instanceof EvolutionAPIError) {
        throw error;
      }

      // Handle other errors
      logger.error(
        {
          err: error,
          method,
          path,
          duration,
        },
        'Evolution API request error'
      );

      throw new EvolutionAPIError(
        error instanceof Error ? error.message : 'Unknown error',
        undefined,
        undefined
      );
    }
  }

  /**
   * GET request
   */
  async get<T>(path: string): Promise<T> {
    return this.request<T>('GET', path);
  }

  /**
   * POST request
   */
  async post<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>('POST', path, body);
  }

  /**
   * PUT request
   */
  async put<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>('PUT', path, body);
  }

  /**
   * DELETE request
   */
  async delete<T>(path: string): Promise<T> {
    return this.request<T>('DELETE', path);
  }

  /**
   * POST com timeout customizado, sem circuit breaker.
   * Usado para envio de teste (grupos podem demorar >30s).
   */
  async postWithTimeout<T>(
    path: string,
    body: unknown,
    timeoutMs: number
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      logger.debug({ url, timeoutMs }, 'Evolution API request (no circuit breaker)');
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'apikey': this.apiKey,
          'Content-Type': 'application/json',
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        let errorBody: { message?: string; code?: string };
        try {
          errorBody = await response.json();
        } catch {
          errorBody = { message: await response.text().catch(() => 'Unknown error') };
        }
        const msg = Array.isArray(errorBody?.message)
          ? (errorBody.message as string[]).flat().join('; ')
          : (errorBody?.message || `Evolution API error: ${response.status}`);
        throw new EvolutionAPIError(msg, response.status, errorBody?.code);
      }

      const data = await response.json();
      return data as T;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof EvolutionAPIError) throw error;
      if (error instanceof Error && error.name === 'AbortError') {
        throw new EvolutionAPIError(
          `Request timed out after ${timeoutMs}ms`,
          408
        );
      }
      throw new EvolutionAPIError(
        error instanceof Error ? error.message : 'Unknown error',
        undefined,
        undefined
      );
    }
  }
}

/**
 * Singleton Evolution API client instance
 */
let clientInstance: EvolutionAPIClient | null = null;

/**
 * Get Evolution API client instance (singleton)
 */
export function getEvolutionClient(): EvolutionAPIClient {
  if (!clientInstance) {
    clientInstance = new EvolutionAPIClient();
  }
  return clientInstance;
}
