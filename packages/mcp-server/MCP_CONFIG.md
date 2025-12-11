# Configuração do MCP Server

## Configuração no Cursor

Adicione ao arquivo de configuração do Cursor (geralmente em `~/.cursor/mcp.json` ou nas configurações do Cursor):

```json
{
  "mcpServers": {
    "minhaagendaai": {
      "command": "npx",
      "args": ["-y", "tsx", "E:/minhaagendaai_v2/packages/mcp-server/src/index.ts"],
      "env": {
        "DATABASE_URL": "postgresql://user:password@host:port/database"
      }
    }
  }
}
```

**Nota:** 
- Ajuste o caminho absoluto conforme sua instalação.
- Usamos `tsx` para executar TypeScript diretamente, sem necessidade de compilar.
- Alternativamente, você pode compilar o servidor e usar `node` com `dist/index.js`.

## Configuração no Claude Desktop

No arquivo de configuração do Claude Desktop (geralmente em `~/Library/Application Support/Claude/claude_desktop_config.json` no macOS ou `%APPDATA%/Claude/claude_desktop_config.json` no Windows):

```json
{
  "mcpServers": {
    "minhaagendaai": {
      "command": "npx",
      "args": ["-y", "tsx", "E:/minhaagendaai_v2/packages/mcp-server/src/index.ts"],
      "env": {
        "DATABASE_URL": "postgresql://user:password@host:port/database"
      }
    }
  }
}
```

## Variáveis de Ambiente

O servidor MCP precisa das seguintes variáveis de ambiente:

- `DATABASE_URL`: URL de conexão com o PostgreSQL (Supabase)
  - Formato: `postgresql://user:password@host:port/database`
  - Exemplo Supabase: `postgresql://postgres:[PASSWORD]@[PROJECT].supabase.co:5432/postgres`

## Build e Execução

### Opção 1: Usar tsx (Recomendado - não precisa compilar)

O servidor pode ser executado diretamente com `tsx`, sem necessidade de compilação:

```bash
# Instalar dependências (se ainda não instalou)
pnpm install
```

### Opção 2: Compilar antes de usar

Se preferir compilar:

```bash
# Na raiz do projeto
pnpm mcp:build

# Ou diretamente no pacote
cd packages/mcp-server
pnpm build
```

E use `node` em vez de `tsx` na configuração:
```json
{
  "mcpServers": {
    "minhaagendaai": {
      "command": "node",
      "args": ["E:/minhaagendaai_v2/packages/mcp-server/dist/index.js"],
      ...
    }
  }
}
```

## Testando a Conexão

Após configurar, reinicie o Cursor/Claude Desktop. O servidor MCP deve aparecer na lista de servidores disponíveis e as tools devem estar acessíveis.

