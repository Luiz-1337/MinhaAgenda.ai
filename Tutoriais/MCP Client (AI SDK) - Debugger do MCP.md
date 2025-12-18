# MCP Client (AI SDK) - Debugger do MCP

Cliente CLI interativo para testar e depurar o servidor MCP (Model Context Protocol) do MinhaAgendaAI **rodando o mesmo tipo de loop de IA + tools** usado no webhook do WhatsApp.

- Conecta via **MCP STDIO** ao `packages/mcp-server/src/index.ts`
- Executa `generateText` (Vercel AI SDK) e imprime logs no mesmo estilo do webhook:
  - `🧾 Step finished` (finishReason, toolCalls, toolResults)
  - `🔧 Tool calls` (toolName, invalid, input, error)
  - `📊 Resultado` (totais somando `result.steps`)

## Instalação

Instale as dependências necessárias na raiz do projeto:

```bash
pnpm add -D @modelcontextprotocol/sdk tsx typescript
```

## Uso

### Execução Básica

Execute o cliente usando o script npm:

```bash
pnpm mcp:debug
```

Ou diretamente com tsx:

```bash
pnpm tsx scripts/mcp-client.ts
```

### Configuração do Servidor

Por padrão, o cliente executa o servidor usando:

```bash
pnpm tsx packages/mcp-server/src/index.ts
```

#### ⚠️ Importante: Sempre use tsx

O pacote `@repo/db` usa TypeScript e aponta para código fonte (`./src/index.ts`), não para versão compilada. Por isso, **sempre use `tsx` para executar o servidor**, mesmo que ele tenha sido "compilado".

**Por padrão, o cliente já usa `tsx`**, então você pode simplesmente executar:

```bash
pnpm mcp:debug
```

Se precisar especificar explicitamente:

```bash
pnpm mcp:debug --command tsx --args "packages/mcp-server/src/index.ts"
```

**Nota:** Não use `node` com a versão compilada (`dist/index.js`) porque o pacote `@repo/db` não está compilado e causará erros de importação.

#### Usando Variáveis de Ambiente (Alternativa)

Você também pode configurar usando variáveis de ambiente (sempre use `tsx`):

**Windows CMD:**
```cmd
set MCP_SERVER_COMMAND=tsx && set MCP_SERVER_ARGS=packages/mcp-server/src/index.ts && pnpm mcp:debug
```

**Windows PowerShell:**
```powershell
$env:MCP_SERVER_COMMAND="tsx"; $env:MCP_SERVER_ARGS="packages/mcp-server/src/index.ts"; pnpm mcp:debug
```

**Linux/Mac:**
```bash
MCP_SERVER_COMMAND="tsx" MCP_SERVER_ARGS="packages/mcp-server/src/index.ts" pnpm mcp:debug
```

#### Ajuda

Para ver todas as opções disponíveis:

```bash
pnpm mcp:debug --help
```

## Funcionalidades

1. **Conexão direta no MCP**: inicia o servidor MCP como processo filho e conecta via STDIO
2. **Chat com IA**: você digita mensagens e a IA chama tools do MCP quando necessário
3. **Logs detalhados (igual webhook)**: passos, tool calls, inválidos e resumo final
4. **Injeção de contexto**: o cliente injeta automaticamente `salonId` e `phone` nas tools quando possível (para você não precisar ficar passando isso toda hora)

## Variáveis de Ambiente úteis

- `MCP_SERVER_COMMAND`: comando do servidor (default: `node`)
- `MCP_SERVER_ARGS`: args do servidor (default: `--import,tsx,packages/mcp-server/src/index.ts`)
- `MCP_CLIENT_MODEL`: modelo primário (default: `gpt-5-mini`)
- `MCP_CLIENT_FALLBACK_MODEL`: fallback (default: `gpt-4o-mini`)

## Requisitos

- Node.js 18+
- pnpm (gerenciador de pacotes)
- Servidor MCP compilado ou código fonte do servidor

## Notas

- O cliente inicia o servidor MCP automaticamente como processo filho
- A comunicação é feita via STDIO (entrada/saída padrão)
- O cliente permanece ativo até que você digite `sair`

