/**
 * Serviço para geração de respostas da IA
 *
 * Centraliza a lógica de:
 * - Busca de contexto RAG
 * - Construção do system prompt
 * - Chamada ao modelo de AI
 * - Tratamento de erros de tools
 */

import { createMCPTools } from "@repo/mcp-server/tools/vercel-ai";
import { createSalonAssistantPrompt } from "./system-prompt-builder.service";
import { getActiveAgentInfo } from "./agent-info.service";
import { mapModelToOpenAI } from "./model-mapper.service";
import { runOpenAIResponses } from "./openai-responses-runner.service";
import type { ResponsesRunnerInputMessage } from "./openai-responses-runner.service";
import type { ToolSetDefinition } from "./tools/tool-definition";
import { getChatHistory } from "../chat.service";
import { findRelevantContext } from "./rag-context.service";
import { logger, createContextLogger, Logger } from "../../logger";
import { AIGenerationError, WhatsAppError } from "../../errors";
import { db, customers, profiles, appointments, eq, and } from "@repo/db";

// Debug verboso controlado por env var (desligado em produção)
const AI_DEBUG = process.env.AI_DEBUG === 'true';

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

    const agentModel = agentInfo.model || "gpt-5-mini";
    const modelName = mapModelToOpenAI(agentModel);

    if (AI_DEBUG) {
      console.log("\n🤖 ========== AI GENERATION START ==========");
      console.log("📋 Agent Info:", {
        name: agentInfo.name,
        model: modelName,
        hasKnowledgeBase: agentInfo.hasKnowledgeBase,
      });
      console.log("🛠️  MCP Tools Available:", Object.keys(mcpTools));
    }

    contextLogger.debug({ model: modelName, agentName: agentInfo.name, toolsCount: Object.keys(mcpTools).length }, "Context loaded in parallel");

    // 2. RAG: Só busca se agente tiver knowledge base configurada
    let knowledgeContext: string | undefined;
    if (agentInfo.id && agentInfo.hasKnowledgeBase) {
      if (AI_DEBUG) console.log("\n🔍 RAG: Searching for knowledge context...");
      knowledgeContext = await fetchKnowledgeContext(agentInfo.id, userMessage, contextLogger);

      if (AI_DEBUG) {
        if (knowledgeContext) {
          console.log("✅ RAG: Context found!");
          console.log("\n📚 ========== RAG FULL CONTENT ==========");
          console.log(knowledgeContext);
          console.log("=========================================\n");
        } else {
          console.log("❌ RAG: No relevant context found (similarity < threshold or empty)");
        }
      }
    } else {
      if (AI_DEBUG) console.log("⏭️  RAG: Skipped (hasKnowledgeBase=false)");
    }
    // 3. Montar mensagens para Responses API
    const conversationMessages: ResponsesRunnerInputMessage[] = historyMessages.map((msg) => ({
      role: msg.role as "user" | "assistant",
      content: msg.content,
    }));

    conversationMessages.push({
      role: "user",
      content: userMessage,
    });

    if (AI_DEBUG) {
      console.log("\n💬 ========== CONVERSATION HISTORY ==========");
      console.log("Total messages:", conversationMessages.length);
      conversationMessages.forEach((msg, idx) => {
        const text = typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content);
        const preview = text.substring(0, 80);
        console.log(`  [${idx + 1}] ${msg.role}: ${preview}${text.length >= 80 ? "..." : ""}`);
      });
      console.log("===========================================\n");
    }

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

    if (AI_DEBUG) {
      console.log("\n📝 ========== SYSTEM PROMPT ==========");
      console.log(systemPrompt);
      console.log("=====================================\n");
    }

    // 5. Gerar resposta
    contextLogger.info({ model: modelName }, "Generating AI response");

    if (AI_DEBUG) console.log("⚙️  Calling OpenAI with", Object.keys(mcpTools).length, "tools...\n");
    const { text, usage, steps } = await runOpenAIResponses({
      model: modelName,
      instructions: systemPrompt,
      input: conversationMessages,
      tools: mcpTools as unknown as ToolSetDefinition,
      maxToolRounds: 5,
    });

    // Log das tool calls e resultados
    if (AI_DEBUG) {
      console.log("\n🔧 ========== TOOL EXECUTION ==========");
      console.log("Total steps:", steps.length);

      steps.forEach((step: any, stepIndex: number) => {
        console.log(`\n--- Step ${stepIndex + 1} ---`);

        if (step.toolCalls && step.toolCalls.length > 0) {
          console.log("🛠️  Tool Calls:");
          step.toolCalls.forEach((call: any, callIndex: number) => {
            console.log(`  [${callIndex + 1}] ${call.toolName}`);
            console.log("  📥 Arguments:", JSON.stringify(call.input, null, 2));
          });
        }

        if (step.toolResults && step.toolResults.length > 0) {
          console.log("📤 Tool Results:");
          step.toolResults.forEach((result: any, resultIndex: number) => {
            console.log(`  [${resultIndex + 1}] ${result.toolName}`);
            console.log("  📋 Full result object:", JSON.stringify(result, null, 2).substring(0, 500));

            // Vercel AI SDK pode usar 'result' ou 'output' dependendo da versão
            const toolOutput = result.result ?? result.output ?? result;

            if (result.error || result.isError) {
              console.log("  ❌ ERROR:", result.error || result.result);
            } else if (toolOutput && typeof toolOutput === "object" && "error" in toolOutput && toolOutput.error === true) {
              // Nosso ErrorPresenter retorna { error: true, code, message, details }
              console.log("  ❌ TOOL ERROR:", toolOutput.message || toolOutput.details);
            } else {
              const resultStr = JSON.stringify(toolOutput, null, 2);
              const preview = resultStr ? resultStr.substring(0, 300) : "(empty result)";
              console.log("  ✅ Result:", preview);
            }
          });
        }

        if (step.text) {
          const textPreview = step.text ? step.text.substring(0, 200) : "(empty text)";
          console.log("💬 AI Response:", textPreview);
        }
      });
      console.log("======================================\n");
    }

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

    if (AI_DEBUG) {
      console.log("\n✅ ========== GENERATION COMPLETE ==========");
      console.log("📊 Usage:", {
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        totalTokens: usage.totalTokens,
      });
      console.log("⏱️  Duration:", duration, "ms");
      const responsePreview = finalText ? finalText.substring(0, 300) : "(empty response)";
      console.log("💬 Final Response:", responsePreview);
      console.log("===========================================\n");
    }

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
    // Configurações via env
    const similarityThreshold = parseFloat(process.env.RAG_SIMILARITY_THRESHOLD || '0.65');
    const maxResults = parseInt(process.env.RAG_MAX_RESULTS || '5'); // Padrão: 5 itens

    if (AI_DEBUG) {
      console.log("🔍 RAG Query:", {
        agentId: agentId ? agentId.substring(0, 8) + "..." : "(no agentId)",
        userMessage: userMessage ? userMessage.substring(0, 100) : "(no message)",
        threshold: similarityThreshold,
        limit: maxResults,
      });
    }

    const contextResult = await findRelevantContext(
      agentId,
      userMessage,
      maxResults,
      similarityThreshold
    );

    if ("error" in contextResult) {
      if (AI_DEBUG) console.log("❌ RAG Error:", contextResult.error);
      return undefined;
    }

    if (!contextResult.data || contextResult.data.length === 0) {
      if (AI_DEBUG) console.log("📭 RAG: No results (similarity < 0.7 or empty database)");
      contextLogger.debug("No relevant RAG context found");
      return undefined;
    }

    // Log detalhado dos resultados
    if (AI_DEBUG) {
      console.log(`\n✅ RAG: Found ${contextResult.data.length} relevant item(s):\n`);
      contextResult.data.forEach((item, idx) => {
        console.log(`╔═══ [${idx + 1}] Similarity: ${(item.similarity * 100).toFixed(1)}% ═══`);
        console.log(`║ Length: ${item.content.length} chars`);
        if (item.metadata) {
          console.log(`║ Metadata:`, item.metadata);
        }
        console.log(`║ Full Content:`);
        console.log(`╠${"═".repeat(60)}`);
        console.log(item.content.split('\n').map(line => `║ ${line}`).join('\n'));
        console.log(`╚${"═".repeat(60)}\n`);
      });
    }

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
  } catch (error) {
    if (AI_DEBUG) console.log("❌ RAG Exception:", error);
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

  if (errorTypes.includes("update_appointment") || errorTypes.includes("updateAppointment")) {
    return "Desculpe, não consegui alterar o agendamento. Pode verificar se o horário está disponível e tentar novamente?";
  }

  if (errorTypes.includes("remove_appointment") || errorTypes.includes("removeAppointment")) {
    return "Desculpe, não consegui cancelar o agendamento. Pode tentar novamente?";
  }

  if (errorTypes.includes("list_services") || errorTypes.includes("getServices")) {
    return "Desculpe, não consegui carregar nossos serviços no momento. Por favor, tente novamente em instantes.";
  }

  if (errorTypes.includes("check_availability") || errorTypes.includes("checkAvailability")) {
    return "Poxa, não consegui acessar a agenda agora, mas me diz o horário que você queria que eu tento confirmar";
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
      // Vercel AI SDK pode usar 'result' ou 'output' dependendo da versão
      const toolOutput = result.result ?? result.output ?? result;

      // Verifica diferentes formatos de erro:
      // 1. result.error - erro direto do SDK
      // 2. result.isError - flag de erro do SDK
      // 3. toolOutput.error === true - nosso ErrorPresenter retorna { error: true, code, message, details }
      // 4. string contendo "error"
      const hasError =
        result.error ||
        result.isError ||
        (toolOutput && typeof toolOutput === "object" && toolOutput.error === true) ||
        (typeof toolOutput === "string" && toolOutput.toLowerCase().includes("error"));

      if (hasError) {
        // Extrai mensagem de erro de diferentes fontes
        let errorMessage: string;

        if (result.error?.message) {
          errorMessage = result.error.message;
        } else if (typeof result.error === "string") {
          errorMessage = result.error;
        } else if (toolOutput && typeof toolOutput === "object" && toolOutput.error === true) {
          // Formato do ErrorPresenter: { error: true, code, message, details }
          errorMessage = toolOutput.message || toolOutput.details || "Tool error";
        } else if (typeof toolOutput === "string") {
          errorMessage = toolOutput;
        } else {
          errorMessage = "Unknown error";
        }

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

