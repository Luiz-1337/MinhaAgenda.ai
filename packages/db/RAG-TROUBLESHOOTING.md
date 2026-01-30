# RAG Troubleshooting Guide

Este guia ajuda a diagnosticar e resolver problemas com o RAG (Retrieval-Augmented Generation).

## 🔍 Diagnóstico Rápido

Execute o script de verificação:

```bash
cd packages/db
pnpm check:rag
```

Este script verifica:
- ✅ Extensão pgvector instalada
- ✅ Tabela agent_knowledge_base existe
- ✅ Conhecimento cadastrado
- ✅ Embeddings corretos (1536 dimensões)
- ✅ Queries de similaridade funcionando

## ⚙️ Configurações do RAG

Configure no arquivo `.env.local`:

```bash
# Threshold de similaridade (0.0 a 1.0)
RAG_SIMILARITY_THRESHOLD=0.65  # Padrão: 0.65 (65%)

# Número máximo de itens retornados
RAG_MAX_RESULTS=5  # Padrão: 5 itens
```

### **RAG_SIMILARITY_THRESHOLD**

Filtra resultados por similaridade mínima:

**Valores recomendados:**
- `0.5` - Muito permissivo (retorna quase tudo)
- `0.65` - **Recomendado** - Bom equilíbrio entre precisão e recall
- `0.7` - Threshold conservador (apenas matches muito relevantes)
- `0.8` - Muito restritivo (pode não encontrar nada)

### **RAG_MAX_RESULTS**

Define quantos itens de conhecimento serão retornados (ordenados por similaridade):

**Valores recomendados:**
- `3` - Poucos itens, contexto focado
- `5` - **Recomendado** - Bom equilíbrio
- `10` - Muito contexto (cuidado com tokens)
- `20+` - Pode exceder limite de tokens do modelo

**Observação:** Mais itens = mais tokens consumidos no prompt

**Como testar similaridade real:**
```bash
cd packages/db
node scripts/test-embedding-similarity.mjs
```

Este script mostra a % de similaridade da sua query com o conhecimento cadastrado.

---

## ❌ Problemas Comuns

### 1. Erro: "type vector does not exist"

**Causa:** Extensão pgvector não instalada no banco de dados.

**Solução:**
```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

Ou execute manualmente o script:
```bash
psql $DATABASE_URL -f packages/db/scripts/install-pgvector.sql
```

---

### 2. RAG não retorna resultados

**Possíveis causas:**

#### a) Nenhum conhecimento cadastrado
- Verifique se há itens na tabela `agent_knowledge_base`
- Acesse a interface do agente e adicione conhecimento

#### b) Threshold de similaridade muito alto
- Threshold padrão: 0.7 (70% de similaridade)
- Itens com similaridade < 0.7 não são retornados
- Verifique nos logs: "No relevant RAG context found"

#### c) Cache desatualizado
- Cache do AgentInfoService tem TTL de 60 segundos
- Se você acabou de adicionar conhecimento, aguarde até 60s
- Ou reinicie o servidor para limpar o cache

**Como verificar:**
```sql
-- Ver conhecimento de um agente
SELECT id, content, metadata, created_at
FROM agent_knowledge_base
WHERE agent_id = 'seu-agent-id'
ORDER BY created_at DESC;

-- Ver total de itens por agente
SELECT agent_id, COUNT(*) as total
FROM agent_knowledge_base
GROUP BY agent_id;
```

---

### 3. Embeddings com dimensão incorreta

**Esperado:** 1536 dimensões (modelo `text-embedding-3-small`)

**Como verificar:**
```sql
SELECT
  agent_id,
  COUNT(*) as items,
  AVG(array_length(embedding::real[], 1)) as avg_dimension
FROM agent_knowledge_base
GROUP BY agent_id;
```

Se a dimensão média não for 1536:
- Verifique se o modelo de embedding está correto em `rag-context.service.ts:42`
- Recrie os embeddings com o modelo correto

---

### 4. Cache não invalida após adicionar conhecimento

**Causa:** Falta de invalidação de cache no `AgentInfoService`.

**Verificação:**
- Arquivo: `apps/web/app/actions/knowledge.ts`
- Deve chamar `AgentInfoService.invalidateCache(agent.salonId)` após:
  - `createKnowledgeItem()`
  - `uploadKnowledgeFile()`
  - `deleteKnowledgeItem()`
  - `deleteKnowledgeFile()`

**Solução temporária:**
- Reinicie o servidor
- Aguarde 60 segundos (TTL do cache)

---

### 5. Query de similaridade não retorna nada

**Debug:**

Teste manualmente a query de similaridade:

```sql
-- Cria um vetor de teste (1536 dimensões zeradas)
WITH test_vector AS (
  SELECT ('['||string_agg('0', ',')||']')::vector as vec
  FROM generate_series(1, 1536)
)
SELECT
  content,
  1 - (embedding <=> test_vector.vec) as similarity
FROM agent_knowledge_base, test_vector
WHERE agent_id = 'seu-agent-id'
ORDER BY embedding <=> test_vector.vec
LIMIT 3;
```

Se retornar erro:
- Verifique se pgvector está instalado
- Verifique se a coluna `embedding` é do tipo `vector(1536)`

---

## 🧪 Testes Manuais

### Testar busca de contexto

```typescript
import { findRelevantContext } from '@/lib/services/ai/rag-context.service'

const result = await findRelevantContext(
  'agent-id-aqui',
  'Como faço um agendamento?',
  3,     // limite de resultados
  0.7    // threshold de similaridade
)

console.log(result)
```

**Resultado esperado:**
```javascript
{
  success: true,
  data: [
    {
      content: "Para agendar, envie...",
      similarity: 0.85,
      metadata: { ... }
    }
  ]
}
```

---

## 📊 Logs Úteis

### Habilitar logs de debug

No arquivo `.env.local`:
```bash
LOG_LEVEL=debug
```

### Logs importantes:

**RAG context encontrado:**
```
[DEBUG] RAG context found { itemsCount: 2, threshold: 0.7 }
```

**RAG context NÃO encontrado:**
```
[DEBUG] No relevant RAG context found { agentId: '...', threshold: 0.7 }
```

**Erro ao buscar RAG:**
```
[ERROR] Erro ao buscar contexto relevante: type "vector" does not exist
```

---

## 🔧 Comandos Úteis

```bash
# Verificar setup do RAG
pnpm check:rag

# Ver tabelas do banco
pnpm db:studio

# Executar migrations
pnpm db:push

# Ver logs em tempo real (se usando pm2)
pm2 logs

# Reiniciar servidor (limpa cache)
pnpm dev
```

---

## 📝 Checklist de Troubleshooting

- [ ] Extensão pgvector instalada? (`pnpm check:rag`)
- [ ] Tabela agent_knowledge_base existe?
- [ ] Há conhecimento cadastrado para o agente?
- [ ] Embeddings têm 1536 dimensões?
- [ ] Cache foi invalidado após adicionar conhecimento?
- [ ] Threshold de similaridade é apropriado? (padrão: 0.7)
- [ ] Logs mostram "RAG context found" ou erro?
- [ ] Query SQL de similaridade funciona manualmente?

---

## 🆘 Ainda não funcionou?

1. Colete os logs completos do erro
2. Execute `pnpm check:rag` e compartilhe o output
3. Verifique se há erro no console do navegador (Network tab)
4. Teste a query SQL manualmente no banco

---

## 📚 Arquivos Relacionados

- `apps/web/lib/services/ai/rag-context.service.ts` - Serviço principal do RAG
- `apps/web/app/actions/knowledge.ts` - CRUD de conhecimento
- `apps/web/lib/services/ai/agent-info.service.ts` - Cache de informações do agente
- `packages/db/src/schema.ts` - Schema da tabela
- `packages/db/scripts/check-rag-setup.mjs` - Script de verificação
- `packages/db/scripts/install-pgvector.sql` - Instalação do pgvector
