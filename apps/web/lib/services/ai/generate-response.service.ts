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
import {
  AVAILABILITY_TECHNICAL_FALLBACK_MESSAGE,
  enforceAgendaAvailabilityPolicy,
  resolveFriendlyAvailabilityErrorMessage,
} from "./availability-message-policy";
import type { ResponsesRunnerInputMessage, ResponsesRunnerStep } from "./openai-responses-runner.service";
import type { ToolSetDefinition } from "./tools/tool-definition";
import { getChatHistory } from "../chat.service";
import { findRelevantContext, generateQueryEmbedding } from "./rag-context.service";
import { logger, createContextLogger, Logger } from "../../infra/logger";
import { StageTimer } from "../../infra/stage-timer";
import { AIGenerationError, WhatsAppError } from "../../errors";
import { db, customers, profiles, appointments, professionals, eq, and } from "@repo/db";
import { evaluateNoShowRisk } from "@repo/db/src/services/no-show-predictor.service";
import type { ProcessedMedia } from "./media-processor.service";

// Debug verboso controlado por env var (desligado em produção)
const AI_DEBUG = process.env.AI_DEBUG === 'true';
const UUID_PATTERN = "[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";
const UUID_REGEX = new RegExp(`\\b${UUID_PATTERN}\\b`, "gi");
const SENSITIVE_ID_LABEL_PATTERN =
  "(?:ID(?:\\s+do\\s+(?:agendamento|servico|serviço|profissional|cliente))?|customerId|serviceId|professionalId|appointmentId)";
const SENSITIVE_ID_REGEX = new RegExp(
  `\\(?[ \\t]*${SENSITIVE_ID_LABEL_PATTERN}[ \\t]*[:#-][ \\t]*${UUID_PATTERN}[ \\t]*\\)?`,
  "gi"
);

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
  media?: ProcessedMedia;
}

/**
 * Resultado da geração de resposta
 */
export interface GenerateResponseResult {
  text: string;
  toolSummary: string;
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

  // Stage timer para ai-response (cada etapa pesada: contexto paralelo, RAG, prompt, OpenAI, sanitize).
  // Usa startTime compartilhado para que os tempos batam com o total do worker.
  const timer = new StageTimer("ai-response", { chatId, salonId }, startTime);

  try {
    // 1. PARALELO: Buscar dados independentes + iniciar embedding especulativo
    const embeddingPromise = generateQueryEmbedding(userMessage);

    const [agentInfo, preferences, historyMessages, mcpTools, noShowRisk, soloProfessional, speculativeEmbedding] = await Promise.all([
      getActiveAgentInfo(salonId),
      fetchCustomerPreferences(salonId, customerId, contextLogger),
      getChatHistory(chatId, Number(process.env.AI_HISTORY_LIMIT) || 30),
      createMCPTools(salonId, clientPhone),
      customerId ? evaluateNoShowRisk(customerId, salonId) : Promise.resolve(undefined),
      fetchSoloProfessionalInfo(salonId),
      embeddingPromise.catch(() => null),
    ]);
    timer.mark("context_loaded");

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

    // 2. RAG: Usa embedding especulativo (já pronto) se agente tiver knowledge base
    let knowledgeContext: string | undefined;
    if (agentInfo.id && agentInfo.hasKnowledgeBase) {
      if (AI_DEBUG) console.log("\n🔍 RAG: Searching for knowledge context...");
      knowledgeContext = await fetchKnowledgeContext(agentInfo.id, userMessage, contextLogger, speculativeEmbedding);

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
    timer.mark("rag_done");
    // 3. Montar mensagens para Responses API
    const conversationMessages: ResponsesRunnerInputMessage[] = historyMessages.map((msg) => ({
      role: msg.role as "user" | "assistant",
      content: msg.content,
    }));

    // Monta content da mensagem do usuário (multimodal se houver imagem)
    let userContent: unknown;
    if (params.media?.type === "image" && params.media.imageUrl) {
      userContent = [
        { type: "input_text", text: userMessage },
        { type: "input_image", image_url: params.media.imageUrl },
      ];
    } else {
      userContent = userMessage;
    }

    conversationMessages.push({
      role: "user",
      content: userContent,
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
      agentInfo, // Passa agentInfo para evitar query duplicada
      noShowRisk, // Flag de Risco de Falta
      soloProfessional // Profissional único (null se 2+)
    );
    timer.mark("prompt_built");

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
    timer.mark("openai_done");

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
    const rawText = toolErrorMessage || text;
    // Gerar resumo de tool calls para persistir no histórico
    const toolSummary = buildToolSummary(steps);
    // Limpar tool context e dados sensíveis do texto enviado ao WhatsApp
    const finalText = sanitizeAssistantText(stripToolContext(rawText));
    timer.mark("sanitized");

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

    // Breakdown da ai-response: mostra quanto tempo em cada etapa (context_loaded/rag/prompt/openai/sanitize).
    // `openai_done.deltaMs` eh o tempo real da OpenAI incluindo tool rounds - maior suspeito de latencia.
    timer.flush(contextLogger, {
      outcome: "success",
      stepsCount: steps.length,
      totalTokens: usage.totalTokens,
      model: modelName,
      hasKnowledgeBase: agentInfo.hasKnowledgeBase,
      usedRag: !!knowledgeContext,
    });

    return {
      text: finalText,
      toolSummary,
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
    timer.flush(contextLogger, {
      outcome: "error",
      errorMessage: error instanceof Error ? error.message : String(error),
    });
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
  contextLogger: Logger,
  precomputedEmbedding?: number[] | null
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
      similarityThreshold,
      precomputedEmbedding
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
 * Busca info do profissional único quando o salão tem apenas 1 profissional ativo.
 * Retorna null se o salão tem 0 ou 2+ profissionais (comportamento multi-profissional).
 */
async function fetchSoloProfessionalInfo(
  salonId: string
): Promise<{ id: string; name: string } | null> {
  const activeProfessionals = await db.query.professionals.findMany({
    where: and(
      eq(professionals.salonId, salonId),
      eq(professionals.isActive, true)
    ),
    columns: { id: true, name: true },
    limit: 2,
  });

  if (activeProfessionals.length === 1) {
    return activeProfessionals[0];
  }
  return null;
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
    const availabilityMessage = resolveFriendlyAvailabilityErrorMessage(errors);
    if (availabilityMessage) {
      return availabilityMessage;
    }

    return AVAILABILITY_TECHNICAL_FALLBACK_MESSAGE;
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

// Delimitadores de tool context embutido no histórico
const TOOL_CONTEXT_START = "---TOOL_CONTEXT---";
const TOOL_CONTEXT_END = "---END_TOOL_CONTEXT---";
const TOOL_CONTEXT_REGEX = new RegExp(
  `\\n*${TOOL_CONTEXT_START}[\\s\\S]*?${TOOL_CONTEXT_END}\\n*`,
  "g"
);

/**
 * Constrói resumo compacto das tool calls executadas nesta rodada.
 * Esse resumo é persistido junto à mensagem assistant no DB para que
 * nas próximas mensagens o AI tenha contexto do que já buscou/fez.
 */
function buildToolSummary(steps: ResponsesRunnerStep[]): string {
  const summaryLines: string[] = [];

  for (const step of steps) {
    if (!step.toolCalls || step.toolCalls.length === 0) continue;

    for (let i = 0; i < step.toolCalls.length; i++) {
      const call = step.toolCalls[i];
      const result = step.toolResults[i];
      if (!call || call.invalid) continue;

      const toolName = call.toolName;
      const args = call.input ? JSON.stringify(call.input) : "{}";

      let resultSummary: string;
      if (result?.isError || result?.error) {
        resultSummary = "ERRO: " + (typeof result.error === "string" ? result.error : (result.error as any)?.message || "erro desconhecido");
      } else {
        resultSummary = summarizeToolResult(toolName, result?.result);
      }

      summaryLines.push(`[${toolName}](${args}) -> ${resultSummary}`);
    }
  }

  return summaryLines.length > 0
    ? `\n\n${TOOL_CONTEXT_START}\n${summaryLines.join("\n")}\n${TOOL_CONTEXT_END}`
    : "";
}

/**
 * Cria resumo compacto do resultado de uma tool (max ~300 chars por tool).
 */
function summarizeToolResult(toolName: string, result: unknown): string {
  if (result == null) return "(vazio)";

  try {
    const data = typeof result === "string" ? JSON.parse(result) : result;

    if (data.error === true) {
      return `ERRO: ${data.message || data.details || "erro"}`;
    }

    // Serviços: lista compacta
    if (toolName === "getServices" && Array.isArray(data.services)) {
      return data.services
        .slice(0, 10)
        .map((s: any) => `${s.name}(id:${s.serviceId},R$${s.price},${s.duration}min)`)
        .join(", ");
    }

    // Profissionais: lista compacta
    if (toolName === "getProfessionals" && Array.isArray(data.professionals)) {
      return data.professionals
        .slice(0, 10)
        .map((p: any) => `${p.name}(id:${p.professionalId})`)
        .join(", ");
    }

    // Disponibilidade: horários
    if ((toolName === "checkAvailability" || toolName === "getAvailableSlots") && data.slots) {
      const available = Array.isArray(data.slots)
        ? data.slots.filter((s: any) => s.available !== false).map((s: any) => s.time || s).join(",")
        : JSON.stringify(data.slots).substring(0, 200);
      return `horarios: ${available}`;
    }

    // Agendamentos futuros
    if (toolName === "getMyFutureAppointments" && Array.isArray(data.appointments)) {
      return data.appointments
        .slice(0, 5)
        .map((a: any) => `${a.service}(id:${a.appointmentId},${a.date},${a.professional})`)
        .join(", ");
    }

    // Appointment criado/atualizado
    if (toolName === "addAppointment" || toolName === "updateAppointment") {
      return `OK: ${data.message || JSON.stringify(data).substring(0, 150)}`;
    }

    // Cancelamento
    if (toolName === "removeAppointment") {
      return `cancelado: ${data.message || "OK"}`;
    }

    // Salon info
    if (toolName === "getSalonInfo") {
      return `${data.name || ""}, ${data.address || ""}`.substring(0, 150);
    }

    // Customer name update
    if (toolName === "updateCustomerName") {
      return `nome atualizado: ${data.name || ""}`;
    }

    // Fallback genérico
    const json = JSON.stringify(data);
    return json.length > 250 ? json.substring(0, 250) + "..." : json;
  } catch {
    const str = String(result);
    return str.length > 250 ? str.substring(0, 250) + "..." : str;
  }
}

/**
 * Remove tool context markers do texto enviado ao cliente via WhatsApp.
 * O tool context fica no DB para historico, mas nao vai para o cliente.
 */
function stripToolContext(text: string): string {
  return text.replace(TOOL_CONTEXT_REGEX, "").trim();
}

/**
 * Remove dados internos/sensíveis da resposta final ao cliente
 */
function sanitizeAssistantText(text: string): string {
  if (!text || !text.trim()) return "";

  const sanitized = text
    .replace(SENSITIVE_ID_REGEX, "")
    .replace(UUID_REGEX, "")
    .replace(/\(\s*\)/g, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/\s+([,.;:!?])/g, "$1")
    .trim();

  return enforceAgendaAvailabilityPolicy(sanitized);
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

