# 🔧 FIX: Appointments Não Aparecem na Agenda

## ⚡ SOLUÇÃO RÁPIDA (3 passos)

### 1. Abrir Supabase
Acesse: https://supabase.com/dashboard/project/[seu-projeto]/sql/new

### 2. Copiar e Colar
Abra o arquivo `apply_fix.sql` deste repositório e copie TUDO

### 3. Executar
Cole no SQL Editor e clique em **Run**

---

## ✅ Resultado Esperado

Você verá mensagens assim:

```
→ Fase 1: Atualizando políticas RLS...
✓ Fase 1 completa: Políticas INSERT/UPDATE atualizadas

→ Fase 2: Corrigindo Foreign Key...
✓ Fase 2 completa: FK atualizada e política SELECT corrigida

→ Fase 3: Criando availability padrão...
✓ Fase 3 completa

→ Fase 4: Corrigindo dados...
✓ Fase 4 completa: Dados corrigidos

→ Fase 5: Executando verificações...
✓ PASS: Profissionais SOLO com user_id correto (todos ok)
✓ PASS: Appointments com cliente válido (todos ok)
✓ PASS: Profissionais SOLO com availability (todos ok)
✓ PASS: Salões SOLO com 1 profissional (todos ok)
✓ PASS: Appointments encontrados com JOIN correto (X encontrados)

==================================================
✓ FIX APLICADO COM SUCESSO!
==================================================
```

## 🧪 Testar

1. Recarregue a página da agenda (F5)
2. Os appointments devem aparecer agora! 🎉
3. Tente criar um novo appointment
4. Ele deve aparecer imediatamente

## ❓ E se der erro?

### Erro: "syntax error"
→ Certifique-se de copiar TODO o arquivo `apply_fix.sql`
→ Não cole apenas parte do script

### Erro: "constraint already exists"
→ Tudo bem! O script detecta e pula automaticamente
→ Continue executando, o resto será aplicado

### Erro: "permission denied"
→ Verifique se você está logado como admin no Supabase
→ Vá em Settings → Database → Connection pooling

### Appointments ainda não aparecem?
1. Verifique se TODAS as verificações retornaram "✓ PASS"
2. Abra o console do browser (F12) e veja se há erros
3. Execute `diagnose_appointments.sql` e envie os resultados

## 📚 Documentação Completa

- **Guia Rápido:** `QUICK_START_FIX.md`
- **Documentação Técnica:** `FIX_APPOINTMENTS_README.md`
- **Diagnóstico:** `diagnose_appointments.sql`

---

## 🎯 O Que Foi Corrigido

O problema era que o código estava tentando buscar clientes na tabela `profiles`, mas na verdade eles estão na tabela `customers` (WhatsApp integration).

**Antes:** ❌ Query falhava → 0 appointments retornados
**Depois:** ✅ Query funciona → Appointments aparecem na agenda

## 💾 Arquivos Importantes

| Arquivo | Descrição |
|---------|-----------|
| `apply_fix.sql` | ⭐ Script principal de fix (USE ESTE!) |
| `fix_appointments_complete_v2.sql` | Versão alternativa mais verbosa |
| `diagnose_appointments.sql` | Ver estado atual do banco |
| `QUICK_START_FIX.md` | Guia completo em português |
| `FIX_APPOINTMENTS_README.md` | Documentação técnica |

---

**Pronto!** Execute `apply_fix.sql` e seus appointments aparecerão na agenda. 🚀
