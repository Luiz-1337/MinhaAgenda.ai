# WhatsApp Webhook - Documentação

## Visão Geral

O sistema de webhook do WhatsApp foi refatorado para ser **production-ready** com as seguintes características:

- **Resposta rápida**: Webhook responde em < 500ms
- **Processamento assíncrono**: Mensagens são enfileiradas e processadas por workers
- **Idempotência**: Mensagens duplicadas são detectadas e ignoradas
- **Rate limiting**: Proteção contra abuso (10 msgs/min por telefone) - verificado ANTES de enfileirar
- **Timeouts**: Todas as operações assíncronas têm timeout configurável
- **Proteção contra race conditions**: findOrCreate usa INSERT ON CONFLICT
- **Health check**: Endpoint para monitoramento de saúde
- **Métricas**: Sistema de observabilidade integrado
- **Logging estruturado**: Logs com sanitização de PII
- **Tratamento de erros**: Retry automático com backoff exponencial

## Arquitetura

```
┌─────────────────────────────────────────────────────────────┐
│ 1. WEBHOOK ENDPOINT (< 500ms)                               │
│    - Validar assinatura Twilio (SEM bypass em prod)        │
│    - Validar schema com Zod                                 │
│    - Verificar idempotência (Redis: twilio:{MessageSid})   │
│    - Salvar mensagem raw no DB                              │
│    - Enfileirar job no BullMQ                               │
│    - Retornar 200 OK imediatamente                          │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ 2. WORKER ASSÍNCRONO (sem limite de tempo)                  │
│    - Processar fila BullMQ (10 jobs simultâneos)           │
│    - Rate limiting (10 msgs/min por telefone)               │
│    - Lock distribuído por chat (Redis: lock:chat:{id})     │
│    - Verificar modo manual → notificar humano e sair        │
│    - Gerar resposta com AI (uma única chamada)              │
│    - Enviar via WhatsApp                                     │
│    - Salvar resposta no DB                                   │
│    - Tratar erros com retry strategy                         │
└─────────────────────────────────────────────────────────────┘
```

## Configuração

### Variáveis de Ambiente

```env
# Redis (obrigatório para filas e cache)
REDIS_URL=redis://localhost:6379

# Twilio
TWILIO_ACCOUNT_SID=your_account_sid
TWILIO_AUTH_TOKEN=your_auth_token
TWILIO_SKIP_VALIDATION=false  # usar apenas em desenvolvimento

# Rate Limiting
RATE_LIMIT_MESSAGES_PER_MINUTE=10
RATE_LIMIT_SALON_PER_MINUTE=100

# Logging
LOG_LEVEL=info  # debug | info | warn | error
```

### Instalação do Redis

#### Local (Docker)

```bash
docker run -d --name redis -p 6379:6379 redis:alpine
```

#### Produção (Upstash/Redis Cloud)

Recomendamos usar um serviço gerenciado como:
- [Upstash](https://upstash.com/) - Serverless Redis
- [Redis Cloud](https://redis.com/cloud/)

Configure a variável `REDIS_URL` com a connection string fornecida.

## Executando

### Desenvolvimento

```bash
# Terminal 1: Next.js
pnpm dev

# Terminal 2: Worker
pnpm --filter web worker:dev
```

### Produção

```bash
# Build
pnpm build

# Iniciar Next.js
pnpm start

# Iniciar Worker (em processo separado)
pnpm --filter web worker
```

## Monitoramento

### Health Check

```bash
# Verificação básica
curl http://localhost:3000/api/webhook/whatsapp/health

# Com métricas
curl "http://localhost:3000/api/webhook/whatsapp/health?metrics=true"

# Verificação rápida (HEAD)
curl -I http://localhost:3000/api/webhook/whatsapp/health
```

Resposta do health check:

```json
{
  "status": "healthy",
  "timestamp": "2024-01-27T10:00:00.000Z",
  "uptime": 3600,
  "checks": {
    "redis": {
      "status": "pass",
      "latencyMs": 5
    },
    "queue": {
      "status": "pass",
      "latencyMs": 10,
      "details": {
        "waiting": 5,
        "active": 2,
        "completed": 1000,
        "failed": 3
      }
    }
  }
}
```

### Métricas da Fila

```typescript
import { getQueueStats } from "@/lib/queues/message-queue";

const stats = await getQueueStats();
console.log(stats);
// {
//   waiting: 5,
//   active: 2,
//   completed: 1000,
//   failed: 3,
//   delayed: 0,
//   paused: 0
// }
```

### Sistema de Métricas

```typescript
import { WebhookMetrics, WorkerMetrics, getMetricsSummary } from "@/lib/metrics";

// Métricas são registradas automaticamente pelo webhook
// Mas podem ser usadas manualmente:
WebhookMetrics.received();
WebhookMetrics.enqueued({ salonId: "..." });
WebhookMetrics.rateLimited({ phone: "..." });
WebhookMetrics.error("error_code");
WebhookMetrics.latency(45);

// Obter resumo das métricas
const summary = await getMetricsSummary();
```

### Logs Estruturados

Os logs são emitidos em formato JSON (produção) ou pretty-printed (desenvolvimento):

```json
{
  "level": "info",
  "time": 1706000000000,
  "service": "whatsapp-webhook",
  "requestId": "req-abc123",
  "messageId": "MM123...",
  "chatId": "uuid",
  "salonId": "uuid",
  "duration": 45,
  "msg": "Message enqueued successfully"
}
```

### Campos Sensíveis (PII)

Os seguintes campos são automaticamente redactados nos logs:
- Telefones (`From`, `To`, `phone`, `clientPhone`)
- Conteúdo de mensagens (`Body`, `body`, `content`)
- Headers de autenticação

## API

### Webhook Endpoint

`POST /api/webhook/whatsapp`

Headers:
- `Content-Type`: `application/x-www-form-urlencoded`
- `X-Twilio-Signature`: Assinatura do Twilio (obrigatório em produção)

Body (form-encoded):
- `From`: Número do remetente (`whatsapp:+5511999999999`)
- `To`: Número do destinatário (`whatsapp:+5511888888888`)
- `Body`: Conteúdo da mensagem
- `MessageSid`: ID único da mensagem
- `NumMedia`: Número de itens de mídia
- `MediaUrl0`, `MediaContentType0`: URL e tipo da mídia

Respostas:
- `200 OK`: Mensagem recebida (mesmo em caso de erro não-retryable)
- `400 Bad Request`: Content-Type ou schema inválido
- `401 Unauthorized`: Assinatura inválida
- `500 Internal Server Error`: Erro retryable (Twilio vai retentar)

## Estrutura de Arquivos

```
apps/web/
├── app/api/webhook/whatsapp/
│   ├── route.ts              # Endpoint principal
│   └── health/
│       └── route.ts          # Health check endpoint
├── lib/
│   ├── redis.ts              # Cliente Redis + helpers
│   ├── logger.ts             # Logger estruturado (Pino)
│   ├── errors.ts             # Classes de erro customizadas
│   ├── rate-limit.ts         # Rate limiting
│   ├── metrics.ts            # Sistema de métricas
│   ├── queues/
│   │   └── message-queue.ts  # Fila BullMQ
│   ├── schemas/
│   │   └── twilio.ts         # Schemas Zod
│   ├── utils/
│   │   └── async.utils.ts    # withTimeout, withRetry, etc.
│   └── services/ai/
│       └── generate-response.service.ts  # Geração de resposta AI
├── workers/
│   └── message-processor.ts  # Worker de processamento
├── docs/
│   └── WHATSAPP_WEBHOOK.md   # Esta documentação
└── __tests__/api/webhooks/
    └── whatsapp.test.ts      # Testes
```

## Troubleshooting

### Mensagens não estão sendo processadas

1. Verifique se o Redis está rodando:
   ```bash
   redis-cli ping
   ```

2. Verifique se o worker está rodando:
   ```bash
   pnpm --filter web worker:dev
   ```

3. Verifique os logs do worker para erros

### Rate limit muito restritivo

Ajuste as variáveis de ambiente:
```env
RATE_LIMIT_MESSAGES_PER_MINUTE=20
```

### Assinatura Twilio inválida

1. Verifique se `TWILIO_AUTH_TOKEN` está correto
2. Verifique se a URL do webhook no Twilio está correta
3. Em desenvolvimento, use `TWILIO_SKIP_VALIDATION=true`

### Jobs falhando repetidamente

1. Verifique os logs do worker
2. Verifique métricas da fila com `getQueueStats()`
3. Verifique se há locks travados no Redis

### Timeouts frequentes

Os timeouts padrão são:
- Operações de banco: 5 segundos
- Operações Redis: 2 segundos

Se estiver tendo timeouts frequentes:

1. Verifique a latência do banco de dados
2. Verifique a latência do Redis
3. Ajuste os timeouts se necessário (no código do webhook)

### Race conditions em findOrCreate

O sistema usa `INSERT ... ON CONFLICT DO NOTHING` para prevenir race conditions. 
Se ainda estiver tendo problemas:

1. Verifique se há índices únicos corretos nas tabelas
2. Verifique os logs para mensagens de "Race condition detected"

## Testes

```bash
# Rodar todos os testes
pnpm --filter web test

# Rodar em modo watch
pnpm --filter web test:watch

# Com cobertura
pnpm --filter web test:coverage
```

## Migrando do Sistema Antigo

O novo sistema é compatível com o antigo. Para migrar:

1. Configure o Redis
2. Instale as novas dependências: `pnpm install`
3. Inicie o worker em paralelo ao Next.js
4. Atualize as variáveis de ambiente
5. Deploy

O webhook continuará funcionando durante a migração, apenas com processamento mais rápido.
