import { z } from "zod"
import type { Container } from "../../container"

/**
 * Contexto único passado a toda tool, resolvido pelo webhook do WhatsApp.
 * `salonId`/`clientPhone`/`chatId` NUNCA vêm como input — evita que a IA
 * alucine valores (ex.: UUID nulo).
 */
export interface ToolContext {
  container: Container
  salonId: string
  clientPhone: string
  chatId?: string
}

export interface ToolDefinition {
  description: string
  inputSchema: z.ZodTypeAny
  execute: (input: any) => Promise<unknown> | unknown
}

export type ToolSet = Record<string, ToolDefinition>
