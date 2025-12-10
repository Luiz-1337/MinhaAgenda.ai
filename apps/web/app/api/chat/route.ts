import { openai } from "@ai-sdk/openai"
import { streamText } from "ai"
import { getAvailableSlots } from "@/lib/availability"
import { chatRequestSchema } from "@/lib/schemas/chat.schema"
import { createAvailabilityTool } from "@/lib/services/ai.service"

const SYSTEM_PROMPT =
  "You are a helpful salon assistant. Always check availability using the tool before suggesting times."

const DEFAULT_SERVICE_DURATION_MINUTES = 60

export async function POST(req: Request) {
  const body = await req.json()
  const { messages } = chatRequestSchema.parse(body)

  const checkAvailability = createAvailabilityTool(async ({ date, salonId }) => {
    return await getAvailableSlots({
      date,
      salonId,
      serviceDuration: DEFAULT_SERVICE_DURATION_MINUTES,
    })
  })

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
