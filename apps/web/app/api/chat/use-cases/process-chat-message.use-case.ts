import type { CoreMessage } from 'ai'
import { streamText } from 'ai'
import { openai } from '@ai-sdk/openai'
import { db, salons, agents } from '@repo/db'
import { and, eq } from 'drizzle-orm'
import {
  createAvailabilityTool,
  createBookAppointmentTool,
  createGetServicesTool,
  createGetProductsTool,
  createGetProfessionalsTool,
  createSaveUserPreferencesTool,
} from '@/lib/services/ai/tools'
import { createSalonAssistantPrompt } from '@/lib/services/ai/system-prompt-builder.service'
import { getActiveAgentInfo } from '@/lib/services/ai/agent-info.service'
import { mapModelToOpenAI } from '@/lib/services/ai/model-mapper.service'
import { getAvailableSlots } from '@/lib/availability'
import { createClient } from '@/lib/supabase/server'
import { RetrieveKnowledgeContextUseCase } from './retrieve-knowledge-context.use-case'
import { SaveChatMessageUseCase } from './save-chat-message.use-case'
import { logger } from '@repo/db/infrastructure/logger'

/**
 * Use case for processing chat messages
 * Orchestrates the entire chat flow
 */
export class ProcessChatMessageUseCase {
  private readonly knowledgeContextUseCase: RetrieveKnowledgeContextUseCase
  private readonly saveMessageUseCase: SaveChatMessageUseCase

  constructor(
    private readonly salonId: string,
    private readonly messages: CoreMessage[],
    private readonly clientId?: string
  ) {
    this.knowledgeContextUseCase = new RetrieveKnowledgeContextUseCase()
    this.saveMessageUseCase = new SaveChatMessageUseCase()
  }

  async execute() {
    const salon = await db.query.salons.findFirst({
      where: eq(salons.id, this.salonId),
      columns: { name: true },
    })

    const salonName = salon?.name || 'nosso salão'
    const preferences: Record<string, unknown> | undefined = undefined

    const knowledgeContext = await this.retrieveKnowledgeContext()

    const systemPrompt = await createSalonAssistantPrompt(
      this.salonId,
      preferences,
      knowledgeContext
    )

    const tools = this.createTools()

    const chatId = this.clientId
      ? await this.saveMessageUseCase.findOrCreateChat(this.clientId, this.salonId)
      : null

    await this.saveUserMessage()

    const agentInfo = await getActiveAgentInfo(this.salonId)
    const agentModel = agentInfo?.model || 'gpt-4o-mini'
    const modelName = mapModelToOpenAI(agentModel)

    let usageData: { inputTokens?: number; outputTokens?: number; totalTokens?: number } | null =
      null

    const result = streamText({
      model: openai(modelName),
      system: systemPrompt,
      messages: this.messages,
      tools,
      onFinish: async ({ text, usage }) => {
        if (usage) {
          usageData = {
            inputTokens: usage.inputTokens ?? undefined,
            outputTokens: usage.outputTokens ?? undefined,
            totalTokens: usage.totalTokens ?? undefined,
          }
          logger.debug('Tokens captured in onFinish', {
            input: usageData.inputTokens,
            output: usageData.outputTokens,
            total: usageData.totalTokens,
          })
        }

        await this.saveMessageUseCase.executeAssistantMessage(
          this.salonId,
          this.clientId,
          chatId,
          text,
          {
            inputTokens: usageData?.inputTokens,
            outputTokens: usageData?.outputTokens,
            totalTokens: usageData?.totalTokens,
            model: agentModel,
          }
        )
      },
    })

    if (!usageData && result.usage) {
      const usage = await result.usage
      usageData = {
        inputTokens: usage.inputTokens ?? undefined,
        outputTokens: usage.outputTokens ?? undefined,
        totalTokens: usage.totalTokens ?? undefined,
      }
      logger.debug('Tokens obtained from result', {
        input: usageData.inputTokens,
        output: usageData.outputTokens,
        total: usageData.totalTokens,
      })
    }

    return result.toTextStreamResponse()
  }

  private async retrieveKnowledgeContext(): Promise<string | undefined> {
    const activeAgent = await db.query.agents.findFirst({
      where: and(eq(agents.salonId, this.salonId), eq(agents.isActive, true)),
      columns: { id: true },
    })

    if (!activeAgent) {
      logger.debug('No active agent found for RAG context', { salonId: this.salonId })
      return undefined
    }

    const userMessage = RetrieveKnowledgeContextUseCase.extractUserMessage(this.messages)
    if (!userMessage) {
      return undefined
    }

    return this.knowledgeContextUseCase.execute(activeAgent.id, userMessage)
  }

  private createTools() {
    return {
      checkAvailability: createAvailabilityTool(this.salonId, async (params) => {
        return await getAvailableSlots({
          date: params.date,
          salonId: params.salonId,
          serviceDuration: params.serviceDuration,
          professionalId: params.professionalId,
        })
      }),
      bookAppointment: createBookAppointmentTool(this.salonId, this.clientId),
      getServices: createGetServicesTool(this.salonId),
      getProducts: createGetProductsTool(this.salonId),
      getProfessionals: createGetProfessionalsTool(this.salonId),
      saveUserPreferences: createSaveUserPreferencesTool(this.salonId, this.clientId),
    }
  }

  private async saveUserMessage(): Promise<void> {
    const userMessage = SaveChatMessageUseCase.extractLastUserMessage(this.messages)
    if (!userMessage) {
      return
    }

    await this.saveMessageUseCase.executeUserMessage(this.salonId, this.clientId, userMessage)
  }
}
