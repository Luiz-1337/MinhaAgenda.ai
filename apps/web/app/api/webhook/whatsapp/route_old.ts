import {
  findOrCreateChat,
  saveMessage,
  getChatHistory,
  getSalonName,
} from "@/lib/services/chat.service"
import { createSalonAssistantPrompt } from "@/lib/services/ai.service"
import { sendWhatsAppMessage, normalizePhoneNumber } from "@/lib/services/whatsapp.service"
import { extractErrorMessage } from "@/lib/services/error.service"
import { openai } from "@ai-sdk/openai"
import { generateText, type ModelMessage } from "ai"
import { stepCountIs } from "ai"
import { createMCPTools } from "@repo/mcp-server/tools/vercel-ai"
import { getOwnerSalonId, getSalonIdByWhatsapp } from "@/lib/services/salon.service"
import { validateRequest } from "twilio"
import { and, eq } from "drizzle-orm"
import { db, messages } from "@repo/db"

// Vercel: OpenAI + tool calls podem exceder o default do serverless
export const maxDuration = 120

/**
 * Processa webhook do WhatsApp via Twilio
 */
export async function POST(req: Request) {
  console.log("🔔 Webhook chamado - início do processamento")
  
  // Debug: Verificar variáveis de ambiente
  const defaultSalonId = await getSalonIdByWhatsapp(process.env.TWILIO_PHONE_NUMBER!)
  console.log("🔍 Verificando variáveis de ambiente:", {
    hasAccountSid: !!process.env.TWILIO_ACCOUNT_SID,
    hasAuthToken: !!process.env.TWILIO_AUTH_TOKEN,
    hasPhoneNumber: !!process.env.TWILIO_PHONE_NUMBER,
    hasOpenAI: !!process.env.OPENAI_API_KEY,
    hasDatabase: !!process.env.DATABASE_URL,
    defaultSalonId,
  })
  
  try {
    // Log de headers para debug
    const headers: Record<string, string> = {}
    req.headers.forEach((value, key) => {
      headers[key] = value
    })
    console.log("📋 Headers recebidos:", JSON.stringify(headers, null, 2))
    
    const formData = await req.formData()
    
    // Log todos os campos do formData
    const formDataEntries: Record<string, string> = {}
    formData.forEach((value, key) => {
      formDataEntries[key] = value.toString()
    })
    console.log("📋 FormData recebido:", JSON.stringify(formDataEntries, null, 2))
    
    const fromValue = formData.get("From")
    const bodyValue = formData.get("Body")
    const toValue = formData.get("To")

    const from = typeof fromValue === "string" ? fromValue : fromValue == null ? "" : String(fromValue)
    const body = typeof bodyValue === "string" ? bodyValue : bodyValue == null ? "" : String(bodyValue)
    const to = typeof toValue === "string" ? toValue : toValue == null ? "" : String(toValue)

    // Idempotência: Twilio pode reenviar o mesmo evento em caso de timeout/erros transitórios
    const messageSidValue = formData.get("MessageSid")
    const smsMessageSidValue = formData.get("SmsMessageSid")
    const messageSidRaw =
      (typeof messageSidValue === "string"
        ? messageSidValue
        : messageSidValue == null
          ? null
          : String(messageSidValue)) ??
      (typeof smsMessageSidValue === "string"
        ? smsMessageSidValue
        : smsMessageSidValue == null
          ? null
          : String(smsMessageSidValue))

    console.log("🧾 Correlation (inicial):", {
      messageSid: messageSidRaw ?? null,
    })

    console.log(`📥 Webhook WhatsApp recebido: From=${from}, To=${to}, Body=${body?.substring(0, 100)}...`)

    if (!from || !body) {
      console.error("Missing required fields: From or Body")
      return new Response("Missing required fields", { status: 400 })
    }

    // Segurança: valida assinatura do Twilio (evita spoofing)
    // Permite bypass em dev para facilitar testes locais/ngrok
    const shouldValidateSignature =
      process.env.NODE_ENV !== "development" && process.env.TWILIO_SIGNATURE_BYPASS !== "1"

    if (shouldValidateSignature) {
      const authToken = process.env.TWILIO_AUTH_TOKEN
      const twilioSignature = req.headers.get("x-twilio-signature")
      // Twilio valida assinatura com base na URL pública (host/proto) + path (+ query string se houver)
      const url = new URL(req.url)
      const forwardedProto = req.headers.get("x-forwarded-proto")
      const forwardedHost = req.headers.get("x-forwarded-host")
      const host = forwardedHost ?? req.headers.get("host") ?? url.host
      const proto = forwardedProto ?? url.protocol.replace(":", "")
      const publicUrl = `${proto}://${host}${url.pathname}${url.search}`

      if (!authToken || !twilioSignature) {
        console.error("❌ Missing TWILIO_AUTH_TOKEN or X-Twilio-Signature")
        return new Response("Unauthorized", { status: 401 })
      }

      const isValid = validateRequest(authToken, twilioSignature, publicUrl, formDataEntries)
      if (!isValid) {
        console.error("❌ Twilio signature inválida", {
          publicUrl,
          hasSignature: !!twilioSignature,
        })
        return new Response("Unauthorized", { status: 401 })
      }

      console.log("🔐 Twilio signature válida")
    } else {
      console.log("🔓 Twilio signature validation bypassed (development or TWILIO_SIGNATURE_BYPASS=1)")
    }

    // Normaliza número do cliente (remove prefixo whatsapp: para armazenamento interno)
    const clientPhone = normalizePhoneNumber(from)
    console.log(`📞 Número normalizado do cliente: ${clientPhone}`)
    
    // Busca salão pelo número de WhatsApp que recebeu a mensagem (campo "To")
    if (!to) {
      console.error("Missing required field: To (WhatsApp number that received the message)")
      return new Response("Missing required field: To", { status: 400 })
    }
    
    console.log("🏢 Buscando salão pelo número de WhatsApp...")
    console.log(`📱 Número do salão (To): ${to}`)
    const salonId = await getSalonIdByWhatsapp(to)
    
    if (!salonId) {
      console.error(`❌ Salão não encontrado para o número de WhatsApp: ${to}`)
      console.error("   Verifique se o número está correto e se o salão está cadastrado no sistema.")
      return new Response(
        `Salão não encontrado para o número de WhatsApp: ${to}. Verifique se o salão está cadastrado.`,
        { status: 404 }
      )
    }
    
    console.log(`✅ Salon ID encontrado: ${salonId}`)

    // Busca nome do salão para o system prompt
    console.log("🔍 Buscando nome do salão...")
    const salonName = await getSalonName(salonId)
    console.log(`✅ Nome do salão: ${salonName}`)

    // Encontra ou cria chat
    console.log("💬 Encontrando ou criando chat...")
    const chat = await findOrCreateChat(clientPhone, salonId)
    console.log(`✅ Chat ID: ${chat.id}`)

    const correlation = {
      messageSid: messageSidRaw ?? null,
      salonId,
      chatId: chat.id,
      clientPhone,
    }
    console.log("🧾 Correlation (completo):", correlation)

    // Idempotência (quick fix):
    // Evita processar e responder duas vezes o mesmo MessageSid em retentativas do Twilio.
    // TODO: Implement idempotency check using Redis or DB table 'messages' with MessageSid unique constraint.
    if (messageSidRaw) {
      const marker = `__twilio_message_sid:${messageSidRaw}`
      const alreadyProcessed = await db.query.messages.findFirst({
        where: and(eq(messages.chatId, chat.id), eq(messages.content, marker)),
        columns: { id: true },
      })

      if (alreadyProcessed) {
        console.warn(`🔁 Mensagem já processada (idempotency): ${messageSidRaw}`)
        return new Response("OK", { status: 200 })
      }

      // Marca como visto/processado o quanto antes para não queimar tokens em retries.
      // Observação: sem constraint única, ainda pode haver race condition em concorrência.
      await saveMessage(chat.id, "system", marker)
    }

    // Salva mensagem do usuário
    console.log("💾 Salvando mensagem do usuário...")
    await saveMessage(chat.id, "user", body)
    console.log("✅ Mensagem salva")

    // Busca histórico
    console.log("📜 Buscando histórico de mensagens...")
    const historyMessages = await getChatHistory(chat.id, 20)
    console.log(`✅ Histórico carregado: ${historyMessages.length} mensagens`)

    // Converte mensagens para CoreMessage
    // Remove mensagens internas de idempotência do contexto do modelo
    const filteredHistory = historyMessages.filter(
      (msg) => !(msg.role === "system" && msg.content.startsWith("__twilio_message_sid:"))
    )

    const coreMessages: ModelMessage[] = filteredHistory.map((msg) => ({
      role: msg.role,
      content: msg.content,
    }))

    // Cria tools do MCP
    console.log("🛠️ Criando tools do MCP...")
    const mcpTools = createMCPTools(salonId, clientPhone)
    console.log(`✅ ${Object.keys(mcpTools).length} tools criadas`)
    // Debug: garante que as tools estão com schema/executor (ajuda a diagnosticar toolCalls=0)
    try {
      const summary: Record<string, { hasInputSchema: boolean; hasExecute: boolean }> = {}
      for (const [name, t] of Object.entries(mcpTools)) {
        const anyTool = t as unknown as Record<string, unknown>
        summary[name] = {
          hasInputSchema: !!anyTool.inputSchema,
          hasExecute: typeof (anyTool as any).execute === "function",
        }
      }
      console.log("🧩 MCP tools summary:", summary)
    } catch (e) {
      console.warn("⚠️ Falha ao gerar summary das tools MCP:", e)
    }

    // Gera resposta da IA
    console.log("🤖 Gerando resposta com IA...")
    const systemPrompt = createSalonAssistantPrompt(salonName)
    console.log("📝 System prompt criado")

    const bodyLower = (body || "").toLowerCase()
    const wantTools =
      // Intenção explícita de agendar/reagendar/cancelar/consultar horários
      /\b(agendar|marcar|agenda|hor[áa]rio|horarios|dispon[ií]vel|disponibilidade|vaga|vagas)\b/.test(
        bodyLower
      ) ||
      /\b(reagendar|remarcar|mudar\s+data|mudar\s+hor[áa]rio|trocar\s+data|trocar\s+hor[áa]rio)\b/.test(
        bodyLower
      ) ||
      /\b(cancelar|desmarcar)\b/.test(bodyLower) ||
      // Mensagens de confirmação comuns após o assistente oferecer um horário
      /\b(pode|pode\s+ser|fechado|ok|beleza|sim|confirmo|confirmar)\b/.test(bodyLower) ||
      // Muitas confirmações vêm só com data/hora soltas (ex: "dia 27 às 9", "09:00")
      /\b(\d{1,2}:\d{2})\b/.test(bodyLower) ||
      /\b(\d{1,2})\s*h\b/.test(bodyLower) ||
      /\b(dia)\s+\d{1,2}\b/.test(bodyLower)
    const primaryModel = process.env.WHATSAPP_MODEL || "gpt-5-mini"
    const fallbackModel = process.env.WHATSAPP_FALLBACK_MODEL || "gpt-4o-mini"

    console.log("🧠 AI request config:", {
      wantTools,
      primaryModel,
      fallbackModel,
    })

    type McpTools = typeof mcpTools

    let result: Awaited<ReturnType<typeof generateText<McpTools>>>
    try {
      result = await generateText<McpTools>({
        model: openai(primaryModel),
        system: systemPrompt,
        messages: coreMessages,
        tools: mcpTools,
        // IMPORTANT: 'toolChoice: required' aplica para a geração inteira e pode impedir a resposta final em texto.
        // Aqui forçamos tool call APENAS no primeiro step quando a intenção exige tools; nos demais steps, 'auto'.
        prepareStep: ({ steps }) => ({
          toolChoice: wantTools && steps.length === 0 ? "required" : "auto",
        }),
        stopWhen: stepCountIs(10),
        onStepFinish: (step) => {
          console.log("🧾 Step finished:", {
            correlation,
            finishReason: step.finishReason,
            toolCalls: step.toolCalls?.length || 0,
            toolResults: step.toolResults?.length || 0,
            textLen: (step.text as string | undefined)?.length || 0,
          })

          const calls = (step.toolCalls || []).map((c) => ({
            toolName: c.toolName,
            invalid: (c as any).invalid,
            input: (c as any).input,
            error: (c as any).error,
          }))
          if (calls.length > 0) {
            console.log("🔧 Tool calls:", calls)
          }
        },
      })
    } catch (err) {
      console.error("❌ generateText falhou com modelo primário:", {
        primaryModel,
        wantTools,
        error: err,
      })
      // Se era um fluxo que exige tools, tenta um modelo conhecido por suportar tool calls bem.
      if (wantTools) {
        console.warn("🔁 Tentando fallback model para tool calls...")
        result = await generateText<McpTools>({
          model: openai(fallbackModel),
          system: systemPrompt,
          messages: coreMessages,
          tools: mcpTools,
          prepareStep: ({ steps }) => ({
            toolChoice: wantTools && steps.length === 0 ? "required" : "auto",
          }),
          stopWhen: stepCountIs(10),
          onStepFinish: (step) => {
            console.log("🧾 Step finished:", {
              correlation,
              finishReason: step.finishReason,
              toolCalls: step.toolCalls?.length || 0,
              toolResults: step.toolResults?.length || 0,
              textLen: (step.text as string | undefined)?.length || 0,
            })

            const calls = (step.toolCalls || []).map((c) => ({
              toolName: c.toolName,
              invalid: (c as any).invalid,
              input: (c as any).input,
              error: (c as any).error,
            }))
            if (calls.length > 0) {
              console.log("🔧 Tool calls:", calls)
            }
          },
        })
      } else {
        throw err
      }
    }
    
    console.log(`📊 Resultado: text length=${result.text?.length || 0}, toolCalls=${result.toolCalls?.length || 0}, toolResults=${result.toolResults?.length || 0}, finishReason=${result.finishReason}`)

    let aiResponse = (result.text || "").trim()

    // Retry defensivo: se a intenção sugere tools e mesmo assim não houve toolCalls,
    // ou se a resposta parece conter "horário/dia" sem toolCalls, refazemos forçando toolChoice.
    const toolCallsCount = result.toolCalls?.length || 0
    const aiLower = (aiResponse || "").toLowerCase()
    const looksLikeHallucinatedSchedule =
      // Heurística: se a resposta menciona horários específicos/datas como se fossem disponibilidade,
      // mas não houve toolCalls, provavelmente alucinou.
      /\b(\d{1,2}:\d{2})\b/.test(aiLower) ||
      /\b(primeiro\s+hor[áa]rio|hor[áa]rio\s+dispon[ií]vel|est[áa]\s+dispon[ií]vel|temos\s+hor[áa]rio)\b/.test(
        aiLower
      )

    if (toolCallsCount === 0 && (wantTools || looksLikeHallucinatedSchedule)) {
      console.warn("🔁 Retry: sem toolCalls em mensagem que aparenta exigir tools. Forçando toolChoice='required'.")
      // Aqui o prepareStep já força required no primeiro step, então retry só troca modelo.
      result = await generateText<McpTools>({
        model: openai(fallbackModel),
        system: systemPrompt,
        messages: coreMessages,
        tools: mcpTools,
        prepareStep: ({ steps }) => ({
          toolChoice: wantTools && steps.length === 0 ? "required" : "auto",
        }),
        stopWhen: stepCountIs(10),
        onStepFinish: (step) => {
          console.log("🧾 Step finished:", {
            correlation,
            finishReason: step.finishReason,
            toolCalls: step.toolCalls?.length || 0,
            toolResults: step.toolResults?.length || 0,
            textLen: (step.text as string | undefined)?.length || 0,
          })

          const calls = (step.toolCalls || []).map((c) => ({
            toolName: c.toolName,
            invalid: (c as any).invalid,
            input: (c as any).input,
            error: (c as any).error,
          }))
          if (calls.length > 0) {
            console.log("🔧 Tool calls:", calls)
          }
        },
      })
      console.log(`📊 Resultado (retry): text length=${result.text?.length || 0}, toolCalls=${result.toolCalls?.length || 0}, toolResults=${result.toolResults?.length || 0}, finishReason=${result.finishReason}`)
      aiResponse = (result.text || "").trim()
    }

    // Regra: só enviamos WhatsApp quando houver texto final (não tool-call).
    // Se mesmo após stopWhen ainda não houver texto, devolvemos um fallback humano.
    if (!aiResponse) {
      console.warn("⚠️ IA não gerou texto final (provável término em tool-calls)")
      console.warn("📊 Debug info:", {
        finishReason: result.finishReason,
        toolCalls: result.toolCalls?.length || 0,
        toolResults: result.toolResults?.length || 0,
      })
      aiResponse =
        "Desculpe, tive uma instabilidade para concluir seu pedido agora. Pode repetir sua última mensagem ou me dizer o serviço e o dia/horário que você prefere?"
    }

    // Log da resposta final da IA (útil para debug do fluxo MCP/tools)
    {
      const full = process.env.LOG_AI_RESPONSE_FULL === "1"
      const safeText = (aiResponse || "").trim()
      const preview = safeText.replace(/\s+/g, " ").slice(0, 800)
      console.log(`🤖 IA (final) length=${safeText.length}`)
      console.log(`🤖 IA (final) preview: ${preview}${safeText.length > 800 ? "..." : ""}`)
      if (full) {
        console.log("🤖 IA (final) full:\n" + safeText)
      }
    }

    // Salva mensagem do assistente
    await saveMessage(chat.id, "assistant", aiResponse)

    // Envia resposta via WhatsApp (from já está no formato whatsapp:+E.164)
    await sendWhatsAppMessage(from, aiResponse)

    console.log(`✅ Resposta enviada para ${from}`)
    return new Response("", { status: 200 })
  } catch (error) {
    console.error("❌ Error processing WhatsApp webhook:", error)
    
    // Log detalhado do erro
    if (error instanceof Error) {
      console.error("Error name:", error.name)
      console.error("Error message:", error.message)
      console.error("Error stack:", error.stack)
    } else {
      console.error("Error (unknown type):", JSON.stringify(error, null, 2))
    }
    
    const errorMessage = extractErrorMessage(error)
    console.error("Extracted error message:", errorMessage)
    
    // Retorna OK mesmo em caso de erro para evitar retentativas do Twilio
    // Mas logamos o erro para debug
    return new Response("OK", { status: 200 })
  }
}
