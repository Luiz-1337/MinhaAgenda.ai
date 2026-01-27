# E2E Tests - WhatsApp Webhook

Este diretório contém os testes end-to-end (E2E) para o webhook do WhatsApp usando Playwright.

## Estrutura

```
e2e/
├── playwright.config.ts      # Configuração do Playwright
├── global-setup.ts           # Setup global (mocks, DB)
├── global-teardown.ts        # Cleanup
├── fixtures/
│   ├── test-fixtures.ts      # Fixtures customizadas
│   ├── twilio-payloads.ts    # Payloads de teste do Twilio
│   └── openai-responses.ts   # Respostas mock do OpenAI
├── mocks/
│   ├── mock-servers.ts       # Orquestrador de mock servers
│   ├── twilio-mock-server.ts # Mock HTTP server para Twilio
│   ├── openai-mock-server.ts # Mock HTTP server para OpenAI
│   └── redis-test-utils.ts   # Utilitários Redis para testes
├── utils/
│   ├── db-helpers.ts         # Helpers para seed/cleanup DB
│   ├── webhook-helpers.ts    # Helpers para chamar webhook
│   └── assertions.ts         # Assertions customizadas
└── tests/
    ├── webhook/
    │   ├── validation.spec.ts    # Testes de validação
    │   ├── idempotency.spec.ts   # Testes de idempotência
    │   ├── rate-limiting.spec.ts # Testes de rate limit
    │   └── enqueue.spec.ts       # Testes de enfileiramento
    ├── worker/
    │   ├── processing.spec.ts    # Testes de processamento
    │   ├── ai-response.spec.ts   # Testes de geração IA
    │   └── error-handling.spec.ts# Testes de tratamento de erros
    ├── integration/
    │   ├── full-flow.spec.ts     # Fluxo completo
    │   ├── manual-mode.spec.ts   # Modo manual
    │   └── media-handling.spec.ts# Tratamento de mídia
    └── health/
        └── health-check.spec.ts  # Testes do health check
```

## Executando os Testes

### Pré-requisitos

1. Redis rodando na porta 6379
2. Dependências instaladas (`pnpm install`)
3. Variáveis de ambiente configuradas (`.env.test`)

### Comandos

```bash
# Executar todos os testes E2E
pnpm test:e2e

# Executar com interface gráfica
pnpm test:e2e:ui

# Executar em modo debug
pnpm test:e2e:debug

# Executar com navegador visível
pnpm test:e2e:headed

# Ver relatório de testes
pnpm test:e2e:report
```

### Executar Testes Específicos

```bash
# Apenas testes de webhook
pnpm test:e2e -- --grep "Webhook"

# Apenas testes de worker
pnpm test:e2e -- --grep "Worker"

# Apenas testes de integração
pnpm test:e2e -- --grep "Integration"

# Um arquivo específico
pnpm test:e2e -- tests/webhook/validation.spec.ts
```

## Configuração

### Variáveis de Ambiente

Copie `.env.test` para `.env.test.local` e configure:

```env
DATABASE_URL=postgresql://...
REDIS_URL=redis://localhost:6379/15
TWILIO_SKIP_VALIDATION=true
```

### Mock Servers

Os testes usam mock servers para Twilio e OpenAI:

- **Twilio Mock** (porta 3001): Intercepta chamadas de envio de mensagem
- **OpenAI Mock** (porta 3002): Simula respostas de chat completions

### Fixtures

As fixtures fornecem dados de teste reutilizáveis:

```typescript
import { test, expect } from '../fixtures/test-fixtures';

test('example', async ({ 
  webhookClient,  // Cliente para chamar webhook
  twilioMock,     // Mock do Twilio
  openaiMock,     // Mock do OpenAI
  testSalon,      // Salão de teste
  testCustomer,   // Cliente de teste
}) => {
  // ...
});
```

## Escrevendo Novos Testes

### Estrutura Básica

```typescript
import { test, expect } from '../../fixtures/test-fixtures';
import { createTwilioPayload, TestPhones } from '../../fixtures/twilio-payloads';
import { AIResponses } from '../../fixtures/openai-responses';

test.describe('My Test Suite', () => {
  test('should do something', async ({
    webhookClient,
    twilioMock,
    openaiMock,
    testSalon,
  }) => {
    // 1. Setup: configurar mock responses
    openaiMock.setNextResponse(AIResponses.greeting());

    // 2. Act: enviar webhook
    const payload = createTwilioPayload({
      from: TestPhones.customer,
      to: `whatsapp:${testSalon.whatsappNumber}`,
      body: 'Test message',
    });
    
    const response = await webhookClient.postWebhook(payload);

    // 3. Assert: verificar resultado
    expect(response.status()).toBe(200);
  });
});
```

### Helpers Úteis

```typescript
import { 
  assertWebhookSuccess,
  assertTwilioWasCalled,
  assertOpenAIWasCalled,
  waitForCondition,
} from '../../utils/assertions';

// Aguardar processamento assíncrono
await waitForCondition(
  async () => twilioMock.getCallCount() > 0,
  10000 // timeout em ms
);

// Verificar chamadas
assertTwilioWasCalled(twilioMock, expectedPhone, expectedBodyContains);
assertOpenAIWasCalled(openaiMock);
```

## CI/CD

Os testes E2E são executados automaticamente no GitHub Actions:

- Em push para `main` ou `develop`
- Em pull requests

O workflow está em `.github/workflows/e2e-tests.yml`.

## Troubleshooting

### Testes falham por timeout

1. Verifique se o Redis está rodando
2. Aumente o timeout no `playwright.config.ts`
3. Verifique se o servidor Next.js está iniciando corretamente

### Mock servers não iniciam

1. Verifique se as portas 3001 e 3002 estão livres
2. Verifique logs do global-setup.ts

### Mensagens não são processadas

1. Verifique se o worker está rodando (em ambiente de CI)
2. Verifique os logs do worker
3. Verifique se há locks travados no Redis

## Manutenção

### Atualizar Payloads

Edite `fixtures/twilio-payloads.ts` para adicionar novos formatos de mensagem.

### Atualizar Respostas AI

Edite `fixtures/openai-responses.ts` para adicionar novos templates de resposta.

### Adicionar Novos Helpers

Edite `utils/` para adicionar novos helpers de teste.
