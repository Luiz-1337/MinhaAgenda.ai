/**
 * Distributed Tracing - Correlação de requests webhook → worker → AI
 * 
 * Implementação leve de tracing sem dependências pesadas do OpenTelemetry.
 * Pode ser migrado para OpenTelemetry completo quando necessário.
 * 
 * Features:
 * - Trace ID único por request
 * - Span hierárquico
 * - Contexto propagado entre componentes
 * - Métricas de timing
 */

import { logger } from "./logger";
import { randomUUID } from "crypto";

/**
 * Contexto de trace
 */
export interface TraceContext {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  baggage?: Record<string, string>;
}

/**
 * Dados de um span
 */
export interface SpanData {
  name: string;
  startTime: number;
  endTime?: number;
  status: "OK" | "ERROR" | "UNSET";
  attributes: Record<string, string | number | boolean>;
  events: SpanEvent[];
  error?: Error;
}

/**
 * Evento dentro de um span
 */
export interface SpanEvent {
  name: string;
  timestamp: number;
  attributes?: Record<string, string | number | boolean>;
}

// Storage de contexto atual (usando AsyncLocalStorage seria ideal, mas simplificamos)
const activeSpans = new Map<string, Span>();

/**
 * Gera IDs únicos
 */
function generateTraceId(): string {
  return randomUUID().replace(/-/g, "");
}

function generateSpanId(): string {
  return randomUUID().replace(/-/g, "").substring(0, 16);
}

/**
 * Classe Span para representar uma operação
 */
export class Span {
  private data: SpanData;
  private context: TraceContext;
  private children: Span[] = [];

  constructor(name: string, parentContext?: TraceContext) {
    this.context = {
      traceId: parentContext?.traceId || generateTraceId(),
      spanId: generateSpanId(),
      parentSpanId: parentContext?.spanId,
      baggage: parentContext?.baggage ? { ...parentContext.baggage } : {},
    };

    this.data = {
      name,
      startTime: Date.now(),
      status: "UNSET",
      attributes: {},
      events: [],
    };

    activeSpans.set(this.context.spanId, this);
  }

  /**
   * Define atributos no span
   */
  setAttribute(key: string, value: string | number | boolean): this {
    this.data.attributes[key] = value;
    return this;
  }

  /**
   * Define múltiplos atributos
   */
  setAttributes(attributes: Record<string, string | number | boolean>): this {
    Object.assign(this.data.attributes, attributes);
    return this;
  }

  /**
   * Adiciona evento ao span
   */
  addEvent(name: string, attributes?: Record<string, string | number | boolean>): this {
    this.data.events.push({
      name,
      timestamp: Date.now(),
      attributes,
    });
    return this;
  }

  /**
   * Define status como OK
   */
  setOk(): this {
    this.data.status = "OK";
    return this;
  }

  /**
   * Define status como ERROR e registra exceção
   */
  setError(error: Error): this {
    this.data.status = "ERROR";
    this.data.error = error;
    this.setAttribute("error.message", error.message);
    this.setAttribute("error.name", error.name);
    if (error.stack) {
      this.setAttribute("error.stack", error.stack.substring(0, 500));
    }
    return this;
  }

  /**
   * Cria span filho
   */
  startChild(name: string): Span {
    const child = new Span(name, this.context);
    this.children.push(child);
    return child;
  }

  /**
   * Finaliza o span
   */
  end(): void {
    this.data.endTime = Date.now();
    const duration = this.data.endTime - this.data.startTime;

    // Log estruturado do span
    logger.info(
      {
        trace: {
          traceId: this.context.traceId,
          spanId: this.context.spanId,
          parentSpanId: this.context.parentSpanId,
        },
        span: {
          name: this.data.name,
          duration,
          status: this.data.status,
          attributes: this.data.attributes,
          eventCount: this.data.events.length,
        },
      },
      `Span: ${this.data.name}`
    );

    activeSpans.delete(this.context.spanId);
  }

  /**
   * Retorna contexto para propagação
   */
  getContext(): TraceContext {
    return { ...this.context };
  }

  /**
   * Retorna trace ID (para logs)
   */
  getTraceId(): string {
    return this.context.traceId;
  }

  /**
   * Retorna duração atual (sem finalizar)
   */
  getDuration(): number {
    return Date.now() - this.data.startTime;
  }
}

/**
 * Cria um novo trace (span raiz)
 */
export function startTrace(name: string): Span {
  return new Span(name);
}

/**
 * Cria span filho de um contexto existente
 */
export function startSpan(name: string, parentContext: TraceContext): Span {
  return new Span(name, parentContext);
}

/**
 * Extrai contexto de headers HTTP (para propagação entre serviços)
 */
export function extractContextFromHeaders(
  headers: Headers | Record<string, string>
): TraceContext | undefined {
  const getHeader = (name: string): string | null => {
    if (headers instanceof Headers) {
      return headers.get(name);
    }
    return headers[name] || headers[name.toLowerCase()] || null;
  };

  // Suporta formato W3C Trace Context (traceparent)
  const traceparent = getHeader("traceparent");
  if (traceparent) {
    const parts = traceparent.split("-");
    if (parts.length >= 3) {
      return {
        traceId: parts[1],
        spanId: generateSpanId(),
        parentSpanId: parts[2],
      };
    }
  }

  // Suporta formato customizado (x-trace-id)
  const traceId = getHeader("x-trace-id");
  if (traceId) {
    return {
      traceId,
      spanId: generateSpanId(),
      parentSpanId: getHeader("x-span-id") || undefined,
    };
  }

  return undefined;
}

/**
 * Injeta contexto em headers HTTP (para propagação)
 */
export function injectContextToHeaders(
  context: TraceContext,
  headers: Headers | Record<string, string>
): void {
  const setHeader = (name: string, value: string) => {
    if (headers instanceof Headers) {
      headers.set(name, value);
    } else {
      headers[name] = value;
    }
  };

  // Formato W3C Trace Context
  setHeader("traceparent", `00-${context.traceId}-${context.spanId}-01`);

  // Formato customizado para backward compatibility
  setHeader("x-trace-id", context.traceId);
  setHeader("x-span-id", context.spanId);
  if (context.parentSpanId) {
    setHeader("x-parent-span-id", context.parentSpanId);
  }
}

/**
 * Helper para executar função com span automático
 */
export async function withSpan<T>(
  name: string,
  fn: (span: Span) => Promise<T>,
  parentContext?: TraceContext
): Promise<T> {
  const span = parentContext ? startSpan(name, parentContext) : startTrace(name);

  try {
    const result = await fn(span);
    span.setOk();
    return result;
  } catch (error) {
    span.setError(error instanceof Error ? error : new Error(String(error)));
    throw error;
  } finally {
    span.end();
  }
}

/**
 * Helper para adicionar tracing a um handler de webhook
 */
export function createTracedHandler<T extends (...args: unknown[]) => Promise<unknown>>(
  name: string,
  handler: T
): T {
  return (async (...args: unknown[]) => {
    return withSpan(name, async (span) => {
      // Tenta extrair contexto do primeiro argumento se for Request
      if (args[0] instanceof Request) {
        const existingContext = extractContextFromHeaders(args[0].headers);
        if (existingContext) {
          span.setAttribute("parentTraceId", existingContext.traceId);
        }
      }

      return handler(...args);
    });
  }) as T;
}

/**
 * Serializa contexto para passar via job queue
 */
export function serializeContext(context: TraceContext): string {
  return JSON.stringify(context);
}

/**
 * Deserializa contexto de job queue
 */
export function deserializeContext(serialized: string): TraceContext | undefined {
  try {
    return JSON.parse(serialized) as TraceContext;
  } catch {
    return undefined;
  }
}
