import { MessageValidator } from './use-cases/message-validator'
import { ProcessChatMessageUseCase } from './use-cases/process-chat-message.use-case'
import { createClient } from '@/lib/supabase/server'
import { logger } from '@repo/db/infrastructure/logger'

/**
 * Chat API route handler
 * Thin handler that delegates to use cases
 */
export async function POST(req: Request) {
  try {
    const body = await req.json()

    const validationResult = MessageValidator.validate(body)

    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    const clientId = user?.id

    const useCase = new ProcessChatMessageUseCase(
      validationResult.salonId,
      validationResult.messages,
      clientId
    )

    return await useCase.execute()
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)

    if (errorMessage.includes('salonId é obrigatório')) {
      return new Response(errorMessage, { status: 400 })
    }

    logger.error('Error processing chat message', { error: errorMessage }, error as Error)
    return new Response('Internal server error', { status: 500 })
  }
}
