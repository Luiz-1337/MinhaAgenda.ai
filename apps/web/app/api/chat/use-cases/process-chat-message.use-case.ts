import type { CoreMessage } from '@/lib/schemas/chat.schema'
import { db, agents, and, eq } from '@repo/db'
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
import { runOpenAIResponses } from '@/lib/services/ai/openai-responses-runner.service'
import type { ToolSetDefinition } from '@/lib/services/ai/tools/tool-definition'
import { getAvailableSlots } from '@/lib/availability'
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
    const agentModel = agentInfo?.model || 'gpt-5-mini'
    const modelName = mapModelToOpenAI(agentModel)

    const response = await runOpenAIResponses({
      model: modelName,
      instructions: systemPrompt,
      input: this.messages,
      tools,
      maxToolRounds: 5,
    })

    logger.debug('Tokens captured in response', {
      input: response.usage.inputTokens,
      output: response.usage.outputTokens,
      total: response.usage.totalTokens,
    })

    await this.saveMessageUseCase.executeAssistantMessage(
      this.salonId,
      this.clientId,
      chatId,
      response.text,
      {
        inputTokens: response.usage.inputTokens,
        outputTokens: response.usage.outputTokens,
        totalTokens: response.usage.totalTokens,
        model: agentModel,
      }
    )

    return new Response(response.text, {
      status: 200,
      headers: {
        'content-type': 'text/plain; charset=utf-8',
      },
    })
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

  private createTools(): ToolSetDefinition {
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
