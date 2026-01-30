# RAG (Retrieval-Augmented Generation) - Guia de Uso

## 🎯 O que é o RAG?

O RAG permite que o agente de IA utilize conhecimento customizado armazenado no banco de dados para responder perguntas de forma mais precisa e contextual.

## 📝 Como Funciona

1. **Você adiciona conhecimento** (texto, PDFs) para o agente
2. **O sistema gera embeddings** (vetores de 1536 dimensões) usando OpenAI
3. **Quando o usuário faz uma pergunta**, o sistema:
   - Gera embedding da pergunta
   - Busca os 3 itens mais similares no banco (usando pgvector)
   - Retorna apenas os que têm similaridade >= threshold (padrão: 65%)
   - Adiciona esse contexto ao system prompt da IA

## ⚙️ Configuração

### Variáveis de Ambiente (.env.local)

```bash
# Threshold de similaridade (0.0 a 1.0)
RAG_SIMILARITY_THRESHOLD=0.65  # Padrão: 0.65

# Número máximo de itens retornados
RAG_MAX_RESULTS=5  # Padrão: 5 itens
```

### RAG_SIMILARITY_THRESHOLD - Valores Recomendados

| Threshold | Comportamento | Quando Usar |
|-----------|---------------|-------------|
| `0.5` | Muito permissivo | Testes iniciais, knowledge base pequena |
| `0.65` | **Recomendado** | Uso geral, bom equilíbrio |
| `0.7` | Conservador | Knowledge base grande, quer precisão |
| `0.8+` | Muito restritivo | Apenas matches exatos |

### RAG_MAX_RESULTS - Valores Recomendados

| Valor | Contexto | Tokens (aprox.) | Quando Usar |
|-------|----------|-----------------|-------------|
| `3` | Focado | ~500-1000 | Knowledge base pequena ou específica |
| `5` | **Recomendado** | ~1000-2000 | Uso geral, bom equilíbrio |
| `10` | Amplo | ~2000-4000 | Knowledge base grande, quer mais contexto |
| `20+` | Muito amplo | 4000+ | Cuidado! Pode exceder limite do modelo |

**⚠️ Importante:**
- Mais itens = mais tokens consumidos
- GPT-4o-mini tem limite de ~128k tokens (input)
- Cada item de conhecimento pode ter 200-500 tokens
- 10 itens ≈ 2000-5000 tokens apenas do RAG

## 📊 Como Escrever Conhecimento Efetivo

### ✅ BOM - Direto e Focado

```
Horário de funcionamento: Segunda a Sexta, 9h às 18h. Sábados, 9h às 13h.
```

**Por quê?** A informação está clara e direta. Queries como "qual o horário?" terão alta similaridade.

---

### ❌ RUIM - Muito Contextual

```
Quando alguém perguntar sobre horário, você deve responder que nosso salão funciona de segunda a sexta das 9h às 18h e aos sábados das 9h às 13h.
```

**Por quê?** Muito texto adicional reduz a similaridade. O modelo de embedding não entende instruções contextuais.

---

### ✅ BOM - Múltiplas Variações

Se você quer que o agente responda algo específico para uma frase exata, cadastre a **resposta esperada** diretamente:

```
Aoba Tchê, Tchê, Tchê
```

E adicione um item de contexto separado:
```
Quando o usuário disser "Aoba, bão?", responda com "Aoba Tchê, Tchê, Tchê"
```

**Por quê?** Duas entradas aumentam as chances de match.

---

## 🧪 Testar Similaridade

### Script de Teste

Crie o arquivo `test-rag.mjs` ou use o script existente:

```bash
cd packages/db
node scripts/test-embedding-similarity.mjs
```

**O que ele faz:**
- Gera embedding da sua query de teste
- Mostra a similaridade % com cada item do knowledge base
- Indica quais itens seriam retornados com diferentes thresholds

### Exemplo de Output

```
🔍 Searching with different similarity thresholds...

Threshold 0.5 (50%): 2 result(s)
  [1] Similarity: 67.84%
      Content: "Quando alguém escrever..."
  [2] Similarity: 52.10%
      Content: "Horário de funcionamento..."

Threshold 0.65 (65%): 1 result(s)
  [1] Similarity: 67.84%
      Content: "Quando alguém escrever..."

Threshold 0.7 (70%): 0 result(s)
```

**Interpretação:**
- Com threshold 0.65, você terá **1 resultado**
- Com threshold 0.7, **não encontrará nada**
- Se não está encontrando, **reduza o threshold** ou **reformule o conhecimento**

---

## 🔧 Resolver Problemas Comuns

### Problema 1: "RAG não retorna nada"

**Diagnóstico:**
```bash
# 1. Verificar se tem conhecimento
cd packages/db
pnpm check:rag

# 2. Testar similaridade
node scripts/test-embedding-similarity.mjs
```

**Soluções:**
- Se similaridade está entre 50-70%: **Reduza o threshold** para 0.65 ou 0.6
- Se similaridade < 50%: **Reformule o conhecimento** para ser mais direto
- Se não há conhecimento: **Adicione pela interface do agente**

---

### Problema 2: "Similaridade muito baixa"

**Exemplo:**
- Query: `"Aoba, bão?"`
- Knowledge: `"Quando alguém escrever exatamente essas palavras: 'Aoba, bão?' você deve responder..."`
- Similaridade: **67%** ❌ (abaixo de 70%)

**Solução - Reformule o conhecimento:**

**ANTES (67% similaridade):**
```
Quando alguém escrever exatamente essas palavras: "Aoba, bão?"
Você DEVE responder apenas: Aoba Tchê, Tchê, Tchê
```

**DEPOIS (85%+ similaridade esperada):**
```
Aoba, bão? → Resposta: Aoba Tchê, Tchê, Tchê
```

Ou simplesmente:
```
Aoba Tchê, Tchê, Tchê
```

**Por quê?** Menos texto desnecessário = maior similaridade com a query.

---

### Problema 3: "Cache não invalida"

Quando você adiciona/remove conhecimento, o cache leva até 60 segundos para atualizar.

**Soluções:**
- Aguarde 60 segundos
- Reinicie o servidor: `pnpm dev`
- O sistema já invalida o cache automaticamente (após as correções)

---

## 📈 Melhores Práticas

### 1. **Seja Direto**
   - ❌ "Quando perguntarem sobre preços, diga que..."
   - ✅ "Corte masculino: R$ 45. Barba: R$ 30."

### 2. **Use Chunks Pequenos**
   - Cada item de conhecimento deve ser **focado em um tópico**
   - PDFs grandes são automaticamente divididos em chunks

### 3. **Teste a Similaridade**
   - Sempre rode `test-embedding-similarity.mjs` depois de adicionar conhecimento
   - Ajuste o threshold baseado nos resultados

### 4. **Monitore os Logs**
   - Os logs detalhados mostram:
     - Se RAG foi executado
     - Quantos itens foram encontrados
     - % de similaridade de cada item

---

## 📊 Exemplo Completo

### Cenário: Resposta Automática Personalizada

**Objetivo:** Quando o usuário disser "Aoba, bão?", responder "Aoba Tchê, Tchê, Tchê"

### Passo 1: Adicionar Conhecimento

Adicione pela interface do agente:
```
Aoba Tchê, Tchê, Tchê
```

### Passo 2: Testar Similaridade

```bash
cd packages/db
node scripts/test-embedding-similarity.mjs
```

Edite o script para usar sua query:
```javascript
const TEST_QUERY = 'Aoba, bão ?'
```

### Passo 3: Ajustar Threshold (se necessário)

Se a similaridade for 67%, adicione no `.env.local`:
```bash
RAG_SIMILARITY_THRESHOLD=0.65
```

### Passo 4: Testar no Chat

Envie "Aoba, bão?" e observe os logs:
```
✅ RAG: Found 1 relevant item(s):
  [1] Similarity: 67.8%
      Content: Aoba Tchê, Tchê, Tchê
```

### Passo 5: Verificar Resposta

A IA deve incluir "Aoba Tchê, Tchê, Tchê" na resposta ou usá-la como contexto.

---

## 🛠️ Comandos Úteis

```bash
# Verificar configuração do RAG
cd packages/db && pnpm check:rag

# Testar similaridade real
cd packages/db && node scripts/test-embedding-similarity.mjs

# Ver logs detalhados (durante execução do chat)
pnpm dev  # Observe o console

# Limpar cache (reiniciar servidor)
Ctrl+C && pnpm dev
```

---

## 📚 Arquivos Relacionados

- `apps/web/lib/services/ai/rag-context.service.ts` - Lógica do RAG
- `apps/web/app/actions/knowledge.ts` - CRUD de conhecimento
- `packages/db/scripts/test-embedding-similarity.mjs` - Teste de similaridade
- `packages/db/RAG-TROUBLESHOOTING.md` - Guia de troubleshooting

---

## ❓ FAQ

### Q: Por que meu conhecimento não aparece?
**A:** Provavelmente a similaridade está < threshold. Teste com `test-embedding-similarity.mjs`.

### Q: Como aumentar as chances de match?
**A:**
1. Escreva conhecimento mais direto (menos contextual)
2. Reduza o threshold para 0.6 ou 0.65
3. Adicione múltiplas variações da mesma informação

### Q: Quantos itens de conhecimento posso ter?
**A:** Ilimitado. O RAG busca apenas os 3 mais similares.

### Q: O threshold afeta a performance?
**A:** Não. A busca é feita no banco com índice vetorial (muito rápida).

### Q: Posso usar RAG com arquivos PDF?
**A:** Sim! O sistema divide PDFs em chunks automaticamente.
