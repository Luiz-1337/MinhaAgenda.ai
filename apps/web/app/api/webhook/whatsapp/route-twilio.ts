import { convertToModelMessages, streamText, UIMessage, stepCountIs } from 'ai';
import { openai } from "@ai-sdk/openai";
import { z } from 'zod';
import {
    cancelAppointmentSchema,
    checkAvailabilitySchema,
    createAppointmentSchema,
    getCustomerUpcomingAppointmentsSchema,
    getMyFutureAppointmentsSchema,
    getProfessionalAvailabilityRulesSchema,
    getProfessionalsSchema,
    getServicesSchema,
    identifyCustomerSchema,
    qualifyLeadSchema,
    rescheduleAppointmentSchema,
    saveCustomerPreferenceSchema,
  } from "@repo/mcp-server/src/schemas/tools.schema"
import { MinhaAgendaAITools } from '@repo/mcp-server/MinhaAgendaAI_tools';
import { getSalonIdByWhatsapp } from '@/lib/services/salon.service';
import { ensureIsoWithTimezone } from '@/lib/services/ai.service';
import { sendWhatsAppMessage, normalizePhoneNumber } from '@/lib/services/whatsapp.service';
import { findOrCreateChat, getChatHistory, saveMessage, updateChatTimestamps } from '@/lib/services/chat.service';
import { updateAgentCredits } from '@/app/actions/dashboard';
import { validateRequest } from "twilio";
import { eq } from "drizzle-orm";
import { db, messages } from "@repo/db";

export const maxDuration = 120;

/**
 * Processa webhook do WhatsApp via Twilio usando o mesmo padrão de chat com tools
 */
export async function POST(req: Request) {
  console.log("🔔 Webhook Twilio chamado - início do processamento");

  try {
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
    const messageSid = typeof messageSidValue === "string" ? messageSidValue : null;

    console.log(`📥 Webhook WhatsApp recebido: From=${from}, To=${to}, Body=${body?.substring(0, 100)}...`);

    if (!from || !body || !to) {
      console.error("Missing required fields: From, Body, or To");
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

    // Encontra ou cria chat
    console.log("💬 Encontrando ou criando chat...");
    const chat = await findOrCreateChat(clientPhone, salonId);
    console.log(`✅ Chat ID: ${chat.id}`);

    // Idempotência: verifica se a mensagem já foi processada
    if (messageSid) {
      const marker = `__twilio_message_sid:${messageSid}`;
      const alreadyProcessed = await db.query.messages.findFirst({
        where: eq(messages.content, marker),
        columns: { id: true },
      });

      if (alreadyProcessed) {
        console.warn(`🔁 Mensagem já processada (idempotency): ${messageSid}`);
        return new Response("OK", { status: 200 });
      }
    }

    // Salva mensagem do usuário e atualiza timestamp
    console.log("💾 Salvando mensagem do usuário...");
    await saveMessage(chat.id, "user", body);
    await updateChatTimestamps(chat.id, "user");
    console.log("✅ Mensagem salva");

    // Busca histórico de mensagens do chat (últimas 20 mensagens)
    console.log("📜 Buscando histórico de mensagens...");
    const historyMessages = await getChatHistory(chat.id, 20);
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

    // Define schemas das tools (mesmo padrão do route.ts)
    const identifyCustomerInputSchema = identifyCustomerSchema
      .partial({ phone: true })
      .describe("Identificação de cliente (phone é opcional; padrão = telefone do WhatsApp)");

    const checkAvailabilityInputSchema = checkAvailabilitySchema
      .omit({ salonId: true })
      .extend({
        date: z
          .string()
          .min(1)
          .describe("Data/hora ISO (ex: 2025-12-27T09:00:00-03:00). Se faltar timezone, será normalizado."),
      });

    const createAppointmentInputSchema = createAppointmentSchema
      .omit({ salonId: true, phone: true })
      .extend({
        date: z
          .string()
          .min(1)
          .describe("Data/hora ISO (ex: 2025-12-27T09:00:00-03:00). Se faltar timezone, será normalizado."),
      });

    const getServicesInputSchema = getServicesSchema.omit({ salonId: true });
    const saveCustomerPreferenceInputSchema = saveCustomerPreferenceSchema
      .omit({ salonId: true })
      .extend({
        customerId: saveCustomerPreferenceSchema.shape.customerId
          .optional()
          .describe("ID do cliente (opcional; padrão = cliente do WhatsApp, se já existir)"),
      });
    const qualifyLeadInputSchema = qualifyLeadSchema
      .omit({ salonId: true })
      .extend({
        phoneNumber: qualifyLeadSchema.shape.phoneNumber
          .optional()
          .describe("Número do lead (opcional; padrão = telefone do WhatsApp)"),
      });
    const getCustomerUpcomingAppointmentsInputSchema = getCustomerUpcomingAppointmentsSchema
      .omit({ salonId: true, customerPhone: true })
      .extend({
        customerPhone: getCustomerUpcomingAppointmentsSchema.shape.customerPhone
          .optional()
          .describe("Telefone do cliente (opcional; padrão = telefone do WhatsApp)"),
      });
    const getMyFutureAppointmentsInputSchema = getMyFutureAppointmentsSchema.omit({ salonId: true });
    const getProfessionalsInputSchema = getProfessionalsSchema.omit({ salonId: true });
    const getProfessionalAvailabilityRulesInputSchema = getProfessionalAvailabilityRulesSchema.omit({ salonId: true });
    const rescheduleAppointmentInputSchema = rescheduleAppointmentSchema.extend({
      newDate: z
        .string()
        .min(1)
        .describe("Nova data/hora ISO (ex: 2025-12-27T09:00:00-03:00). Se faltar timezone, será normalizado."),
    });

    const cancelAppointmentInputSchema = cancelAppointmentSchema
      .describe("Schema para cancelar agendamento. IMPORTANTE: SEMPRE chame getMyFutureAppointments primeiro para obter o appointmentId.");

    const impl = new MinhaAgendaAITools();

    // Gera resposta usando streamText (mesmo padrão do teste.tsx)
    const modelName = "gpt-4o-mini"; // Modelo usado
    const result = streamText({
      model: openai(modelName),
      messages: convertToModelMessages(uiMessages),
      tools: {
        identifyCustomer: {
          description:
            "Identifica um cliente pelo telefone. Se não encontrar e um nome for fornecido, cria um novo cliente. Retorna { id, name, found: true/false, created: true/false }.",
          inputSchema: identifyCustomerSchema,
          execute: async ({ phone, name }: z.infer<typeof identifyCustomerSchema>) => {
            const resolvedPhone = (phone || clientPhone).trim();
            const result = await impl.identifyCustomer(resolvedPhone, name);
            return result;
          },
        },

        getColorHairCuts: {
          description: "Retorna lista de cortes de cabelo disponíveis no salão.",
          inputSchema: z.object({}),
          execute: async () => {
            const result = "Cortes de cabelo disponíveis: COR A, COR J E COR K";
            return result;
          },
        },

        checkAvailability: {
          description:
            "Verifica horários disponíveis para agendamento em um salão. Considera horários de trabalho, agendamentos existentes e duração do serviço.",
          inputSchema: checkAvailabilityInputSchema,
          execute: async (input: z.infer<typeof checkAvailabilitySchema>) => {
            const result = await impl.checkAvailability(
              salonId,
              String(ensureIsoWithTimezone(input.date)),
              input.professionalId,
              input.serviceId,
              input.serviceDuration
            );
            return result;
          },
        },

        createAppointment: {
          description:
            "Cria um novo agendamento no sistema. Também cria evento no Google Calendar se houver integração ativa.",
          inputSchema: createAppointmentInputSchema,
          execute: async (input: z.infer<typeof createAppointmentSchema>) => {
            const result = await impl.createAppointment(
              salonId,
              input.professionalId,
              clientPhone,
              input.serviceId,
              String(ensureIsoWithTimezone(input.date)),
              input.notes
            );
            return result;
          },
        },

        cancelAppointment: {
          description:
            "Cancela um agendamento existente. Remove do Google Calendar se houver integração. IMPORTANTE: SEMPRE chame getMyFutureAppointments primeiro para obter o appointmentId.",
          inputSchema: cancelAppointmentInputSchema,
          execute: async (input: z.infer<typeof cancelAppointmentSchema>) => {
            const result = await impl.cancelAppointment(input.appointmentId, input.reason);
            return result;
          },
        },

        getServices: {
          description: "Busca lista de serviços disponíveis em um salão com preços e durações.",
          inputSchema: getServicesInputSchema,
          execute: async (input: z.infer<typeof getServicesSchema>) => {
            const result = await impl.getServices(salonId, input.includeInactive);
            return result;
          },
        },

        saveCustomerPreference: {
          description:
            "Salva uma preferência do cliente no CRM do salão. Útil para armazenar informações extraídas da conversa (ex: alergias, preferências).",
          inputSchema: saveCustomerPreferenceInputSchema,
          execute: async (input: z.infer<typeof saveCustomerPreferenceSchema>) => {
            let resolvedCustomerId = input.customerId;
            if (!resolvedCustomerId) {
              const identified = await impl.identifyCustomer(clientPhone);
              const parsed = identified as any;
              resolvedCustomerId = parsed?.id;
            }
            if (!resolvedCustomerId) {
              throw new Error("Não foi possível identificar o cliente. Chame identifyCustomer primeiro (ou forneça customerId).");
            }
            const result = await impl.saveCustomerPreference(salonId, resolvedCustomerId, input.key, input.value);
            return result;
          },
        },

        qualifyLead: {
          description: "Qualifica um lead baseado no nível de interesse demonstrado.",
          inputSchema: qualifyLeadInputSchema,
          execute: async (input: z.infer<typeof qualifyLeadSchema>) => {
            const result = await impl.qualifyLead(salonId, input.phoneNumber || clientPhone, input.interest, input.notes);
            return result;
          },
        },

        rescheduleAppointment: {
          description:
            "Reagenda um agendamento existente para uma nova data. IMPORTANTE: SEMPRE chame getMyFutureAppointments primeiro para obter o appointmentId.",
          inputSchema: rescheduleAppointmentInputSchema,
          execute: async (input: z.infer<typeof rescheduleAppointmentSchema>) => {
            const result = await impl.rescheduleAppointment(input.appointmentId, String(ensureIsoWithTimezone(input.newDate)));
            return result;
          },
        },

        getCustomerUpcomingAppointments: {
          description: "Lista agendamentos futuros de um cliente pelo número de telefone.",
          inputSchema: getCustomerUpcomingAppointmentsInputSchema,
          execute: async (input: z.infer<typeof getCustomerUpcomingAppointmentsSchema>) => {
            const result = await impl.getCustomerUpcomingAppointments(salonId, input.customerPhone || clientPhone);
            return result;
          },
        },

        getMyFutureAppointments: {
          description:
            "Lista agendamentos futuros do cliente atual. Use esta tool SEMPRE antes de cancelar ou reagendar agendamentos para obter os IDs necessários.",
          inputSchema: getMyFutureAppointmentsInputSchema,
          execute: async (input: z.infer<typeof getMyFutureAppointmentsSchema>) => {
            const result = await impl.getMyFutureAppointments(salonId, input.clientId, input.phone || clientPhone);
            return result;
          },
        },

        getProfessionals: {
          description: "Retorna lista de profissionais (barbeiros) do salão para mapear nomes a IDs.",
          inputSchema: getProfessionalsInputSchema,
          execute: async (input: z.infer<typeof getProfessionalsSchema>) => {
            const result = await impl.getProfessionals(salonId, input.includeInactive);
            return result;
          },
        },

        getProfessionalAvailabilityRules: {
          description:
            "Verifica os turnos de trabalho de um profissional específico (ex: 'João trabalha terças e quintas?').",
          inputSchema: getProfessionalAvailabilityRulesInputSchema,
          execute: async (input: z.infer<typeof getProfessionalAvailabilityRulesSchema>) => {
            const result = await impl.getProfessionalAvailabilityRules(salonId, input.professionalName);
            return result;
          },
        },
      },
      stopWhen: stepCountIs(5),
      onFinish: async ({ text, usage }) => {
        // Captura tokens e salva mensagem do assistente com tokens
        // Na versão 5.0 do AI SDK: promptTokens → inputTokens, completionTokens → outputTokens
        const inputTokens = usage?.inputTokens ?? null;
        const outputTokens = usage?.outputTokens ?? null;
        const totalTokens = usage?.totalTokens ?? null;

        console.log(`📊 Tokens usados: input=${inputTokens}, output=${outputTokens}, total=${totalTokens}`);

        // Salva mensagem do assistente com tokens
        if (text) {
          await saveMessage(chat.id, "assistant", text, {
            inputTokens: inputTokens ?? undefined,
            outputTokens: outputTokens ?? undefined,
            totalTokens: totalTokens ?? undefined,
            model: modelName,
          });

          // Atualiza timestamp da primeira resposta do agente
          await updateChatTimestamps(chat.id, "assistant");

          // Atualiza créditos do agente (usa o nome do agente padrão ou pode ser configurável)
          if (totalTokens && totalTokens > 0) {
            const agentName = "Assistente IA"; // Pode ser obtido de configuração do salão
            console.log(`💰 Atualizando créditos: salonId=${salonId}, agent=${agentName}, model=${modelName}, tokens=${totalTokens}`);
            await updateAgentCredits(salonId, agentName, modelName, totalTokens).catch(err => {
              console.error('❌ Erro ao atualizar créditos:', err);
            });
            console.log(`✅ Créditos atualizados com sucesso`);
          } else {
            console.warn(`⚠️ Total de tokens inválido ou zero: ${totalTokens}`);
          }
        }
      },
    });

    // Coleta o texto final do stream
    let finalText = '';
    const textStream = result.textStream;
    
    for await (const chunk of textStream) {
      finalText += chunk;
    }

    // Se não houver texto final, usa fallback
    if (!finalText.trim()) {
      console.warn("⚠️ IA não gerou texto final");
      finalText = "Desculpe, tive uma instabilidade para concluir seu pedido agora. Pode repetir sua mensagem ou me dizer o serviço e o dia/horário que você prefere?";
      
      // Salva fallback sem tokens (já que não houve uso real)
      await saveMessage(chat.id, "assistant", finalText);
      await updateChatTimestamps(chat.id, "assistant");
    }

    console.log(`✅ Resposta gerada: ${finalText.substring(0, 100)}...`);

    // Envia resposta via WhatsApp
    await sendWhatsAppMessage(from, finalText);

    console.log(`✅ Resposta enviada para ${from}`);

    // Marca mensagem como processada (idempotência)
    if (messageSid) {
      const marker = `__twilio_message_sid:${messageSid}`;
      await saveMessage(chat.id, "system", marker).catch(err => {
        console.error('Erro ao salvar marker de idempotência:', err);
      });
    }

    return new Response("OK", { status: 200 });
  } catch (error) {
    console.error("❌ Error processing WhatsApp webhook:", error);
    
    if (error instanceof Error) {
      console.error("Error name:", error.name);
      console.error("Error message:", error.message);
      console.error("Error stack:", error.stack);
    }
    
    // Retorna OK mesmo em caso de erro para evitar retentativas do Twilio
    return new Response("OK", { status: 200 });
  }
}

