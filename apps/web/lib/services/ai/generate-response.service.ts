/**
 * Serviço para geração de respostas da IA
 * 
 * Centraliza a lógica de:
 * - Busca de contexto RAG
 * - Construção do system prompt
 * - Chamada ao modelo de AI
 * - Tratamento de erros de tools
 */

import { generateText, convertToModelMessages, UIMessage, stepCountIs } from "ai";
import { openai } from "@ai-sdk/openai";
import { createMCPTools } from "@repo/mcp-server/tools/vercel-ai";
import { createSalonAssistantPrompt } from "./system-prompt-builder.service";
import { getActiveAgentInfo } from "./agent-info.service";
import { mapModelToOpenAI } from "./model-mapper.service";
import { getChatHistory } from "../chat.service";
import { findRelevantContext } from "../../../app/actions/knowledge";
import { logger, createContextLogger, Logger } from "../../logger";
import { AIGenerationError, WhatsAppError } from "../../errors";
import { db, customers, profiles, appointments } from "@repo/db";
import { eq, and } from "drizzle-orm";

/**
 * Parâmetros para geração de resposta
 */
export interface GenerateResponseParams {
  chatId: string;
  salonId: string;
  clientPhone: string;
  userMessage: string;
  customerId?: string;
  customerName?: string;
  isNewCustomer?: boolean;
}

/**
 * Resultado da geração de resposta
 */
export interface GenerateResponseResult {
  text: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
  model: string;
  stepsCount: number;
  hasToolErrors: boolean;
}

/**
 * Gera resposta da IA para uma mensagem do usuário
 * OTIMIZADO: Queries paralelas e sem duplicação
 */
export async function generateAIResponse(
  params: GenerateResponseParams
): Promise<GenerateResponseResult> {
  const { chatId, salonId, clientPhone, userMessage, customerId, customerName, isNewCustomer } = params;
  const contextLogger = createContextLogger({ chatId, salonId, service: "ai-response" });

  const startTime = Date.now();

  try {
    // 1. PARALELO: Buscar dados independentes simultaneamente
    const [agentInfo, preferences, historyMessages, mcpTools] = await Promise.all([
      getActiveAgentInfo(salonId),
      fetchCustomerPreferences(salonId, customerId, contextLogger),
      getChatHistory(chatId, 6), // Reduzido de 10 para 6
      createMCPTools(salonId, clientPhone),
    ]);

    if (!agentInfo) {
      contextLogger.error("No active agent found for salon");
      throw new AIGenerationError("No active agent found", { retryable: false });
    }

    const agentModel = agentInfo.model || "gpt-4o-mini";
    const modelName = mapModelToOpenAI(agentModel);
    contextLogger.debug({ model: modelName, agentName: agentInfo.name, toolsCount: Object.keys(mcpTools).length }, "Context loaded in parallel");

    // 2. RAG: Só busca se agente tiver knowledge base configurada
    let knowledgeContext: string | undefined;
    if (agentInfo.id && agentInfo.hasKnowledgeBase) {
      knowledgeContext = await fetchKnowledgeContext(agentInfo.id, userMessage, contextLogger);
    }

    // 3. Montar mensagens UI
    const uiMessages: UIMessage[] = historyMessages.map((msg, idx) => ({
      id: `hist-${idx}`,
      role: msg.role as "user" | "assistant",
      parts: [{ type: "text" as const, text: msg.content }],
    }));

    uiMessages.push({
      id: `temp-${Date.now()}`,
      role: "user",
      parts: [{ type: "text" as const, text: userMessage }],
    });

    // 4. Criar system prompt (passa agentInfo para evitar query duplicada)
    const systemPrompt = await createSalonAssistantPrompt(
      salonId,
      preferences,
      knowledgeContext,
      customerName,
      customerId,
      isNewCustomer,
      agentInfo // Passa agentInfo para evitar query duplicada
    );

    // 5. Gerar resposta
    contextLogger.info({ model: modelName }, "Generating AI response");

    const { text, usage, steps } = await generateText({
      model: openai(modelName),
      system: systemPrompt,
      messages: convertToModelMessages(uiMessages),
      tools: mcpTools,
      stopWhen: stepCountIs(5), // Permite até 5 iterações: tool call → resultado → resposta textual
    });

    // 9. Verificar e tratar erros de tools
    const toolErrorMessage = handleToolErrors(steps, contextLogger);
    const hasToolErrors = !!toolErrorMessage;
    const finalText = toolErrorMessage || text;

    // 10. Validar resposta final
    if (!finalText || !finalText.trim()) {
      contextLogger.warn("AI generated empty response");
      throw new AIGenerationError("Empty AI response", { retryable: true });
    }

    const duration = Date.now() - startTime;

    contextLogger.info(
      {
        textLength: finalText.length,
        stepsCount: steps.length,
        totalTokens: usage.totalTokens,
        duration,
        hasToolErrors,
      },
      "AI response generated successfully"
    );

    return {
      text: finalText,
      usage: {
        inputTokens: usage.inputTokens ?? 0,
        outputTokens: usage.outputTokens ?? 0,
        totalTokens: usage.totalTokens ?? 0,
      },
      model: agentModel,
      stepsCount: steps.length,
      hasToolErrors,
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    contextLogger.error(
      { err: error, duration },
      "Failed to generate AI response"
    );

    if (error instanceof WhatsAppError) {
      throw error;
    }

    throw new AIGenerationError(
      error instanceof Error ? error.message : "AI generation failed",
      { retryable: true, cause: error instanceof Error ? error : undefined }
    );
  }
}

/**
 * Busca contexto RAG relevante para a mensagem
 */
async function fetchKnowledgeContext(
  agentId: string,
  userMessage: string,
  contextLogger: Logger
): Promise<string | undefined> {
  try {
    const similarityThreshold = 0.7;
    const contextResult = await findRelevantContext(
      agentId,
      userMessage,
      3,
      similarityThreshold
    );

    if (!("error" in contextResult) && contextResult.data && contextResult.data.length > 0) {
      const knowledgeContext = contextResult.data
        .map((item) => item.content)
        .join("\n\n");

      contextLogger.debug(
        {
          itemsCount: contextResult.data.length,
          threshold: similarityThreshold,
        },
        "RAG context found"
      );

      return knowledgeContext;
    }

    contextLogger.debug("No relevant RAG context found");
    return undefined;
  } catch (error) {
    contextLogger.warn({ err: error }, "Error fetching RAG context, continuing without");
    return undefined;
  }
}

/**
 * Busca preferências do cliente
 */
async function fetchCustomerPreferences(
  salonId: string,
  customerId: string | undefined,
  contextLogger: Logger
): Promise<Record<string, unknown> | undefined> {
  if (!customerId) return undefined;

  try {
    const customerRecord = await db.query.customers.findFirst({
      where: and(
        eq(customers.salonId, salonId),
        eq(customers.id, customerId)
      ),
      columns: { aiPreferences: true },
    });

    if (customerRecord?.aiPreferences) {
      const preferences = JSON.parse(customerRecord.aiPreferences);
      contextLogger.debug("Customer preferences loaded");
      return preferences;
    }
  } catch (error) {
    contextLogger.warn({ err: error }, "Error fetching customer preferences");
  }

  return undefined;
}

/**
 * Trata erros de tools e retorna mensagem apropriada
 * NÃO faz segunda chamada à AI - usa templates pré-definidos
 */
function handleToolErrors(steps: unknown[], contextLogger: Logger): string | null {
  const errors = extractToolErrors(steps);
  if (errors.length === 0) return null;

  contextLogger.warn(
    { errorCount: errors.length, tools: errors.map((e) => e.toolName) },
    "Tool errors detected"
  );

  const errorTypes = [...new Set(errors.map((e) => e.toolName))];

  // Mensagens específicas por tipo de tool (templates pré-definidos)
  if (errorTypes.includes("create_appointment") || errorTypes.includes("addAppointment")) {
    return "Desculpe, tive dificuldade ao tentar agendar. Pode me informar novamente a data e horário desejados?";
  }

  if (errorTypes.includes("list_services") || errorTypes.includes("getServices")) {
    return "Desculpe, não consegui carregar nossos serviços no momento. Por favor, tente novamente em instantes.";
  }

  if (errorTypes.includes("check_availability") || errorTypes.includes("checkAvailability")) {
    return "Tive dificuldade ao verificar disponibilidade. Pode tentar outro horário ou data?";
  }

  if (errorTypes.includes("list_professionals") || errorTypes.includes("getProfessionals")) {
    return "Desculpe, não consegui carregar a lista de profissionais. Pode tentar novamente?";
  }

  // Fallback genérico
  return "Desculpe, encontrei uma dificuldade técnica. Posso ajudar com outra coisa?";
}

/**
 * Extrai erros dos steps de execução
 */
function extractToolErrors(steps: unknown[]): Array<{ toolName: string; error: string }> {
  const errors: Array<{ toolName: string; error: string }> = [];

  if (!Array.isArray(steps)) return errors;

  steps.forEach((step: any) => {
    if (!step?.toolResults) return;

    step.toolResults.forEach((result: any) => {
      const hasError =
        result.error ||
        result.isError ||
        (result.result && typeof result.result === "object" && "error" in result.result) ||
        (result.result && typeof result.result === "string" && result.result.toLowerCase().includes("error"));

      if (hasError) {
        const errorMessage =
          result.error?.message ||
          result.error ||
          (result.result?.error) ||
          "Unknown error";

        errors.push({
          toolName: result.toolName || "Unknown",
          error: String(errorMessage).substring(0, 200),
        });
      }
    });
  });

  return errors;
}

/**
 * Verifica se o cliente é novo (não tem histórico de agendamentos)
 */
export async function checkIfNewCustomer(
  salonId: string,
  clientPhone: string
): Promise<boolean> {
  try {
    const profile = await db.query.profiles.findFirst({
      where: eq(profiles.phone, clientPhone),
      columns: { id: true },
    });

    if (!profile) return true;

    const hasAppointment = await db.query.appointments.findFirst({
      where: and(
        eq(appointments.salonId, salonId),
        eq(appointments.clientId, profile.id)
      ),
      columns: { id: true },
    });

    return !hasAppointment;
  } catch {
    return true;
  }
}
