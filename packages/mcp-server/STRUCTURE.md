# Estrutura do MCP Server

## 📁 Organização de Arquivos

```
packages/mcp-server/
├── src/
│   ├── schemas/
│   │   └── tools.schema.ts          # Schemas Zod para validação
│   ├── tools/
│   │   ├── availability.tool.ts     # Verificar disponibilidade
│   │   ├── appointments.tool.ts     # Criar/cancelar agendamentos
│   │   ├── services.tool.ts         # Buscar serviços
│   │   ├── crm.tool.ts              # CRM e preferências
│   │   └── index.ts                 # Registro de todas as tools
│   └── index.ts                     # Servidor MCP principal
├── dist/                            # Código compilado (gerado)
├── package.json
├── tsconfig.json
├── README.md                        # Documentação principal
├── MCP_CONFIG.md                    # Guia de configuração
└── STRUCTURE.md                     # Este arquivo
```

## 🔧 Fluxo de Execução

1. **Servidor inicia** (`src/index.ts`)
   - Cria instância do Server MCP
   - Configura capabilities
   - Conecta via stdio

2. **Tools são registradas** (`src/tools/index.ts`)
   - Registra handler `tools/list` (lista tools disponíveis)
   - Registra handler `tools/call` (executa tools)

3. **Validação** (`src/schemas/tools.schema.ts`)
   - Cada tool valida entrada com Zod
   - Erros são capturados e retornados

4. **Execução** (arquivos `*.tool.ts`)
   - Acessa banco via `@repo/db`
   - Executa lógica de negócio
   - Retorna resultado estruturado

## 🛠️ Tools Implementadas

### 1. checkAvailability
- **Arquivo**: `src/tools/availability.tool.ts`
- **Função**: Verifica horários disponíveis
- **Dependências**: `salons`, `appointments`, `services`

### 2. createAppointment
- **Arquivo**: `src/tools/appointments.tool.ts`
- **Função**: Cria novo agendamento
- **Dependências**: `appointments`, `services`, `professionals`, `profiles`

### 3. cancelAppointment
- **Arquivo**: `src/tools/appointments.tool.ts`
- **Função**: Cancela agendamento
- **Dependências**: `appointments`

### 4. getServices
- **Arquivo**: `src/tools/services.tool.ts`
- **Função**: Lista serviços do salão
- **Dependências**: `services`

### 5. saveCustomerPreference
- **Arquivo**: `src/tools/crm.tool.ts`
- **Função**: Salva preferência no CRM
- **Dependências**: `salonCustomers`

### 6. qualifyLead
- **Arquivo**: `src/tools/crm.tool.ts`
- **Função**: Qualifica lead
- **Dependências**: `leads` (TODO: implementar)

## 🔄 Próximos Passos

### Integração Google Calendar
- [ ] Implementar criação de eventos no `createAppointment`
- [ ] Implementar remoção de eventos no `cancelAppointment`
- [ ] Verificar tokens OAuth em `integrations`

### Melhorias
- [ ] Adicionar tool `getSalonInfo`
- [ ] Adicionar tool `getProfessionals`
- [ ] Implementar tool `updateAppointment`
- [ ] Adicionar cache para consultas frequentes

### Testes
- [ ] Criar testes unitários para cada tool
- [ ] Criar testes de integração
- [ ] Testar com diferentes clientes MCP

