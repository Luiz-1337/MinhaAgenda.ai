/**
 * Schemas de validação para chat e mensagens
 */

import { z } from "zod"
import type { CoreMessage } from "ai"

// Schema para mensagens do tipo CoreMessage usando discriminated union
// Nota: Não usamos z.ZodType<CoreMessage> explicitamente para evitar problemas de compatibilidade de tipos
export const coreMessageSchema = z.discriminatedUnion("role", [
  // System message
  z.object({
    role: z.literal("system"),
    content: z.string().min(1, "content é obrigatório"),
    id: z.string().optional(),
  }),
  // User message
  z.object({
    role: z.literal("user"),
    content: z.union([z.string(), z.array(z.any())]),
    name: z.string().optional(),
    id: z.string().optional(),
  }),
  // Assistant message
  // content pode ser string ou array (AssistantContent não aceita undefined)
  z.object({
    role: z.literal("assistant"),
    content: z.union([z.string(), z.array(z.any())]).or(z.literal("")),
    name: z.string().optional(),
    id: z.string().optional(),
    toolCalls: z.array(z.any()).optional(),
  }),
  // Tool message
  // ToolContent pode ser string ou array
  z.object({
    role: z.literal("tool"),
    content: z.union([z.string(), z.array(z.any())]),
    toolCallId: z.string().min(1, "toolCallId é obrigatório para mensagens tool"),
    name: z.string().optional(),
    id: z.string().optional(),
  }),
])

export const chatRequestSchema = z.object({
  messages: z.array(coreMessageSchema),
  salonId: z.string().uuid().optional(),
})

export type ChatRequest = z.infer<typeof chatRequestSchema>

