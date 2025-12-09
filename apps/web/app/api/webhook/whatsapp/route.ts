import { openai } from "@ai-sdk/openai"
import { generateText, tool } from "ai"
import { z } from "zod"
import twilio from "twilio"
import { and, asc, eq } from "drizzle-orm"
import { db, chats, messages, salons } from "@repo/db"

// Hardcoded para testes - substitua por um UUID real do seu banco
const SALON_ID = process.env.DEFAULT_SALON_ID || "00000000-0000-0000-0000-000000000000"

// Inicializar cliente Twilio
const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
)

const getServicesTool = tool({
  description: "Busca e retorna a lista de serviços disponíveis do salão com seus preços. Use esta ferramenta quando o cliente perguntar sobre serviços, preços ou o que o salão oferece.",
  inputSchema: z.object({
    dummy: z.string().optional().describe("Ignorar este campo"),
  }),
  execute: async () => {
    console.log("🛠️ Tool executada!");
    const services = [
      "Corte Masculino: R$50", 
      "Barba: R$30", 
      "Combo: R$70"
    ];
    console.log("📋 Serviços retornados:", services);
    return {
      services,
    };
  },
});

export async function POST(req: Request) {
  try {
    // Parse do FormData do Twilio
    const formData = await req.formData()
    const from = formData.get("From") as string
    const body = formData.get("Body") as string
    const to = formData.get("To") as string

    if (!from || !body) {
      console.error("Missing required fields: From or Body")
      return new Response("Missing required fields", { status: 400 })
    }

    // Normalizar número de telefone (remover prefixo whatsapp: se existir)
    const clientPhone = from.replace("whatsapp:", "").trim()

    // Buscar nome do salão para o system prompt
    const salon = await db.query.salons.findFirst({
      where: eq(salons.id, SALON_ID),
      columns: { name: true },
    })

    const salonName = salon?.name || "Salão"

    // Encontrar ou criar chat
    let chat = await db.query.chats.findFirst({
      where: and(
        eq(chats.clientPhone, clientPhone),
        eq(chats.salonId, SALON_ID),
        eq(chats.status, "active")
      ),
    })

    if (!chat) {
      const inserted = await db
        .insert(chats)
        .values({
          salonId: SALON_ID,
          clientPhone,
          status: "active",
        })
        .returning({ id: chats.id })

      if (!inserted[0]) {
        throw new Error("Failed to create chat")
      }

      chat = await db.query.chats.findFirst({
        where: eq(chats.id, inserted[0].id),
      })

      if (!chat) {
        throw new Error("Failed to retrieve created chat")
      }
    }

    // Salvar mensagem do usuário
    await db.insert(messages).values({
      chatId: chat.id,
      role: "user",
      content: body,
    })

    // Buscar histórico (últimas 10 mensagens)
    const historyMessages = await db.query.messages.findMany({
      where: eq(messages.chatId, chat.id),
      orderBy: asc(messages.createdAt),
      limit: 10,
    })

    // Converter histórico para formato do AI SDK
    const aiMessages = historyMessages.map((msg) => ({
      role: msg.role as "user" | "assistant" | "system",
      content: msg.content || "",
    }))

    // Gerar resposta da IA
    const systemPrompt = `Você é o assistente virtual do salão ${salonName}. 

REGRAS CRÍTICAS:
1. Quando você usar uma ferramenta (como getServices), você OBRIGATORIAMENTE deve gerar uma resposta em TEXTO para o usuário baseada no resultado da ferramenta.
2. NUNCA termine uma conversa sem gerar texto. Sempre forneça uma resposta textual ao usuário.
3. Se você usar getServices e receber uma lista de serviços, apresente essa lista de forma clara e amigável ao cliente.
4. Seja educado, conciso e sempre responda em português brasileiro.`

    console.log("📤 Enviando para AI SDK:", {
      messagesCount: aiMessages.length,
      hasTools: true,
    });

    let result = await generateText({
      model: openai("gpt-4o"),
      system: systemPrompt,
      messages: aiMessages,
      tools: {
        getServices: getServicesTool,
      },
    })

    let { text: aiResponse, toolResults } = result;

    // Debug logs detalhados
    console.log("🤖 AI Final Response (primeira chamada):", aiResponse || "(vazio)");
    console.log("🤖 AI Response Length:", aiResponse?.length || 0);
    console.log("🔧 Tool Results:", toolResults ? JSON.stringify(toolResults, null, 2) : "none");
    console.log("🔧 Tool Results Count:", toolResults?.length || 0);
    
    // Se houver tool results mas resposta vazia, fazer segunda chamada para gerar resposta
    if (toolResults && toolResults.length > 0 && (!aiResponse || aiResponse.trim().length === 0)) {
      console.warn("⚠️ Tool executada mas resposta vazia. Fazendo segunda chamada...");
      
      // Extrair dados dos tool results para incluir no prompt
      const toolData = toolResults.map((tr) => {
        if ('output' in tr) {
          return { toolName: tr.toolName, output: tr.output };
        }
        return null;
      }).filter(Boolean);

      // Criar uma mensagem do usuário simulada com os resultados da tool
      const toolResultsText = toolData
        .map((td) => {
          if (td && 'output' in td && typeof td.output === 'object') {
            const output = td.output as { services?: string[] };
            if (output.services) {
              return `Resultado da ferramenta ${td.toolName}: ${output.services.join(', ')}`;
            }
            return `Resultado da ferramenta ${td.toolName}: ${JSON.stringify(output)}`;
          }
          return null;
        })
        .filter(Boolean)
        .join('\n');

      // Segunda chamada SEM tools para forçar geração de texto baseado nos resultados
      const enhancedSystemPrompt = `${systemPrompt}\n\nIMPORTANTE: Você acabou de executar uma ferramenta e recebeu os seguintes resultados:\n${toolResultsText}\n\nVocê DEVE responder ao usuário em texto explicando esses resultados de forma clara, amigável e em português brasileiro.`;

      result = await generateText({
        model: openai("gpt-4o"),
        system: enhancedSystemPrompt,
        messages: [
          ...aiMessages,
          {
            role: "user" as const,
            content: "Por favor, me mostre os resultados da consulta que você acabou de fazer.",
          },
        ],
      });

      aiResponse = result.text;
      console.log("🤖 AI Final Response (segunda chamada):", aiResponse || "(ainda vazio)");
      console.log("🤖 AI Response Length (segunda chamada):", aiResponse?.length || 0);
      
      if (!aiResponse || aiResponse.trim().length === 0) {
        console.error("❌ ERRO: Segunda chamada também retornou resposta vazia!");
        // Fallback: gerar resposta manual baseada nos tool results
        const firstToolResult = toolResults[0];
        if (firstToolResult && 'output' in firstToolResult) {
          const output = firstToolResult.output as { services?: string[] };
          const services = output?.services || [];
          if (services.length > 0) {
            aiResponse = `Aqui estão os serviços disponíveis:\n\n${services.join('\n')}\n\nComo posso ajudá-lo hoje?`;
            console.log("🔄 Usando resposta de fallback baseada nos serviços");
          }
        }
      } else {
        console.log("✅ Segunda chamada gerou resposta com sucesso! Continuando o fluxo...");
      }
    }

    // Verificar se temos uma resposta válida antes de continuar
    if (!aiResponse || aiResponse.trim().length === 0) {
      console.warn("⚠️ AI returned empty response após todas as tentativas", {
        toolResults: toolResults ? "present" : "none",
        toolResultsCount: toolResults?.length || 0,
      })
      // Não chamar Twilio se a resposta estiver vazia
      return new Response("OK", { status: 200 })
    }

    // Salvar mensagem do assistente
    console.log("💾 Salvando mensagem do assistente no banco...");
    await db.insert(messages).values({
      chatId: chat.id,
      role: "assistant",
      content: aiResponse,
    })

    // Enviar resposta via Twilio
    if (!process.env.TWILIO_PHONE_NUMBER) {
      throw new Error("TWILIO_PHONE_NUMBER is not set")
    }

    console.log("📱 Enviando mensagem via Twilio...");
    console.log("📱 Mensagem a enviar:", aiResponse.substring(0, 100) + "...");
    
    await twilioClient.messages.create({
      body: aiResponse,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: from, // Twilio já formata corretamente
    })

    console.log("✅ Mensagem enviada com sucesso via Twilio!");

    await twilioClient.messages.create({
      body: aiResponse,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: from, // Twilio já formata corretamente
    })

    // Retornar resposta HTTP 200
    return new Response("OK", { status: 200 })
  } catch (error) {
    console.error("Error processing WhatsApp webhook:", error)
    return new Response("Error processing webhook", { status: 500 })
  }
}

