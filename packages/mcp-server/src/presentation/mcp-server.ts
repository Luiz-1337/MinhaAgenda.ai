import { Server } from "@modelcontextprotocol/sdk/server/index.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js"
import { container, registerProviders } from "../container"
import { registerAllTools } from "./tools"

/**
 * Inicia o servidor MCP
 */
export async function start(salonId: string, clientPhone: string) {
  // Registra todos os providers no container
  registerProviders(container)

  // Cria o servidor MCP
  const server = new Server(
    {
      name: "minhaagendaai",
      version: "1.0.0",
    },
    {
      capabilities: {
        tools: {},
      },
    }
  )

  // Registra as tools
  const tools = registerAllTools(container, salonId, clientPhone)
  const toolEntries = Object.entries(tools)

  // Handler para listar tools
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: toolEntries.map(([name, toolDef]) => ({
        name,
        description: (toolDef as { description?: string }).description ?? "",
        inputSchema: {
          type: "object" as const,
          properties: {},
        },
      })),
    }
  })

  // Handler para executar tools
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params
    const toolDef = tools[name as keyof typeof tools]

    if (!toolDef) {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ error: true, message: `Tool não encontrada: ${name}` }),
          },
        ],
      }
    }

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const tool = toolDef as any
      const result = await tool.execute(args)
      return {
        content: [
          {
            type: "text" as const,
            text: typeof result === "string" ? result : JSON.stringify(result),
          },
        ],
      }
    } catch (error) {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              error: true,
              message: error instanceof Error ? error.message : "Erro desconhecido",
            }),
          },
        ],
      }
    }
  })

  // Error handler
  server.onerror = (error) => {
    console.error("[MCP Server Error]", error)
  }

  // Conecta ao transporte stdio
  const transport = new StdioServerTransport()
  await server.connect(transport)

  console.error("[MCP Server] MinhaAgendaAI server started")
}

/**
 * Para o servidor (para testes)
 */
export async function stop() {
  // Limpa singletons do container
  container.clearSingletons()
}
