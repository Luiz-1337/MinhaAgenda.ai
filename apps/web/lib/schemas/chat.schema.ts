/**
 * Schemas de validação para chat e mensagens
 */

import { z } from "zod"

export const coreMessageSchema = z.discriminatedUnion("role", [
  z.object({
    role: z.literal("system"),
    content: z.string().min(1, "content é obrigatório"),
    id: z.string().optional(),
    name: z.string().optional(),
  }),
  z.object({
    role: z.literal("user"),
    content: z.union([z.string(), z.array(z.any())]),
    name: z.string().optional(),
    id: z.string().optional(),
  }),
  z.object({
    role: z.literal("assistant"),
    content: z.union([z.string(), z.array(z.any())]).or(z.literal("")),
    name: z.string().optional(),
    id: z.string().optional(),
    toolCalls: z.array(z.any()).optional(),
  }),
  z.object({
    role: z.literal("tool"),
    content: z.union([z.string(), z.array(z.any())]),
    toolCallId: z.string().min(1, "toolCallId é obrigatório para mensagens tool"),
    name: z.string().optional(),
    id: z.string().optional(),
  }),
])

export const uiMessagePartSchema = z.object({
  type: z.string(),
  text: z.string().optional(),
}).catchall(z.unknown())

export const uiMessageSchema = z.object({
  id: z.string().optional(),
  role: z.enum(["system", "developer", "user", "assistant"]),
  parts: z.array(uiMessagePartSchema),
})

export const chatRequestSchema = z.object({
  messages: z.array(coreMessageSchema),
  salonId: z.string().uuid().optional(),
})

export type CoreMessage = z.infer<typeof coreMessageSchema>
export type UIMessagePart = z.infer<typeof uiMessagePartSchema>
export type UIMessage = z.infer<typeof uiMessageSchema>
export type ChatRequest = z.infer<typeof chatRequestSchema>
