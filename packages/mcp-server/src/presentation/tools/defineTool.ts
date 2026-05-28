import type { z } from "zod"
import { ErrorPresenter } from "../presenters"
import type { ToolContext, ToolDefinition } from "./types"

type ToolHandler<S extends z.ZodTypeAny> = (
  input: z.infer<S>,
  ctx: ToolContext
) => Promise<unknown> | unknown

interface ToolConfig<S extends z.ZodTypeAny> {
  description: string
  inputSchema: S
  handler: ToolHandler<S>
}

/**
 * Define uma tool com tratamento de erro centralizado.
 *
 * Padrão único para todas as tools:
 * - O `handler` recebe o input já normalizado e o contexto (salonId, etc).
 * - Sucesso: o handler retorna o payload (geralmente via um Presenter).
 * - Erro: o handler deve lançar (use `unwrap` num Result de use-case) — o
 *   wrapper converte QUALQUER erro no mesmo shape via `ErrorPresenter.toJSON`.
 *
 * Isso elimina o `try/catch` repetido e garante um único formato de retorno
 * de erro para o consumidor (a IA).
 */
export function defineTool<S extends z.ZodTypeAny>(
  ctx: ToolContext,
  config: ToolConfig<S>
): ToolDefinition {
  return {
    description: config.description,
    inputSchema: config.inputSchema,
    execute: async (rawInput: unknown) => {
      try {
        const input = (rawInput ?? {}) as z.infer<S>
        return await config.handler(input, ctx)
      } catch (error) {
        return ErrorPresenter.toJSON(error as Error)
      }
    },
  }
}
