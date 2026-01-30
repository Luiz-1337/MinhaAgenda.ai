# Guia Rápido: Aplicar Fix de Appointments

## 🚀 Passo a Passo Rápido

### 1️⃣ Abrir SQL Editor do Supabase

Acesse: https://supabase.com/dashboard/project/[your-project-id]/sql/new

### 2️⃣ Executar o Script de Fix

**ARQUIVO RECOMENDADO:** `apply_fix.sql` (versão simplificada e testada)

1. Abra o arquivo: `apply_fix.sql`
2. Copie TODO o conteúdo (Ctrl+A, Ctrl+C)
3. Cole no SQL Editor do Supabase
4. Clique em **Run** (ou pressione Ctrl+Enter)

**Alternativa:** Você também pode usar `fix_appointments_complete_v2.sql` (mais verboso)

### 3️⃣ Verificar Resultados

Após executar, você verá:

✅ **SUCESSO - Se aparecer:**
```
✓ Phase 1 complete: RLS INSERT/UPDATE policies updated
✓ Phase 2 complete: FK updated and SELECT policy fixed
✓ Phase 3 complete: Backfilled availability for X SOLO professional(s)
✓ Phase 4 complete: Edge cases handled
✓ ALL MIGRATIONS APPLIED SUCCESSFULLY!
```

E todas as verificações com "✓ PASS":
```
✓ PASS: All SOLO professionals have correct user_id
✓ PASS: All appointments reference valid customers
✓ PASS: All SOLO professionals have availability
✓ PASS: All SOLO salons have exactly 1 active professional
```

❌ **PROBLEMA - Se aparecer "✗ FAIL":**
- Anote qual verificação falhou
- Execute `diagnose_appointments.sql` para mais detalhes
- Entre em contato para suporte

### 4️⃣ Testar no App

1. **Login** como proprietário SOLO
2. **Navegue** para a página de agenda: `/[salonId]/schedule`
3. **Verifique** se os agendamentos aparecem
4. **Crie** um novo agendamento de teste
5. **Confirme** que ele aparece imediatamente na agenda

## 📊 Script de Diagnóstico (Opcional)

Se quiser ver o estado atual ANTES de aplicar o fix:

1. Execute `diagnose_appointments.sql` no SQL Editor
2. Revise os resultados para entender o estado atual
3. Depois execute `fix_appointments_complete_v2.sql`

## ❓ Perguntas Frequentes

### O script pode ser executado várias vezes?

**Sim!** O script v2 é idempotente - verifica se cada mudança já existe antes de aplicar. É seguro executar múltiplas vezes.

### E se eu já executei migration 012 antes?

**Sem problema!** Use `fix_appointments_complete_v2.sql` que detecta constraints existentes e não tenta recriar.

### O que fazer se os appointments ainda não aparecem?

1. Verifique o browser console (F12) por erros JavaScript
2. Execute `diagnose_appointments.sql` e envie os resultados
3. Verifique se o código da aplicação está atualizado (repository.ts)
4. Confirme que está logado como o proprietário do salão SOLO

### Preciso reiniciar a aplicação?

**Não** - As mudanças de RLS policies são instantâneas. Apenas recarregue a página (F5).

## 🔍 Verificação Manual

Se quiser verificar manualmente no banco:

```sql
-- 1. Verificar FK correto
SELECT constraint_name, constraint_type
FROM information_schema.table_constraints
WHERE table_name = 'appointments' AND constraint_type = 'FOREIGN KEY';

-- Deve mostrar: appointments_client_id_customers_id_fk

-- 2. Ver appointments com dados completos
SELECT
  a.id,
  p.name as professional,
  c.name as client,
  s.name as service,
  a.date
FROM appointments a
JOIN professionals p ON a.professional_id = p.id
JOIN customers c ON a.client_id = c.id
JOIN services s ON a.service_id = s.id
ORDER BY a.date DESC
LIMIT 5;

-- Se a query acima retornar dados, o fix funcionou! ✓
```

## 📝 Checklist Final

- [ ] Executei `fix_appointments_complete_v2.sql` no Supabase
- [ ] Todas as verificações retornaram "✓ PASS"
- [ ] Appointments aparecem na página de agenda
- [ ] Consigo criar novo appointment via UI
- [ ] Novo appointment aparece imediatamente
- [ ] Sem erros no console do browser

## 🎯 Próximos Passos

Após confirmar que tudo funciona:

1. ✅ Código já commitado no git
2. ✅ Migrações aplicadas no banco
3. 🔄 Faça deploy da aplicação (se necessário)
4. 📱 Teste com usuários reais

## 🆘 Suporte

Se encontrar problemas:

1. Execute `diagnose_appointments.sql` e salve os resultados
2. Capture screenshots do erro no browser
3. Verifique logs do Supabase na aba "Logs"
4. Entre em contato com os resultados do diagnóstico
