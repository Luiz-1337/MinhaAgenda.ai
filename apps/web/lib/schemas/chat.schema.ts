/**
 * Schemas de validação para chat e mensagens
 */

import { z } from "zod"
import type { CoreMessage } from "ai"

export const coreMessageSchema: z.ZodType<CoreMessage> = z.object({
  role: z.enum(["system", "user", "assistant", "tool"]),
  content: z.string().min(1, "content é obrigatório"),
  name: z.string().optional(),
  id: z.string().optional(),
  toolCallId: z.string().optional(),
})

export const chatRequestSchema = z.object({
  messages: z.array(coreMessageSchema),
  salonId: z.string().uuid().optional(),
})

export type ChatRequest = z.infer<typeof chatRequestSchema>

