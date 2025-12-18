# ⚡ Teste Rápido - Google Calendar

## 🚀 Início Rápido (5 minutos)

### 1. Configurar Google OAuth (2 min)

1. Acesse [Google Cloud Console](https://console.cloud.google.com/)
2. Crie credenciais OAuth 2.0 (Web application)
3. Adicione redirect URI: `http://localhost:3000/api/google/callback`
4. Copie Client ID e Client Secret

### 2. Configurar .env (1 min)

```env
GOOGLE_CLIENT_ID=seu_client_id
GOOGLE_CLIENT_SECRET=seu_client_secret
GOOGLE_REDIRECT_URI=http://localhost:3000/api/google/callback
GOOGLE_TIMEZONE=America/Sao_Paulo
```

### 3. Executar Migração (30 seg)

```bash
pnpm db:push
```

### 4. Instalar Dependências (30 seg)

```bash
pnpm install
```

### 5. Conectar Google Calendar (1 min)

1. Inicie o servidor: `pnpm dev`
2. Faça login no sistema
3. Acesse: `http://localhost:3000/api/google/auth`
4. Autorize o acesso

### 6. Testar Criação de Evento (30 seg)

Crie um agendamento pelo sistema e verifique:
- ✅ Logs do servidor (sem erros)
- ✅ Google Calendar (evento aparece)
- ✅ Banco de dados (`google_event_id` preenchido)

---

## 🧪 Teste Programático

Se você já tem um agendamento criado:

```bash
pnpm test:google <appointment-id>
```

Exemplo:
```bash
pnpm test:google 123e4567-e89b-12d3-a456-426614174000
```

---

## ✅ Checklist Mínimo

- [ ] OAuth configurado no Google Cloud
- [ ] Variáveis de ambiente no `.env`
- [ ] Migração executada (`pnpm db:push`)
- [ ] Dependências instaladas (`pnpm install`)
- [ ] Google Calendar conectado (`/api/google/auth`)
- [ ] Agendamento criado e sincronizado

---

## 📖 Documentação Completa

Veja `GOOGLE_CALENDAR_TEST.md` para guia detalhado com troubleshooting.

