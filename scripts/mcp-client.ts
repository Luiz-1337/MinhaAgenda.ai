/*!/usr/bin/env node
/**
 * MCP Client (AI SDK) - conecta direto no MCP Server via STDIO e roda um loop de chat
 * com logs no mesmo estilo do webhook do WhatsApp (steps / tool calls / resultado).
 *
 * Uso:
 *   pnpm mcp:debug
 *
 * Env úteis:
 *   OPENAI_API_KEY=...
 *   MCP_CLIENT_TOOL_SOURCE=vercel|mcp (default: mcp)
 *   MCP_SERVER_COMMAND=node
 *   MCP_SERVER_ARGS=--import,tsx,packages/mcp-server/src/index.ts
 *   MCP_CLIENT_MODEL=gpt-5-mini
 *   MCP_CLIENT_FALLBACK_MODEL=gpt-4o-mini
 */

import dotenv from "dotenv"
import * as readline from "node:readline/promises"
import { stdin, stdout } from "node:process"

import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js"

import { openai } from "@ai-sdk/openai"
import { generateText, jsonSchema, tool, stepCountIs, type CoreMessage, type ToolChoice } from "ai"

import { getSalonIdByWhatsapp, sanitizeWhatsApp } from "./mcp-chat-utils.js"
import { db, salons, salonCustomers, eq, and } from "@repo/db"

import { createSalonAssistantPrompt } from "../apps/web/lib/services/ai.service"
import { createMCPTools as createVercelTools } from "../packages/mcp-server/tools/vercel-ai"
import { MinhaAgendaAITools } from "../packages/mcp-server/src/MinhaAgendaAI_tools"

dotenv.config()

function parseCsvArgList(value: string | undefined): string[] {
  if (!value) return []
  // Permite formato "a,b,c" (README) ou "a b c"
  const parts = value.includes(",") ? value.split(",") : value.split(" ")
  return parts.map((p) => p.trim()).filter(Boolean)
}

function extractTextContent(content: unknown): string {
  if (Array.isArray(content)) {
    return content
      .map((c: any) => (c?.type === "text" ? String(c.text ?? "") : JSON.stringify(c)))
      .join("\n")
      .trim()
  }
  if (typeof content === "string") return content
  return JSON.stringify(content)
}

function tryParseJson(text: string): unknown {
  const trimmed = (text || "").trim()
  if (!trimmed) return ""
  try {
    return JSON.parse(trimmed)
  } catch {
    return trimmed
  }
}

function ensureIsoWithTimezone(input: unknown): unknown {
  if (typeof input !== "string") return input
  const s = input.trim()
  // Já tem timezone
  if (/(Z|[+-]\d{2}:?\d{2})$/.test(s)) return s
  // YYYY-MM-DDTHH:mm -> adiciona segundos + -03:00
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s)) return `${s}:00-03:00`
  // YYYY-MM-DDTHH:mm:ss -> adiciona -03:00
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(s)) return `${s}-03:00`
  return s
}

function looksLikeSchedulingIntent(text: string): boolean {
  const t = (text || "").toLowerCase()
  return (
    /\b(agendar|marcar|agenda|hor[áa]rio|horarios|dispon[ií]vel|disponibilidade|vaga|vagas)\b/.test(t) ||
    /\b(reagendar|remarcar|mudar\s+data|mudar\s+hor[áa]rio|trocar\s+data|trocar\s+hor[áa]rio)\b/.test(t) ||
    /\b(cancelar|desmarcar)\b/.test(t) ||
    /\b(\d{1,2}:\d{2})\b/.test(t) ||
    /\b(\d{1,2})\s*h\b/.test(t) ||
    /\b(dia)\s+\d{1,2}\b/.test(t)
  )
}

function relaxInputSchema(schema: any, toolName: string): any {
  const copy = structuredClone(schema)
  if (!copy || typeof copy !== "object") return schema

  // Deixa salonId opcional no schema do LLM (vamos injetar no execute)
  if (Array.isArray(copy.required)) {
    copy.required = copy.required.filter((r: string) => r !== "salonId" && r !== "phone" && r !== "customerId")
  }

  // Relaxa date-time (evita tool call inválida)
  const props = copy.properties || {}
  for (const k of ["date", "newDate"]) {
    if (props[k] && typeof props[k] === "object" && props[k].format === "date-time") {
      delete props[k].format
    }
  }
  copy.properties = props

  // Ajuda a IA: reforça no description o formato aceito
  if (toolName === "checkAvailability" && props.date) {
    props.date.description =
      (props.date.description ? `${props.date.description} ` : "") +
      "(Envie ISO, ex: 2025-12-27T09:00:00-03:00)"
  }
  if (toolName === "createAppointment" && props.date) {
    props.date.description =
      (props.date.description ? `${props.date.description} ` : "") +
      "(Envie ISO, ex: 2025-12-27T09:00:00-03:00)"
  }

  return copy
}

async function getSalonName(salonId: string): Promise<string> {
  const salon = await db.query.salons.findFirst({
    where: eq(salons.id, salonId),
    columns: { name: true },
  })
  return salon?.name || "nosso salão"
}

async function getPreferencesForProfile(salonId: string, profileId: string): Promise<Record<string, unknown> | undefined> {
  const row = await db.query.salonCustomers.findFirst({
    where: and(eq(salonCustomers.salonId, salonId), eq(salonCustomers.profileId, profileId)),
    columns: { preferences: true },
  })
  return (row?.preferences as Record<string, unknown>) || undefined
}

function trimChatHistory(history: CoreMessage[], maxMessages: number) {
  if (!Number.isFinite(maxMessages) || maxMessages <= 0) return
  if (history.length <= maxMessages) return
  history.splice(0, history.length - maxMessages)
}

async function main() {
  console.log("🔧 MCP Client (AI SDK)")
  console.log("============================================================")
  const toolSource = (process.env.MCP_CLIENT_TOOL_SOURCE || "mcp").toLowerCase()
  const useMcpServer = toolSource === "mcp"
  console.log("🧩 Tool source:", toolSource)

  let mcpClient: Client | undefined
  let toolsList: Awaited<ReturnType<Client["listTools"]>> | undefined

  if (useMcpServer) {
    console.log("🔌 Conectando ao Servidor MCP (STDIO)...")
    const serverCommand = process.env.MCP_SERVER_COMMAND || "node"
    const serverArgs =
      parseCsvArgList(process.env.MCP_SERVER_ARGS) || ["--import", "tsx", "packages/mcp-server/src/index.ts"]

    const transport = new StdioClientTransport({
      command: serverCommand,
      args: serverArgs.length > 0 ? serverArgs : ["--import", "tsx", "packages/mcp-server/src/index.ts"],
      env: Object.fromEntries(Object.entries(process.env).filter(([_, v]) => typeof v === "string")) as Record<
        string,
        string
      >,
    })

    mcpClient = new Client({ name: "minhaagendaai-mcp-client", version: "1.0.0" }, { capabilities: {} })
    await mcpClient.connect(transport)
    console.log("✅ MCP Conectado!")

    toolsList = await mcpClient.listTools()
    console.log(`🛠️ ${toolsList.tools.length} tools disponíveis (MCP server)`)
  } else {
    console.log("🛠️ Usando tools locais (vercel-ai.ts) — sem MCP server")
  }

  const rl = readline.createInterface({ input: stdin, output: stdout })

  const salonWhatsappInput = "+14155238886"
  console.log("📱 WhatsApp do salão (To): ", salonWhatsappInput)
  const salonWhatsapp = sanitizeWhatsApp(salonWhatsappInput)
  const salonId = await getSalonIdByWhatsapp(salonWhatsapp)
  if (!salonId) {
    console.error(`❌ Não encontrei salão para: ${salonWhatsappInput}`)
    process.exit(1)
  }

  const salonName = await getSalonName(salonId)
  console.log(`✅ Salão: ${salonName} (${salonId})`)

  const clientPhone = "+5511986049295"
  console.log("📞 Telefone do cliente (From): ", clientPhone)
  if (!clientPhone) {
    console.error("❌ Telefone do cliente é obrigatório")
    process.exit(1)
  }

  // Identifica/cria cliente (para permitir createAppointment e salvar preferências)
  let customerId: string | undefined
  if (useMcpServer) {
    try {
      if (!mcpClient) throw new Error("MCP client não inicializado")
      const res = await mcpClient.callTool({ name: "identifyCustomer", arguments: { phone: clientPhone } })
      const parsed = tryParseJson(extractTextContent(res.content)) as any
      customerId = parsed?.id
      if (!customerId) {
        const name = await rl.question("👤 Nome do cliente (para criar cadastro): ")
        const res2 = await mcpClient.callTool({
          name: "identifyCustomer",
          arguments: { phone: clientPhone, name: name.trim() },
        })
        const parsed2 = tryParseJson(extractTextContent(res2.content)) as any
        customerId = parsed2?.id
      }
    } catch (e) {
      console.warn("⚠️ Falha ao identificar cliente via MCP:", e)
    }
  } else {
    try {
      const impl = new MinhaAgendaAITools()
      const res = await impl.identifyCustomer(clientPhone)
      const parsed = tryParseJson(String(res)) as any
      customerId = parsed?.id
      if (!customerId) {
        const name = await rl.question("👤 Nome do cliente (para criar cadastro): ")
        const res2 = await impl.identifyCustomer(clientPhone, name.trim())
        const parsed2 = tryParseJson(String(res2)) as any
        customerId = parsed2?.id
      }
    } catch (e) {
      console.warn("⚠️ Falha ao identificar cliente via tools locais:", e)
    }
  }

  if (customerId) {
    console.log(`✅ Cliente identificado: ${customerId}`)
  } else {
    console.warn("⚠️ Não foi possível identificar cliente; createAppointment pode falhar.")
  }

  const preferences = customerId ? await getPreferencesForProfile(salonId, customerId) : undefined
  const systemPrompt = createSalonAssistantPrompt(salonName, preferences)

  console.log("\n💬 Chat iniciado. Digite sua mensagem (ou 'sair'):\n")

  let aiTools: Record<string, any>
  if (useMcpServer) {
    if (!mcpClient) throw new Error("MCP client não inicializado")
    if (!toolsList) throw new Error("toolsList não inicializado")

    // Constrói tools AI SDK chamando o MCP server por trás
    console.log("🛠️ Criando tools (AI SDK -> MCP)...")
    aiTools = Object.fromEntries(
      toolsList.tools.map((t) => {
        const relaxed = relaxInputSchema(t.inputSchema as any, t.name)

        const tTool = tool({
          description: t.description,
          inputSchema: jsonSchema(relaxed),
          execute: async (rawArgs: any) => {
            const args = { ...(rawArgs || {}) }

            // Injeção de contexto (igual ao webhook)
            if (args.salonId == null || args.salonId === "") args.salonId = salonId
            if (t.name === "createAppointment" && (args.phone == null || args.phone === "")) args.phone = clientPhone
            if (t.name === "getMyFutureAppointments" && (args.phone == null || args.phone === "")) args.phone = clientPhone
            if (t.name === "saveCustomerPreference" && (args.customerId == null || args.customerId === "") && customerId)
              args.customerId = customerId
            if (t.name === "qualifyLead" && (args.phoneNumber == null || args.phoneNumber === "")) args.phoneNumber = clientPhone

            // Normaliza datas (para atender zod datetime do servidor MCP)
            if (args.date) args.date = ensureIsoWithTimezone(args.date)
            if (args.newDate) args.newDate = ensureIsoWithTimezone(args.newDate)

            const result = await mcpClient.callTool({ name: t.name, arguments: args })
            const text = extractTextContent(result.content)
            return tryParseJson(text)
          },
        })

        return [t.name, tTool]
      })
    ) as unknown as Record<string, any>
  } else {
    console.log("🛠️ Criando tools locais (vercel-ai.ts)...")
    aiTools = createVercelTools(salonId, clientPhone) as unknown as Record<string, any>
  }

  console.log(`✅ ${Object.keys(aiTools).length} tools criadas`)

  const model = process.env.MCP_CLIENT_MODEL || "gpt-5-mini"
  const fallbackModel = process.env.MCP_CLIENT_FALLBACK_MODEL || "gpt-4o-mini"
  const maxHistory = Number(process.env.MCP_CLIENT_MAX_HISTORY || "30")

  // Histórico em memória para manter contexto entre turns (evita “amnésia” do modelo)
  // Observação: `systemPrompt` vai no campo `system` do generateText, então NÃO colocamos role=system aqui.
  const chatHistory: CoreMessage[] = []

  while (true) {
    let userInput = ""
    try {
      userInput = await rl.question("Você: ")
    } catch (e: any) {
      // Em execuções não-interativas (stdin fechado), o readline pode encerrar.
      const msg = String(e?.message || e || "")
      if (e?.code === "ERR_USE_AFTER_CLOSE" || /readline was closed/i.test(msg)) {
        console.warn("⚠️ stdin/readline fechado; encerrando chat.")
        break
      }
      throw e
    }
    if (userInput.trim().toLowerCase() === "sair") break

    const wantTools = looksLikeSchedulingIntent(userInput)
    console.log("🧠 AI request config:", { wantTools, model, fallbackModel })

    const userMsg: CoreMessage = { role: "user", content: userInput }
    chatHistory.push(userMsg)
    trimChatHistory(chatHistory, maxHistory)

    const run = async (modelName: string) =>
      generateText({
        model: openai(modelName),
        system: systemPrompt,
        messages: chatHistory,
        tools: aiTools as any,
        prepareStep: ({ steps }) => ({
          toolChoice: (wantTools && steps.length === 0 ? "required" : "auto") as ToolChoice<any>,
        }),
        stopWhen: stepCountIs(10),
        onStepFinish: (step) => {
          console.log("🧾 Step finished:", {
            finishReason: step.finishReason,
            toolCalls: step.toolCalls?.length || 0,
            toolResults: step.toolResults?.length || 0,
            textLen: (step.text as string | undefined)?.length || 0,
          })

          const calls = (step.toolCalls || []).map((c: any) => ({
            toolName: c.toolName,
            invalid: c.invalid,
            input: c.input,
            error: c.error,
          }))
          if (calls.length > 0) console.log("🔧 Tool calls:", calls)
        },
      })

    let result: Awaited<ReturnType<typeof generateText>> | undefined
    try {
      result = await run(model)
    } catch (err) {
      console.error("❌ generateText falhou com modelo primário:", err)
      console.warn("🔁 Tentando fallback model...")
      try {
        result = await run(fallbackModel)
      } catch (err2) {
        // Remove a última mensagem do usuário para não “poluir” o histórico com um turn que falhou.
        if (chatHistory.length > 0 && chatHistory[chatHistory.length - 1] === userMsg) {
          chatHistory.pop()
        }
        throw err2
      }
    }

    // Persiste no histórico as mensagens retornadas pelo AI SDK (inclui tool calls/results quando aplicável).
    const responseMessages = (result as any)?.responseMessages as CoreMessage[] | undefined
    if (Array.isArray(responseMessages) && responseMessages.length > 0) {
      chatHistory.push(...responseMessages)
    } else {
      // Fallback: ao menos guarda o texto final do assistant
      chatHistory.push({ role: "assistant", content: (result.text || "").trim() })
    }
    trimChatHistory(chatHistory, maxHistory)

    const totalToolCalls = (result.steps || []).reduce((sum, s: any) => sum + ((s.toolCalls as any[])?.length || 0), 0)
    const totalToolResults = (result.steps || []).reduce((sum, s: any) => sum + ((s.toolResults as any[])?.length || 0), 0)
    const totalInvalidToolCalls = (result.steps || []).reduce((sum, s: any) => {
      const invalidInStep = ((s.toolCalls as any[]) || []).filter((c) => c?.invalid).length
      return sum + invalidInStep
    }, 0)

    console.log(
      `📊 Resultado: text length=${result.text?.length || 0}, finishReason=${result.finishReason}, totalToolCalls=${totalToolCalls}, totalToolResults=${totalToolResults}, totalInvalidToolCalls=${totalInvalidToolCalls}`
    )

    const reply = (result.text || "").trim()
    console.log(`\n🤖 IA: ${reply || "(sem resposta)"}\n`)
  }

  rl.close()
  if (mcpClient) await mcpClient.close()
}

main().catch((err) => {
  console.error("❌ Erro fatal no mcp-client:", err)
  process.exit(1)
})


