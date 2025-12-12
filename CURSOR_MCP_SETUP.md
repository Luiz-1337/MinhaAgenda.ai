# 🚀 Guia de Configuração do MCP no Cursor

## 📍 Localização do Arquivo de Configuração

No **Windows**, o arquivo de configuração do MCP do Cursor está localizado em:

```
C:\Users\SEU_USUARIO\AppData\Roaming\Cursor\mcp.json
```

Ou usando variável de ambiente:
```
%APPDATA%\Cursor\mcp.json
```

## ⚙️ Configuração

### Opção 1: Usando tsx (Recomendado - Não precisa compilar)

Esta é a forma mais simples, pois executa o TypeScript diretamente:

1. **Abra ou crie o arquivo** `mcp.json` no caminho acima
2. **Cole a seguinte configuração**:

```json
{
  "mcpServers": {
    "minhaagendaai": {
      "command": "npx",
      "args": [
        "-y",
        "tsx",
        "E:/minhaagendaai_v2/packages/mcp-server/src/index.ts"
      ],
      "env": {
        "DATABASE_URL": "postgresql://usuario:senha@host:porta/database"
      }
    }
  }
}
```

3. **Substitua** `DATABASE_URL` pela sua URL real do Supabase/PostgreSQL:
   - Formato: `postgresql://usuario:senha@host:porta/database`
   - Exemplo Supabase: `postgresql://postgres:SuaSenha@seuprojeto.supabase.co:5432/postgres`

### Opção 2: Usando versão compilada

Se preferir compilar primeiro:

1. **Compile o servidor**:
   ```bash
   pnpm mcp:build
   ```

2. **Use esta configuração**:
```json
{
  "mcpServers": {
    "minhaagendaai": {
      "command": "node",
      "args": [
        "E:/minhaagendaai_v2/packages/mcp-server/dist/index.js"
      ],
      "env": {
        "DATABASE_URL": "postgresql://usuario:senha@host:porta/database"
      }
    }
  }
}
```

## 🔄 Próximos Passos

1. **Salve o arquivo** `mcp.json`
2. **Reinicie o Cursor** completamente (feche e abra novamente)
3. **Verifique se funcionou**: O MCP deve aparecer na lista de recursos disponíveis no Cursor

## ✅ Verificando se Funcionou

Após reiniciar o Cursor, você pode verificar se o MCP está funcionando:

- O servidor MCP `minhaagendaai` deve aparecer na lista de servidores MCP
- As tools devem estar disponíveis (checkAvailability, createAppointment, etc.)
- Você pode usar comandos que interagem com o banco de dados

## 🛠️ Tools Disponíveis

Depois de configurado, você terá acesso a estas tools do MCP:

- `checkAvailability` - Verificar horários disponíveis
- `createAppointment` - Criar agendamento
- `cancelAppointment` - Cancelar agendamento
- `rescheduleAppointment` - Reagendar agendamento
- `getServices` - Listar serviços do salão
- `getProfessionals` - Listar profissionais
- `getSalonDetails` - Detalhes do salão
- `saveCustomerPreference` - Salvar preferências do cliente
- `getConversationHistory` - Histórico de conversas
- `qualifyLead` - Qualificar lead
- `getCustomerUpcomingAppointments` - Próximos agendamentos do cliente

## 🐛 Troubleshooting

### Erro: "Cannot find module"
- Certifique-se de que executou `pnpm install` na raiz do projeto
- Verifique se o caminho do arquivo está correto (use barras `/` ou duplas `\\`)

### Erro de conexão com banco
- Verifique se a `DATABASE_URL` está correta
- Teste a conexão do banco separadamente

### MCP não aparece no Cursor
- Reinicie o Cursor completamente
- Verifique se o arquivo `mcp.json` está no local correto
- Verifique os logs do Cursor para erros

### Erro de permissão no PowerShell
Se encontrar erro de política de execução:
```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```













