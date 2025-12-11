# @repo/mcp-server

Servidor MCP (Model Context Protocol) para o sistema Minha Agenda AI.

Este servidor expõe tools que permitem que modelos de IA (como Claude, GPT-4, etc.) interajam com o sistema de agendamento, serviços, disponibilidade e CRM.

## 🛠️ Tools Disponíveis

### 1. `checkAvailability`
Verifica horários disponíveis para agendamento em um salão.

**Parâmetros:**
- `salonId` (obrigatório): UUID do salão
- `date` (obrigatório): Data em formato ISO 8601
- `professionalId` (opcional): UUID do profissional específico
- `serviceId` (opcional): UUID do serviço para obter duração
- `serviceDuration` (opcional): Duração em minutos (padrão: 60)

**Retorna:** Lista de slots disponíveis em formato ISO 8601

### 2. `createAppointment`
Cria um novo agendamento no sistema.

**Parâmetros:**
- `salonId` (obrigatório): UUID do salão
- `professionalId` (obrigatório): UUID do profissional
- `clientId` (obrigatório): UUID do cliente
- `serviceId` (obrigatório): UUID do serviço
- `date` (obrigatório): Data/hora do agendamento (ISO 8601)
- `notes` (opcional): Notas adicionais

**Retorna:** ID do agendamento criado

### 3. `cancelAppointment`
Cancela um agendamento existente.

**Parâmetros:**
- `appointmentId` (obrigatório): UUID do agendamento
- `reason` (opcional): Motivo do cancelamento

**Retorna:** Confirmação de cancelamento

### 4. `getServices`
Busca lista de serviços disponíveis em um salão.

**Parâmetros:**
- `salonId` (obrigatório): UUID do salão
- `includeInactive` (opcional): Incluir serviços inativos (padrão: false)

**Retorna:** Lista de serviços com preços e durações

### 5. `saveCustomerPreference`
Salva uma preferência do cliente no CRM.

**Parâmetros:**
- `salonId` (obrigatório): UUID do salão
- `customerId` (obrigatório): UUID do cliente
- `key` (obrigatório): Chave da preferência (ex: "allergic_to_ammonia")
- `value` (obrigatório): Valor (string, number, boolean, array ou object)

**Retorna:** Confirmação de salvamento

### 6. `qualifyLead`
Qualifica um lead baseado no interesse.

**Parâmetros:**
- `salonId` (obrigatório): UUID do salão
- `phoneNumber` (obrigatório): Número de telefone do lead
- `interest` (obrigatório): Nível de interesse ("high", "medium", "low", "none")
- `notes` (opcional): Notas adicionais

**Retorna:** Confirmação de qualificação

## 🚀 Instalação e Uso

### Desenvolvimento

```bash
# Instalar dependências
pnpm install

# Compilar TypeScript
pnpm build

# Modo watch (desenvolvimento)
pnpm dev
```

### Executar Servidor

```bash
pnpm start
```

O servidor usa **stdio** (entrada/saída padrão) para comunicação, que é o padrão do protocolo MCP.

## 🔧 Configuração no Cursor/Claude Desktop

Para usar este servidor MCP no Cursor ou Claude Desktop, adicione a seguinte configuração:

### Cursor

No arquivo de configuração do Cursor (geralmente `~/.cursor/mcp.json` ou similar):

```json
{
  "mcpServers": {
    "minhaagendaai": {
      "command": "node",
      "args": ["/caminho/absoluto/para/packages/mcp-server/dist/index.js"],
      "env": {
        "DATABASE_URL": "sua_database_url_aqui"
      }
    }
  }
}
```

### Claude Desktop

No arquivo de configuração do Claude Desktop:

```json
{
  "mcpServers": {
    "minhaagendaai": {
      "command": "node",
      "args": ["/caminho/absoluto/para/packages/mcp-server/dist/index.js"]
    }
  }
}
```

## 📋 Variáveis de Ambiente

O servidor precisa de acesso ao banco de dados. Configure as seguintes variáveis:

- `DATABASE_URL`: URL de conexão com o PostgreSQL (Supabase)

## 🏗️ Estrutura

```
packages/mcp-server/
├── src/
│   ├── schemas/          # Schemas Zod para validação
│   │   └── tools.schema.ts
│   ├── tools/            # Implementação das tools
│   │   ├── availability.tool.ts
│   │   ├── appointments.tool.ts
│   │   ├── services.tool.ts
│   │   ├── crm.tool.ts
│   │   └── index.ts
│   └── index.ts          # Ponto de entrada do servidor
├── dist/                 # Código compilado (gerado)
├── package.json
├── tsconfig.json
└── README.md
```

## 🔄 Integração com Google Calendar

As tools `createAppointment` e `cancelAppointment` têm TODOs para integração com Google Calendar. Quando implementado, essas tools irão:

1. Verificar se o profissional tem integração ativa
2. Criar/remover eventos no Google Calendar
3. Armazenar o `googleEventId` no banco de dados

## 📝 Notas

- Todas as tools validam entrada usando schemas Zod
- Erros são capturados e retornados de forma estruturada
- O servidor é stateless e pode ser escalado horizontalmente
- Comunicação via stdio é síncrona por requisição

## 🐛 Troubleshooting

### Erro de conexão com banco
Verifique se `DATABASE_URL` está configurada corretamente.

### Tool não encontrada
Certifique-se de que o servidor foi compilado (`pnpm build`) antes de executar.

### Erro de validação
As tools usam schemas Zod rigorosos. Verifique se todos os parâmetros obrigatórios estão sendo fornecidos e no formato correto (UUIDs, datas ISO, etc).

