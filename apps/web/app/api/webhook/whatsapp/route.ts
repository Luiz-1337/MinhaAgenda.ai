import { convertToModelMessages, streamText, UIMessage, stepCountIs } from 'ai';
import { openai } from "@ai-sdk/openai";
import { getSalonIdByWhatsapp } from '@/lib/services/salon.service';
import { createSalonAssistantPrompt } from '@/lib/services/ai.service';
import { createMCPTools } from '@repo/mcp-server/tools/vercel-ai';
import { db, salons, customers, chats } from "@repo/db";
import { eq, and } from "drizzle-orm";
import { sendWhatsAppMessage, normalizePhoneNumber } from '@/lib/services/whatsapp.service';
import { findOrCreateChat, getChatHistory, saveMessage, saveChatMessage } from '@/lib/services/chat.service';
import { validateRequest } from "twilio";

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

    // Busca nome do salão
    const salon = await db.query.salons.findFirst({
      where: eq(salons.id, salonId),
      columns: { name: true }
    });
    const salonName = salon?.name || "nosso salão";

    // Busca preferências do cliente (se existir no CRM)
    const customer = await db.query.customers.findFirst({
      where: and(
        eq(customers.salonId, salonId),
        eq(customers.phone, clientPhone)
      ),
      columns: { aiPreferences: true }
    });

    let preferences: Record<string, unknown> | undefined = undefined;
    if (customer?.aiPreferences) {
      try {
        preferences = JSON.parse(customer.aiPreferences);
      } catch (e) {
        console.error("Erro ao fazer parse das preferências do cliente:", e);
      }
    }

    const systemPrompt = createSalonAssistantPrompt(salonName, preferences);

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

    // Gera resposta usando streamText (mesmo padrão do teste.tsx)
    const result = streamText({
      model: openai("o4-mini"),
      system: systemPrompt,
      messages: convertToModelMessages(uiMessages),
      tools: mcpTools,
      stopWhen: stepCountIs(5),
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
      finalText = "Desculpe, tive uma instabilidade para concluir seu pedido agora";
    }

    console.log(`✅ Resposta gerada: ${finalText.substring(0, 100)}...`);

    // Salva mensagem do assistente
    await saveMessage(chat.id, "assistant", finalText);
    // Salva também na tabela chatMessages
    await saveChatMessage(salonId, clientPhone, "assistant", finalText).catch(err => {
      console.warn("⚠️ Erro ao salvar mensagem do assistente em chatMessages (continuando):", err);
    });

    // Envia resposta via WhatsApp
    await sendWhatsAppMessage(from, finalText);

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
