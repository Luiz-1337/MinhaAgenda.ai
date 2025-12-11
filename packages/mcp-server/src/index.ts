#!/usr/bin/env node

/**
 * MCP Server para Minha Agenda AI
 * 
 * Este servidor expõe tools para gerenciamento de agendamentos, serviços,
 * disponibilidade e CRM através do Model Context Protocol.
 * 
 * Uso:
 *   node dist/index.js
 * 
 * Ou configure no Cursor/Claude Desktop:
 *   {
 *     "mcpServers": {
 *       "minhaagendaai": {
 *         "command": "node",
 *         "args": ["path/to/dist/index.js"]
 *       }
 *     }
 *   }
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { registerTools } from "./tools/index.js"

/**
 * Cria e inicializa o servidor MCP
 */
async function main() {
  const server = new Server(
    {
      name: "minhaagendaai-mcp-server",
      version: "0.1.0",
    },
    {
      capabilities: {
        tools: {},
      },
    }
  )

  // Registra todas as tools
  registerTools(server)

  // Tratamento de erros
  server.onerror = (error) => {
    console.error("[MCP Error]", error)
  }

  // Conecta via stdio (padrão para MCP)
  const transport = new StdioServerTransport()
  await server.connect(transport)

  console.error("MCP Server iniciado e pronto para receber requisições")
}

// Executa o servidor
main().catch((error) => {
  console.error("Erro fatal ao iniciar servidor MCP:", error)
  process.exit(1)
})

