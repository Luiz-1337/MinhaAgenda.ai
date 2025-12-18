## @repo/mcp-server

Este pacote tem **dois usos** dentro do monorepo:

- **MCP server (stdio)**: `src/index.ts`
  - Serve para rodar um servidor MCP via stdio (ex.: integrações com hosts MCP como IDEs).
  - Define tools com schemas em **Zod**.

- **Tools locais para Vercel AI SDK (Opção A)**: `tools/vercel-ai.ts`
  - Exporta `createMCPTools(salonId, clientPhone)` para uso direto em rotas do `apps/web`.
  - Retorna tools compatíveis com o `generateText` do pacote `ai`, com `inputSchema` em **Zod**.
  - Importante: aqui **não** há conexão com um MCP server remoto — é apenas um adapter de tools locais.

### Schemas

Os schemas base ficam em `src/schemas/tools.schema.ts` e são reutilizados tanto no MCP server quanto no adapter de tools locais.


