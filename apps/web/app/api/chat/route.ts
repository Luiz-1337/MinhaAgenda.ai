import { openai } from "@ai-sdk/openai"
import { streamText, tool, type CoreMessage } from "ai"
import { z } from "zod"

import { getAvailableSlots } from "@/lib/availability"

const SYSTEM_PROMPT =
  "You are a helpful salon assistant. Always check availability using the tool before suggesting times."

const DEFAULT_SERVICE_DURATION_MINUTES = 60

const checkAvailability = tool({
  description: "Verifica horários disponíveis para um salão em uma data específica.",
  parameters: z.object({
    date: z.string().describe("Data (ISO) do dia solicitado."),
    salonId: z.string().min(1, "salonId é obrigatório"),
  }),
  execute: async ({ date, salonId }) => {
    const slots = await getAvailableSlots({
      date,
      salonId,
      serviceDuration: DEFAULT_SERVICE_DURATION_MINUTES,
    })

    return { slots }
  },
})

const coreMessageSchema: z.ZodType<CoreMessage> = z.object({
  role: z.enum(["system", "user", "assistant", "tool"]),
  content: z.string().min(1, "content é obrigatório"),
  name: z.string().optional(),
  id: z.string().optional(),
  toolCallId: z.string().optional(),
})

const requestSchema = z.object({
  messages: z.array(coreMessageSchema),
})

export async function POST(req: Request) {
  const { messages } = requestSchema.parse(await req.json())

  const result = streamText({
    model: openai("gpt-4o-mini"),
    system: SYSTEM_PROMPT,
    messages,
    tools: {
      checkAvailability,
    },
  })

  return result.toDataStreamResponse()
}

