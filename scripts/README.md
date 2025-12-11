# MCP Debugger Client

Cliente CLI interativo para testar e depurar as ferramentas do servidor MCP (Model Context Protocol) do MinhaAgendaAI.

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

1. **Lista de Ferramentas**: Ao iniciar, o cliente lista todas as ferramentas disponíveis no servidor MCP
2. **Menu Interativo**: Escolha qual ferramenta executar através de um menu numerado
3. **Entrada de Argumentos**: O cliente solicita os argumentos necessários para cada ferramenta
4. **Resultados Formatados**: Exibe os resultados de forma formatada e legível
5. **Tratamento de Erros**: Mostra erros de forma clara e colorida

## Exemplo de Uso

```
🔧 MCP Debugger Client
============================================================
ℹ Conectando ao servidor MCP...
✓ Conectado ao servidor MCP
ℹ Buscando ferramentas disponíveis...
✓ Encontradas 10 ferramenta(s)

============================================================
FERRAMENTAS DISPONÍVEIS
============================================================
1. checkAvailability
   Verifica horários disponíveis para agendamento em um salão...

2. createAppointment
   Cria um novo agendamento no sistema...

...

Escolha uma ferramenta (número): 1

============================================================
ARGUMENTOS PARA: checkAvailability
============================================================
Propriedades:
  (Obrigatórias estão marcadas com *)

   Data para verificar disponibilidade (ISO 8601)
salonId * [string (uuid)]: 123e4567-e89b-12d3-a456-426614174000
   ID do profissional (opcional)
professionalId [string (uuid)]: 
   Data para verificar disponibilidade (ISO 8601)
date * [string (date-time)]: 2024-01-15T10:00:00Z
...
```

## Requisitos

- Node.js 18+
- pnpm (gerenciador de pacotes)
- Servidor MCP compilado ou código fonte do servidor

## Notas

- O cliente inicia o servidor MCP automaticamente como processo filho
- A comunicação é feita via STDIO (entrada/saída padrão)
- O cliente permanece ativo até que você escolha a opção "0" para sair
- Todos os erros são exibidos de forma clara e colorida

