# 🧪 Guia de Teste - Integração Google Calendar

Este guia explica como testar toda a integração com Google Calendar passo a passo.

## 📋 Pré-requisitos

1. **Conta Google** com acesso ao Google Cloud Console
2. **Banco de dados PostgreSQL** configurado e rodando
3. **Node.js e pnpm** instalados
4. **Variáveis de ambiente** configuradas

---

## 🔧 Passo 1: Configurar Google Cloud Console

### 1.1 Criar Projeto no Google Cloud

1. Acesse [Google Cloud Console](https://console.cloud.google.com/)
2. Crie um novo projeto ou selecione um existente
3. Anote o **Project ID**

### 1.2 Habilitar Google Calendar API

1. No menu lateral, vá em **APIs & Services** > **Library**
2. Busque por **"Google Calendar API"**
3. Clique em **Enable**

### 1.3 Criar Credenciais OAuth 2.0

1. Vá em **APIs & Services** > **Credentials**
2. Clique em **Create Credentials** > **OAuth client ID**
3. Se for a primeira vez, configure a **OAuth consent screen**:
   - Escolha **External** (para desenvolvimento)
   - Preencha: App name, User support email, Developer contact
   - Adicione scopes: `calendar`, `calendar.events`
   - Adicione test users (seu email)
   - Salve e continue

4. Crie o **OAuth client ID**:
   - Application type: **Web application**
   - Name: `Minha Agenda AI - Web`
   - **Authorized redirect URIs**: 
     ```
     http://localhost:3000/api/google/callback
     https://seu-dominio.com/api/google/callback
     ```
   - Clique em **Create**

5. **Copie** o **Client ID** e **Client Secret** gerados

---

## 🔐 Passo 2: Configurar Variáveis de Ambiente

Adicione as seguintes variáveis no arquivo `.env` na raiz do projeto:

```env
# Google OAuth
GOOGLE_CLIENT_ID=seu_client_id_aqui
GOOGLE_CLIENT_SECRET=seu_client_secret_aqui
GOOGLE_REDIRECT_URI=http://localhost:3000/api/google/callback
GOOGLE_TIMEZONE=America/Sao_Paulo

# App URL (opcional, usado para redirect)
NEXT_PUBLIC_APP_URL=http://localhost:3000

# Database (já deve estar configurado)
DATABASE_URL=postgresql://user:password@host:port/database
```

---

## 🗄️ Passo 3: Executar Migração do Banco

Execute a migração para criar a tabela `salon_integrations`:

```bash
# Na raiz do projeto
cd packages/db
pnpm generate  # Já foi executado, mas pode rodar novamente se necessário
pnpm push       # Aplica as mudanças no banco (ou use migrate:manual)
```

**OU** se preferir aplicar manualmente:

```bash
# Verifique o arquivo gerado em packages/db/drizzle/0005_jazzy_barracuda.sql
# E execute-o no seu banco de dados
```

---

## 📦 Passo 4: Instalar Dependências

```bash
# Na raiz do projeto
pnpm install
```

Isso instalará:
- `googleapis` e `google-auth-library` no `apps/web`
- `googleapis` e `google-auth-library` no `packages/mcp-server`

---

## 🚀 Passo 5: Iniciar o Servidor

```bash
# Na raiz do projeto
cd apps/web
pnpm dev
```

O servidor estará rodando em `http://localhost:3000`

---

## ✅ Passo 6: Testar o Fluxo Completo

### 6.1 Testar Autenticação OAuth

1. **Faça login** no sistema (se necessário, crie uma conta)
2. **Acesse** a URL de autenticação:
   ```
   http://localhost:3000/api/google/auth
   ```
3. Você será redirecionado para o Google
4. **Autorize** o acesso ao Google Calendar
5. Você será redirecionado de volta para `/dashboard?success=...`

### 6.2 Verificar Integração no Banco

Verifique se os tokens foram salvos:

```sql
SELECT * FROM salon_integrations;
```

Você deve ver:
- `salon_id`: ID do seu salão
- `provider`: 'google'
- `refresh_token`: token de refresh
- `access_token`: token de acesso
- `email`: email da conta Google conectada
- `expires_at`: timestamp de expiração

### 6.3 Testar Criação de Agendamento

#### Opção A: Via Interface Web (se houver)

1. Crie um agendamento através da interface
2. Verifique os logs do servidor para ver se o evento foi criado no Google Calendar
3. Acesse seu Google Calendar e verifique se o evento apareceu

#### Opção B: Via API/Chat (MCP Server)

Se você tem o chat configurado, teste criando um agendamento via chat e verifique se sincroniza.

#### Opção C: Teste Direto (via código)

Você pode criar um script de teste ou usar o console do Node.js:

```typescript
import { createGoogleEvent } from '@/lib/google'

// Use um appointmentId existente
const result = await createGoogleEvent('appointment-id-aqui')
console.log(result)
```

### 6.4 Verificar Evento no Google Calendar

1. Acesse [Google Calendar](https://calendar.google.com)
2. Verifique se o evento foi criado com:
   - **Título**: `[Nome do Profissional] Nome do Serviço - Nome do Cliente`
   - **Data/Hora**: corretas
   - **Attendee**: email do profissional (se cadastrado)
   - **Descrição**: informações do serviço e cliente

### 6.5 Verificar no Banco de Dados

Após criar um agendamento, verifique se o `google_event_id` foi salvo:

```sql
SELECT id, google_event_id, date, status 
FROM appointments 
WHERE google_event_id IS NOT NULL;
```

---

## 🐛 Troubleshooting

### Erro: "GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET devem estar configurados"

- Verifique se as variáveis estão no `.env` na raiz do projeto
- Reinicie o servidor após adicionar as variáveis

### Erro: "Redirect URI mismatch"

- Verifique se o `GOOGLE_REDIRECT_URI` no `.env` está **exatamente igual** ao configurado no Google Cloud Console
- Certifique-se de incluir `http://` ou `https://` conforme necessário

### Erro: "Refresh token não fornecido"

- Na primeira autorização, o Google pode não fornecer refresh_token se você já autorizou antes
- **Solução**: Revogue o acesso em [Google Account Settings](https://myaccount.google.com/permissions) e autorize novamente
- Certifique-se de usar `prompt: 'consent'` na URL de auth (já está configurado)

### Evento não aparece no Google Calendar

1. Verifique os logs do servidor para erros
2. Verifique se a integração está salva no banco:
   ```sql
   SELECT * FROM salon_integrations WHERE salon_id = 'seu-salon-id';
   ```
3. Verifique se o `google_event_id` foi salvo no agendamento
4. Verifique se o token não expirou (a função faz refresh automático)

### Erro ao fazer refresh do token

- Verifique se o `refresh_token` está salvo corretamente no banco
- Verifique se as credenciais OAuth estão corretas
- Tente desconectar e reconectar a integração

---

## 📝 Checklist de Teste

- [ ] Migração do banco executada com sucesso
- [ ] Dependências instaladas
- [ ] Variáveis de ambiente configuradas
- [ ] OAuth configurado no Google Cloud Console
- [ ] Autenticação OAuth funcionando (redirecionamento)
- [ ] Tokens salvos no banco (`salon_integrations`)
- [ ] Criação de agendamento sincroniza com Google Calendar
- [ ] Evento aparece no Google Calendar com formato correto
- [ ] `google_event_id` salvo no agendamento
- [ ] Profissional recebe convite (se tiver email cadastrado)
- [ ] Erros do Google não bloqueiam criação de agendamento

---

## 🔍 Verificações Adicionais

### Testar Refresh Automático de Token

1. Aguarde o token expirar (ou modifique `expires_at` no banco para um valor passado)
2. Crie um novo agendamento
3. Verifique os logs - deve fazer refresh automaticamente
4. Verifique se o novo `access_token` e `expires_at` foram atualizados no banco

### Testar Múltiplos Salões

Se você tem múltiplos salões:
1. Conecte cada salão a uma conta Google diferente
2. Crie agendamentos em cada salão
3. Verifique se os eventos aparecem nos calendários corretos

---

## 📚 Próximos Passos

Após validar que tudo está funcionando:

1. **Cancelamento**: Implementar remoção de eventos quando agendamento é cancelado
2. **Atualização**: Implementar atualização de eventos quando agendamento é modificado
3. **Sincronização bidirecional**: Sincronizar eventos criados diretamente no Google Calendar para o sistema
4. **Notificações**: Configurar webhooks do Google para receber atualizações em tempo real

---

## 💡 Dicas

- Use o **Drizzle Studio** para visualizar o banco:
  ```bash
  cd packages/db
  pnpm studio
  ```

- Monitore os logs do servidor durante os testes para identificar problemas

- Use o **Google Calendar API Explorer** para testar chamadas diretamente:
  https://developers.google.com/calendar/api/v3/reference

- Para desenvolvimento, você pode usar contas de teste no OAuth consent screen

---

## 🆘 Suporte

Se encontrar problemas:
1. Verifique os logs do servidor
2. Verifique os logs do navegador (Console)
3. Verifique o banco de dados diretamente
4. Teste as credenciais OAuth no Google Cloud Console

