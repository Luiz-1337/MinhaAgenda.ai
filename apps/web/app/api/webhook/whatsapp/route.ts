import { convertToModelMessages, generateText, UIMessage, stepCountIs } from 'ai';
import { openai } from "@ai-sdk/openai";
import { getSalonIdByWhatsapp } from '@/lib/services/salon.service';
import { createSalonAssistantPrompt, getActiveAgentInfo, mapModelToOpenAI } from '@/lib/services/ai.service';
import { createMCPTools } from '@repo/mcp-server/tools/vercel-ai';
import { db, salons, customers, chats, agents, appointments, profiles } from "@repo/db";
import { eq, and } from "drizzle-orm";
import { sendWhatsAppMessage, normalizePhoneNumber } from '@/lib/services/whatsapp.service';
import { findOrCreateChat, getChatHistory, saveMessage, saveChatMessage, findOrCreateCustomer } from '@/lib/services/chat.service';
import { validateRequest } from "twilio";
import { findRelevantContext } from "@/app/actions/knowledge";

export const maxDuration = 120;

/**
 * Processa webhook do WhatsApp via Twilio usando o mesmo padrão de chat com tools
 */

export async function POST(req: Request) {
  console.log("🔔 Webhook Twilio chamado - início do processamento");

  try {
    // Verifica Content-Type
    const contentType = req.headers.get("content-type") || "";
    const isFormData = contentType.includes("multipart/form-data") || contentType.includes("application/x-www-form-urlencoded");
    
    if (!isFormData) {
      console.error(`❌ Content-Type inválido: ${contentType}. Esperado: multipart/form-data ou application/x-www-form-urlencoded`);
      return new Response("Content-Type must be multipart/form-data or application/x-www-form-urlencoded", { status: 400 });
    }

    // Processa formData do Twilio (precisa ser feito antes da validação)
    const formData = await req.formData();
    
    // Validação de assinatura do Twilio (em produção)
    const shouldValidateSignature =
      process.env.NODE_ENV !== "development" && process.env.TWILIO_SIGNATURE_BYPASS !== "1";

    if (shouldValidateSignature) {
      const authToken = process.env.TWILIO_AUTH_TOKEN;
      const twilioSignature = req.headers.get("x-twilio-signature");
      
      if (!authToken || !twilioSignature) {
        console.error("❌ Missing TWILIO_AUTH_TOKEN or X-Twilio-Signature");
        return new Response("Unauthorized", { status: 401 });
      }

      const formDataEntries: Record<string, string> = {};
      formData.forEach((value, key) => {
        formDataEntries[key] = value.toString();
      });

      const url = new URL(req.url);
      const forwardedProto = req.headers.get("x-forwarded-proto");
      const forwardedHost = req.headers.get("x-forwarded-host");
      const host = forwardedHost ?? req.headers.get("host") ?? url.host;
      const proto = forwardedProto ?? url.protocol.replace(":", "");
      const publicUrl = `${proto}://${host}${url.pathname}${url.search}`;

      const isValid = validateRequest(authToken, twilioSignature, publicUrl, formDataEntries);
      if (!isValid) {
        console.error("❌ Twilio signature inválida");
        return new Response("Unauthorized", { status: 401 });
      }

      console.log("🔐 Twilio signature válida");
    } else {
      console.log("🔓 Twilio signature validation bypassed (development)");
    }

    const fromValue = formData.get("From");
    const bodyValue = formData.get("Body");
    const toValue = formData.get("To");
    const messageSidValue = formData.get("MessageSid") || formData.get("SmsMessageSid");

    const from = typeof fromValue === "string" ? fromValue : "";
    const body = typeof bodyValue === "string" ? bodyValue : "";
    const to = typeof toValue === "string" ? toValue : "";

    console.log(`📥 Webhook WhatsApp recebido: From=${from}, To=${to}, Body=${body?.substring(0, 100)}...`);

    if (!from || !to) {
      console.error("Missing required fields: From or To");
      return new Response("Missing required fields", { status: 400 });
    }

    // Função helper para detectar tipo de mídia
    function detectMediaType(formData: FormData): 'image' | 'audio' | 'video' | null {
      const numMedia = parseInt(formData.get('NumMedia')?.toString() || '0', 10);
      if (numMedia === 0) return null;
      
      // Verifica o primeiro tipo de mídia (MediaContentType0)
      const contentType = formData.get('MediaContentType0')?.toString().toLowerCase() || '';
      
      if (contentType.startsWith('image/')) return 'image';
      if (contentType.startsWith('audio/')) return 'audio';
      if (contentType.startsWith('video/')) return 'video';
      
      return null; // Tipo desconhecido, mas ainda é mídia
    }

    // Verifica se a mensagem contém mídia
    const numMedia = parseInt(formData.get('NumMedia')?.toString() || '0', 10);
    const mediaType = detectMediaType(formData);

    if (numMedia > 0) {
      console.log(`📷 Mídia detectada: tipo=${mediaType || 'desconhecido'}, NumMedia=${numMedia}`);
      
      // Busca salão para enviar resposta
      const salonId = await getSalonIdByWhatsapp(to);
      
      if (!salonId) {
        console.error(`❌ Salão não encontrado para o número de WhatsApp: ${to}`);
        return new Response(
          `Salão não encontrado para o número de WhatsApp: ${to}`,
          { status: 404 }
        );
      }

      // Normaliza número do cliente
      const clientPhone = normalizePhoneNumber(from);
      
      // Encontra ou cria o customer
      const customer = await findOrCreateCustomer(clientPhone, salonId);
      
      // Encontra ou cria chat
      const chat = await findOrCreateChat(clientPhone, salonId);
      
      // Salva mensagem do usuário indicando que foi mídia
      const mediaTypeLabel = mediaType === 'image' ? 'imagem' : 
                            mediaType === 'audio' ? 'áudio' : 
                            mediaType === 'video' ? 'vídeo' : 'mídia';
      await saveMessage(chat.id, "user", `[${mediaTypeLabel.toUpperCase()}] Mensagem de mídia não suportada`);
      
      // Envia resposta automática informando que apenas texto é aceito
      const autoResponse = "Olá! No momento, aceitamos apenas mensagens de texto. Por favor, envie sua mensagem digitada. Obrigado!";
      
      await sendWhatsAppMessage(from, autoResponse, salonId);
      await saveMessage(chat.id, "assistant", autoResponse);
      
      console.log(`✅ Resposta automática enviada para mídia não suportada`);
      
      return new Response("", { status: 200 });
    }

    // Valida Body apenas se não houver mídia (mensagens de texto)
    if (!body) {
      console.error("Missing required field: Body");
      return new Response("Missing required fields", { status: 400 });
    }

    // Normaliza número do cliente
    const clientPhone = normalizePhoneNumber(from);
    console.log(`📞 Número normalizado do cliente: ${clientPhone}`);

    // Busca salão pelo número de WhatsApp que recebeu a mensagem
    const salonId = await getSalonIdByWhatsapp(to);
    
    if (!salonId) {
      console.error(`❌ Salão não encontrado para o número de WhatsApp: ${to}`);
      return new Response(
        `Salão não encontrado para o número de WhatsApp: ${to}`,
        { status: 404 }
      );
    }
    
    console.log(`✅ Salon ID encontrado: ${salonId}`);

    // Busca nome do salão
    const salon = await db.query.salons.findFirst({
      where: eq(salons.id, salonId),
      columns: { name: true }
    });
    const salonName = salon?.name;

    if (!salonName) {
      console.error("❌ Nome do salão não encontrado");
      return new Response("Salão não encontrado", { status: 404 });
    }

    // Encontra ou cria o customer (garante que existe na tabela customers)
    console.log("👤 Encontrando ou criando customer...");
    const customer = await findOrCreateCustomer(clientPhone, salonId);
    console.log(`✅ Customer ID: ${customer.id}, Nome: ${customer.name}`);

    // Verifica se cliente é novo ou recorrente (tem histórico de agendamentos)
    // Busca profileId pelo telefone para verificar histórico em appointments
    const profile = await db.query.profiles.findFirst({
      where: eq(profiles.phone, clientPhone),
      columns: { id: true }
    });
    
    let isNewCustomer = true;
    if (profile) {
      const hasAppointmentHistory = await db.query.appointments.findFirst({
        where: and(
          eq(appointments.salonId, salonId),
          eq(appointments.clientId, profile.id)
        ),
        columns: { id: true }
      });
      isNewCustomer = !hasAppointmentHistory;
    }
    console.log(`📋 Cliente ${isNewCustomer ? 'NOVO' : 'RECORRENTE'} (tem histórico: ${!isNewCustomer})`);

    // Busca preferências do cliente (após garantir que o customer existe)
    let preferences: Record<string, unknown> | undefined = undefined;
    const customerRecord = await db.query.customers.findFirst({
      where: and(
        eq(customers.salonId, salonId),
        eq(customers.id, customer.id)
      ),
      columns: { aiPreferences: true }
    });

    if (customerRecord?.aiPreferences) {
      try {
        preferences = JSON.parse(customerRecord.aiPreferences);
      } catch (e) {
        console.error("Erro ao fazer parse das preferências do cliente:", e);
      }
    }

    // Busca agente ativo do salão para recuperar contexto de conhecimento
    let knowledgeContext: string | undefined = undefined;
    const activeAgent = await db.query.agents.findFirst({
      where: and(eq(agents.salonId, salonId), eq(agents.isActive, true)),
      columns: { id: true },
    });

    // Se houver agente ativo e mensagem do usuário, busca contexto relevante
    if (activeAgent && body) {
      try {
        const similarityThreshold = 0.7; // Threshold de 70% de similaridade
        const contextResult = await findRelevantContext(
          activeAgent.id,
          body,
          3,
          similarityThreshold
        );
        
        if (!("error" in contextResult) && contextResult.data && contextResult.data.length > 0) {
          // Os resultados já foram filtrados pelo threshold na query SQL
          // Formata o contexto recuperado
          const contextTexts = contextResult.data.map((item) => item.content).join("\n\n");
          knowledgeContext = contextTexts;
          console.log(`📚 Contexto RAG relevante encontrado (${contextResult.data.length} itens acima do threshold de ${(similarityThreshold * 100).toFixed(0)}%):`);
          contextResult.data.forEach((item, index) => {
            console.log(`  [${index + 1}] (similaridade: ${(item.similarity * 100).toFixed(1)}%) ${item.content.substring(0, 100)}${item.content.length > 100 ? '...' : ''}`);
          });
          console.log(`\n📝 Contexto completo que será injetado no prompt:\n${contextTexts}\n`);
        } else {
          console.log(`⚠️ Nenhum contexto RAG relevante encontrado (todos abaixo do threshold de ${(similarityThreshold * 100).toFixed(0)}% ou erro na busca):`, contextResult);
        }
      } catch (error) {
        console.error("❌ Erro ao buscar contexto RAG:", error);
        // Continua sem contexto se houver erro
      }
    } else {
      console.log("⚠️ Nenhum agente ativo encontrado para buscar contexto RAG");
    }

    const systemPrompt = await createSalonAssistantPrompt(salonId, preferences, knowledgeContext, customer.name, customer.id, isNewCustomer);

    console.log(`📝 System Prompt: ${systemPrompt}`);
    // Encontra ou cria chat
    console.log("💬 Encontrando ou criando chat...");
    const chat = await findOrCreateChat(clientPhone, salonId);
    console.log(`✅ Chat ID: ${chat.id}`);

    // Verifica se o chat está em modo manual
    const chatRecord = await db.query.chats.findFirst({
      where: eq(chats.id, chat.id),
      columns: { isManual: true },
    });

    // Salva mensagem do usuário
    console.log("💾 Salvando mensagem do usuário...");
    await saveMessage(chat.id, "user", body);
    console.log("✅ Mensagem salva");

    // Se estiver em modo manual, apenas salva a mensagem e retorna sem processar pela IA
    if (chatRecord?.isManual) {
      console.log("👤 Chat em modo manual - mensagem salva, sem resposta automática da IA");
      return new Response("", { status: 200 });
    }

    // Idempotência: verifica se a mensagem já foi processada
    // (verificação removida - não salvamos markers no banco para evitar poluição)
    // Se necessário, pode ser implementada com cache/Redis ou tabela separada

    // Busca histórico de mensagens do chat (últimas 20 mensagens)
    console.log("📜 Buscando histórico de mensagens...");
    const historyMessages = await getChatHistory(chat.id, 10);
    console.log(`✅ Histórico carregado: ${historyMessages.length} mensagens`);

    // Filtra mensagens de sistema (markers de idempotência)
    const filteredHistory = historyMessages.filter(
      (msg) => !msg.content.startsWith("__twilio_message_sid:")
    );

    // Converte histórico para UIMessage[]
    const uiMessages: UIMessage[] = filteredHistory.map((msg, idx) => ({
      id: `hist-${idx}`,
      role: msg.role as 'user' | 'assistant',
      parts: [{ type: 'text' as const, text: msg.content }],
    }));

    // Adiciona a mensagem atual do usuário
    uiMessages.push({
      id: `temp-${Date.now()}`,
      role: 'user',
      parts: [{ type: 'text' as const, text: body }],
    });

    // Cria tools usando o novo sistema modularizado
    console.log("🛠️ Criando tools do MCP...");
    const mcpTools = await createMCPTools(salonId, clientPhone);
    console.log(`✅ ${Object.keys(mcpTools).length} tools criadas`);

    // Busca informações do agente ativo para obter o modelo configurado
    const agentInfo = await getActiveAgentInfo(salonId);
    const agentModel = agentInfo?.model || "gpt-5-mini";
    const modelName = mapModelToOpenAI(agentModel);
    console.log(`🤖 Modelo do agente ativo: ${agentModel} → ${modelName} (OpenAI)`);

    // Funções helper para detectar e extrair erros de tools
    function hasToolErrors(steps: any[]): boolean {
      return steps.some(step => 
        step.toolResults?.some((result: any) => 
          result.error || 
          result.isError || 
          (result.result && typeof result.result === 'object' && 'error' in result.result) ||
          (result.result && typeof result.result === 'string' && result.result.toLowerCase().includes('error'))
        )
      )
    }

    function extractToolErrors(steps: any[]): Array<{toolName: string, error: string}> {
      const errors: Array<{toolName: string, error: string}> = []
      steps.forEach(step => {
        step.toolResults?.forEach((result: any) => {
          if (result.error || result.isError) {
            const errorMessage = result.error?.message || result.error || 'Erro desconhecido'
            errors.push({
              toolName: result.toolName || 'Unknown',
              error: errorMessage
            })
          } else if (result.result && typeof result.result === 'object' && 'error' in result.result) {
            errors.push({
              toolName: result.toolName || 'Unknown',
              error: result.result.error || 'Erro desconhecido'
            })
          } else if (result.result && typeof result.result === 'string' && result.result.toLowerCase().includes('error')) {
            errors.push({
              toolName: result.toolName || 'Unknown',
              error: result.result
            })
          }
        })
      })
      return errors
    }

    // Gera resposta usando generateText (mais adequado para WhatsApp, não precisa de streaming)
    let finalText = '';
    let usageData: { inputTokens?: number; outputTokens?: number; totalTokens?: number } | null = null;

    try {
      const { text, usage, steps } = await generateText({
        model: openai(modelName),
        system: systemPrompt,
        messages: convertToModelMessages(uiMessages),
        tools: mcpTools,
        stopWhen: stepCountIs(10),
      });

      // Aqui o 'text' já é a resposta final completa
      finalText = text;

      // Verifica se há erros de tools nos steps
      if (hasToolErrors(steps)) {
        console.warn("⚠️ Erros detectados em tools durante a execução");
        const toolErrors = extractToolErrors(steps);
        
        console.error(`📊 Resumo de erros: ${toolErrors.length} tool(s) falharam`);
        toolErrors.forEach(({ toolName, error }, index) => {
          console.error(`  [${index + 1}] Tool: ${toolName}`);
          console.error(`      Erro: ${error}`);
        });

        // Sanitiza mensagens de erro para não expor detalhes técnicos sensíveis
        const sanitizedErrors = toolErrors.map(({ toolName, error }) => {
          // Remove informações sensíveis como UUIDs, paths, etc.
          let sanitizedError = error
            .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '[ID]')
            .replace(/\/[^\s]+/g, '[path]')
            .substring(0, 200); // Limita tamanho
          
          return { toolName, error: sanitizedError };
        });

        // Constrói mensagem de sistema explicando o erro
        const errorContext = sanitizedErrors.map(({ toolName, error }) => 
          `- Tool "${toolName}": ${error}`
        ).join('\n');

        const errorSystemMessage = `[ERRO DE TOOL DETECTADO]

As seguintes ferramentas encontraram dificuldades durante a execução:
${errorContext}

Por favor, responda ao cliente de forma educada e profissional. Explique que houve uma dificuldade técnica momentânea e ofereça alternativas quando possível. Seja empático e mantenha o tom amigável. Não mencione detalhes técnicos específicos.`;

        console.log("🔄 Fazendo nova chamada ao generateText com contexto de erro...");
        console.log(`📝 Contexto de erro que será enviado à IA (${errorSystemMessage.length} caracteres)`);
        
        try {
          // Cria mensagens atualizadas com contexto de erro
          const errorMessages = [
            ...convertToModelMessages(uiMessages),
            {
              role: 'system' as const,
              content: errorSystemMessage
            }
          ];

          // Nova chamada ao generateText com contexto de erro (limitado a 1 step para evitar loops)
          const { text: errorResponseText, usage: errorUsage } = await generateText({
            model: openai(modelName),
            system: systemPrompt,
            messages: errorMessages,
            tools: mcpTools,
            stopWhen: stepCountIs(1), // Limita a 1 step para evitar loops
          });

          if (errorResponseText && errorResponseText.trim()) {
            finalText = errorResponseText;
            console.log("✅ IA gerou resposta educada sobre o erro");
            console.log(`📝 Resposta gerada (${errorResponseText.length} caracteres): ${errorResponseText.substring(0, 100)}...`);
            
            // Atualiza usage data se disponível
            if (errorUsage) {
              const previousUsage: { inputTokens: number; outputTokens: number; totalTokens: number } = usageData || { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
              usageData = {
                inputTokens: (previousUsage.inputTokens || 0) + (errorUsage.inputTokens ?? 0),
                outputTokens: (previousUsage.outputTokens || 0) + (errorUsage.outputTokens ?? 0),
                totalTokens: (previousUsage.totalTokens || 0) + (errorUsage.totalTokens ?? 0),
              };
              console.log(`📊 Tokens atualizados após tratamento de erro: input=${usageData.inputTokens}, output=${usageData.outputTokens}, total=${usageData.totalTokens}`);
            }
          } else {
            console.warn("⚠️ IA não gerou resposta mesmo com contexto de erro");
            console.warn("⚠️ Usando texto original ou fallback");
          }
        } catch (errorRetryError) {
          console.error("❌ Erro ao tentar gerar resposta com contexto de erro:", errorRetryError);
          if (errorRetryError instanceof Error) {
            console.error("   Mensagem:", errorRetryError.message);
            console.error("   Stack:", errorRetryError.stack?.substring(0, 300));
          }
          console.warn("⚠️ Continuando com texto original ou fallback");
          // Continua com o texto original ou usa fallback
        }
      }

      // O 'usage' já vem preenchido, sem precisar de malabarismos
      if (usage) {
        usageData = {
          inputTokens: usage.inputTokens ?? undefined,
          outputTokens: usage.outputTokens ?? undefined,
          totalTokens: usage.totalTokens ?? undefined,
        };
        console.log(`📊 Tokens: input=${usageData.inputTokens}, output=${usageData.outputTokens}, total=${usageData.totalTokens}`);
        console.log(`\n🔄 Total de steps executados: ${steps.length}\n`);
        
        // Log detalhado de cada step
        steps.forEach((step, index) => {
          console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
          console.log(`📝 Step ${index + 1}/${steps.length}:`);
          
          // Verifica se há tool calls neste step
          if (step.toolCalls && step.toolCalls.length > 0) {
            step.toolCalls.forEach((toolCall: any) => {
              console.log(`  🔧 Tool chamada: ${toolCall.toolName || 'N/A'}`);
              if (toolCall.args !== undefined && toolCall.args !== null) {
                try {
                  console.log(`  📥 Parâmetros passados:`, JSON.stringify(toolCall.args, null, 2));
                } catch (err) {
                  console.log(`  📥 Parâmetros passados:`, toolCall.args);
                }
              } else {
                console.log(`  📥 Parâmetros passados: (nenhum parâmetro)`);
              }
            });
          }
          
          // Verifica se há tool results (resultado da execução)
          if (step.toolResults && step.toolResults.length > 0) {
            step.toolResults.forEach((toolResult: any, toolIndex: number) => {
              const hasError = toolResult.error || toolResult.isError || 
                (toolResult.result && typeof toolResult.result === 'object' && 'error' in toolResult.result) ||
                (toolResult.result && typeof toolResult.result === 'string' && toolResult.result.toLowerCase().includes('error'));
              
              const logPrefix = hasError ? '  ❌ Tool result (ERRO)' : '  ✅ Tool result';
              console.log(`${logPrefix} ${toolIndex + 1}:`);
              console.log(`     Tool: ${toolResult.toolName || 'N/A'}`);
              
              if (toolResult.error || toolResult.isError) {
                const errorMsg = toolResult.error?.message || toolResult.error || 'Erro desconhecido';
                console.error(`     ⚠️ ERRO DETECTADO: ${errorMsg}`);
                if (toolResult.error?.stack) {
                  console.error(`     Stack trace: ${toolResult.error.stack.substring(0, 300)}...`);
                }
              }
              
              if (toolResult.result !== undefined && toolResult.result !== null) {
                try {
                  const resultStr = JSON.stringify(toolResult.result, null, 2);
                  const preview = resultStr.length > 500 ? resultStr.substring(0, 500) + '...' : resultStr;
                  console.log(`     Resultado:`, preview);
                } catch (err) {
                  console.log(`     Resultado:`, toolResult.result);
                }
              } else {
                console.log(`     Resultado: (sem resultado)`);
              }
            });
          }
          
          // Mostra conteúdo de texto se houver (pode ser string ou array)
          const content: any = step.content;
          if (content !== null && content !== undefined) {
            if (typeof content === 'string') {
              const trimmedContent = content.trim();
              if (trimmedContent) {
                const preview = trimmedContent.length > 200 ? trimmedContent.substring(0, 200) + '...' : trimmedContent;
                console.log(`  💬 Conteúdo de texto: ${preview}`);
              }
            } else if (Array.isArray(content)) {
              const textParts = content.filter((part: any) => part.type === 'text').map((part: any) => part.text).join(' ');
              if (textParts) {
                const preview = textParts.length > 200 ? textParts.substring(0, 200) + '...' : textParts;
                console.log(`  💬 Conteúdo de texto: ${preview}`);
              }
            }
          }
          
          // Mostra tokens deste step se houver
          if (step.usage) {
            console.log(`  📊 Tokens deste step: input=${step.usage.inputTokens || 0}, output=${step.usage.outputTokens || 0}, total=${step.usage.totalTokens || 0}`);
          }
        });
        
        console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
      }
    } catch (error) {
      console.error("❌ Erro ao gerar resposta da IA:", error);
      if (error instanceof Error) {
        console.error("Erro detalhado:", error.message);
        console.error("Stack:", error.stack);
      }
      // Usa fallback específico para erros não relacionados a tools
      finalText = "Desculpe, encontrei uma dificuldade técnica ao processar sua mensagem. Por favor, tente novamente em alguns instantes. Se o problema persistir, entre em contato conosco diretamente.";
    }

    // Se não houver texto final após todo o processamento, usa fallback específico
    if (!finalText.trim()) {
      console.warn("⚠️ IA não gerou texto final após processamento completo");
      finalText = "Desculpe, não consegui processar sua solicitação no momento. Nossa equipe foi notificada e entrará em contato em breve. Obrigado pela compreensão!";
    }

    console.log(`✅ Resposta gerada: ${finalText.substring(0, 100)}...`);

    // Salva mensagem do assistente com tokens
    await saveMessage(chat.id, "assistant", finalText, {
      inputTokens: usageData?.inputTokens,
      outputTokens: usageData?.outputTokens,
      totalTokens: usageData?.totalTokens,
      model: agentModel, // Salva o modelo original do agente, não o mapeado
    });
    // Salva também na tabela chatMessages
    await saveChatMessage(salonId, clientPhone, "assistant", finalText).catch(err => {
      console.warn("⚠️ Erro ao salvar mensagem do assistente em chatMessages (continuando):", err);
    });

    // Envia resposta via WhatsApp usando o número do agente ativo
    await sendWhatsAppMessage(from, finalText, salonId);

    console.log(`✅ Resposta enviada para ${from}`);

    // Idempotência: a verificação já foi feita no início, não precisa salvar marker

    return new Response("", { status: 200 });
  } catch (error) {
    console.error("❌ Error processing WhatsApp webhook:", error);
    
    if (error instanceof Error) {
      console.error("Error name:", error.name);
      console.error("Error message:", error.message);
      console.error("Error stack:", error.stack);
    }
    
    // Retorna OK mesmo em caso de erro para evitar retentativas do Twilio
    return new Response("", { status: 200 });
  }
}
