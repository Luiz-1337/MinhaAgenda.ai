-- ============================================================================
-- FIX COMPLETO: Appointments Não Aparecem na Agenda SOLO
-- ============================================================================
-- INSTRUÇÕES:
-- 1. Copie TODO este arquivo
-- 2. Cole no Supabase SQL Editor
-- 3. Clique em "Run" (ou Ctrl+Enter)
-- 4. Verifique os resultados das verificações ao final
-- ============================================================================
-- Este script é IDEMPOTENTE - pode ser executado múltiplas vezes com segurança
-- ============================================================================

-- Iniciar
DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '==================================================';
  RAISE NOTICE 'INICIANDO FIX DE APPOINTMENTS';
  RAISE NOTICE '==================================================';
  RAISE NOTICE '';
END $$;

-- ============================================================================
-- FASE 1: Atualizar RLS Policies (INSERT/UPDATE)
-- ============================================================================
DO $$
BEGIN
  RAISE NOTICE '→ Fase 1: Atualizando políticas RLS...';
END $$;

-- Policy INSERT
DROP POLICY IF EXISTS "Users can create appointments" ON appointments;

CREATE POLICY "Users can create appointments" ON appointments
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM salons
      WHERE salons.id = appointments.salon_id
      AND salons.owner_id = auth.uid()
    ) OR
    EXISTS (
      SELECT 1 FROM professionals
      WHERE professionals.salon_id = appointments.salon_id
      AND professionals.user_id = auth.uid()
      AND professionals.is_active = true
    )
  );

-- Policy UPDATE
DROP POLICY IF EXISTS "Users can update relevant appointments" ON appointments;

CREATE POLICY "Users can update relevant appointments" ON appointments
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM salons
      WHERE salons.id = appointments.salon_id
      AND salons.owner_id = auth.uid()
    ) OR
    EXISTS (
      SELECT 1 FROM professionals
      WHERE professionals.salon_id = appointments.salon_id
      AND professionals.user_id = auth.uid()
      AND professionals.is_active = true
    )
  );

DO $$
BEGIN
  RAISE NOTICE '✓ Fase 1 completa: Políticas INSERT/UPDATE atualizadas';
  RAISE NOTICE '';
END $$;

-- ============================================================================
-- FASE 2: Corrigir Foreign Key (client_id → customers)
-- ============================================================================
DO $$
BEGIN
  RAISE NOTICE '→ Fase 2: Corrigindo Foreign Key...';

  -- Remover FK antiga (profiles)
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'appointments_client_id_profiles_id_fk'
    AND table_name = 'appointments'
  ) THEN
    ALTER TABLE appointments DROP CONSTRAINT appointments_client_id_profiles_id_fk;
    RAISE NOTICE '  → FK antiga removida (profiles)';
  ELSE
    RAISE NOTICE '  → FK antiga não existe (já foi removida)';
  END IF;

  -- Adicionar FK nova (customers)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'appointments_client_id_customers_id_fk'
    AND table_name = 'appointments'
  ) THEN
    ALTER TABLE appointments
    ADD CONSTRAINT appointments_client_id_customers_id_fk
    FOREIGN KEY (client_id) REFERENCES customers(id) ON DELETE CASCADE;
    RAISE NOTICE '  → FK nova criada (customers)';
  ELSE
    RAISE NOTICE '  → FK nova já existe (pulando)';
  END IF;
END $$;

-- Policy SELECT
DROP POLICY IF EXISTS "Users can view relevant appointments" ON appointments;

CREATE POLICY "Users can view relevant appointments" ON appointments
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM salons
      WHERE salons.id = appointments.salon_id
      AND salons.owner_id = auth.uid()
    ) OR
    EXISTS (
      SELECT 1 FROM professionals
      WHERE professionals.salon_id = appointments.salon_id
      AND professionals.user_id = auth.uid()
      AND professionals.is_active = true
    )
  );

DO $$
BEGIN
  RAISE NOTICE '✓ Fase 2 completa: FK atualizada e política SELECT corrigida';
  RAISE NOTICE '';
END $$;

-- ============================================================================
-- FASE 3: Criar Availability Padrão para Profissionais SOLO
-- ============================================================================
DO $$
DECLARE
  rows_inserted integer;
BEGIN
  RAISE NOTICE '→ Fase 3: Criando availability padrão...';

  INSERT INTO availability (professional_id, day_of_week, start_time, end_time, is_break)
  SELECT
    p.id as professional_id,
    dow as day_of_week,
    '09:00'::time as start_time,
    '18:00'::time as end_time,
    false as is_break
  FROM professionals p
  INNER JOIN salons s ON p.salon_id = s.id
  INNER JOIN profiles pr ON s.owner_id = pr.id
  CROSS JOIN generate_series(1, 5) dow
  WHERE
    pr.tier = 'SOLO'
    AND p.is_active = true
    AND NOT EXISTS (
      SELECT 1 FROM availability a
      WHERE a.professional_id = p.id
    )
  ON CONFLICT DO NOTHING;

  GET DIAGNOSTICS rows_inserted = ROW_COUNT;

  IF rows_inserted > 0 THEN
    RAISE NOTICE '  → Criada availability para % profissional(is)', rows_inserted / 5;
  ELSE
    RAISE NOTICE '  → Todos profissionais já têm availability';
  END IF;

  RAISE NOTICE '✓ Fase 3 completa';
  RAISE NOTICE '';
END $$;

-- ============================================================================
-- FASE 4: Corrigir Dados (Edge Cases)
-- ============================================================================
DO $$
DECLARE
  orphaned_count integer;
  extra_pros_count integer;
BEGIN
  RAISE NOTICE '→ Fase 4: Corrigindo dados...';

  -- Corrigir appointments órfãos
  UPDATE appointments a
  SET professional_id = p.id
  FROM salons s
  INNER JOIN profiles pr ON s.owner_id = pr.id
  INNER JOIN professionals p ON p.salon_id = s.id AND p.user_id = s.owner_id
  WHERE a.salon_id = s.id
    AND pr.tier = 'SOLO'
    AND a.professional_id != p.id
    AND p.is_active = true;

  GET DIAGNOSTICS orphaned_count = ROW_COUNT;

  IF orphaned_count > 0 THEN
    RAISE NOTICE '  → Corrigidos % appointment(s) órfão(s)', orphaned_count;
  ELSE
    RAISE NOTICE '  → Nenhum appointment órfão encontrado';
  END IF;

  -- Desativar profissionais extras em salões SOLO
  UPDATE professionals
  SET is_active = false
  WHERE salon_id IN (
    SELECT s.id FROM salons s
    INNER JOIN profiles pr ON s.owner_id = pr.id
    WHERE pr.tier = 'SOLO'
  )
  AND user_id != (SELECT owner_id FROM salons WHERE id = professionals.salon_id);

  GET DIAGNOSTICS extra_pros_count = ROW_COUNT;

  IF extra_pros_count > 0 THEN
    RAISE NOTICE '  → Desativados % profissional(is) extra(s)', extra_pros_count;
  ELSE
    RAISE NOTICE '  → Nenhum profissional extra encontrado';
  END IF;

  RAISE NOTICE '✓ Fase 4 completa: Dados corrigidos';
  RAISE NOTICE '';
END $$;

-- ============================================================================
-- FASE 5: VERIFICAÇÕES
-- ============================================================================
DO $$
BEGIN
  RAISE NOTICE '→ Fase 5: Executando verificações...';
  RAISE NOTICE '';
END $$;

-- Verificação 1: Profissionais SOLO
SELECT
  CASE
    WHEN COUNT(*) = 0 THEN '✓ PASS'
    ELSE '✗ FAIL'
  END || ': Profissionais SOLO com user_id correto (' ||
  CASE WHEN COUNT(*) = 0 THEN 'todos ok' ELSE COUNT(*)::text || ' com problema' END || ')' as verificacao_1
FROM (
  SELECT p.id
  FROM professionals p
  INNER JOIN salons s ON p.salon_id = s.id
  INNER JOIN profiles pr ON s.owner_id = pr.id
  WHERE pr.tier = 'SOLO'
    AND p.is_active = true
    AND (p.user_id != s.owner_id OR p.user_id IS NULL)
) sub;

-- Verificação 2: FK Appointments
SELECT
  CASE
    WHEN COUNT(*) = 0 THEN '✓ PASS'
    ELSE '✗ FAIL'
  END || ': Appointments com cliente válido (' ||
  CASE WHEN COUNT(*) = 0 THEN 'todos ok' ELSE COUNT(*)::text || ' inválidos' END || ')' as verificacao_2
FROM appointments a
WHERE NOT EXISTS (
  SELECT 1 FROM customers c WHERE c.id = a.client_id
);

-- Verificação 3: Availability
SELECT
  CASE
    WHEN COUNT(*) = 0 THEN '✓ PASS'
    ELSE '✗ FAIL'
  END || ': Profissionais SOLO com availability (' ||
  CASE WHEN COUNT(*) = 0 THEN 'todos ok' ELSE COUNT(*)::text || ' sem horários' END || ')' as verificacao_3
FROM (
  SELECT p.id
  FROM professionals p
  INNER JOIN salons s ON p.salon_id = s.id
  INNER JOIN profiles pr ON s.owner_id = pr.id
  LEFT JOIN availability av ON av.professional_id = p.id
  WHERE pr.tier = 'SOLO'
    AND p.is_active = true
  GROUP BY p.id
  HAVING COUNT(av.id) = 0
) sub;

-- Verificação 4: Contagem de Profissionais
SELECT
  CASE
    WHEN COUNT(*) = 0 THEN '✓ PASS'
    ELSE '✗ FAIL'
  END || ': Salões SOLO com 1 profissional (' ||
  CASE WHEN COUNT(*) = 0 THEN 'todos ok' ELSE COUNT(*)::text || ' com problema' END || ')' as verificacao_4
FROM (
  SELECT s.id
  FROM salons s
  INNER JOIN profiles pr ON s.owner_id = pr.id
  LEFT JOIN professionals p ON p.salon_id = s.id AND p.is_active = true
  WHERE pr.tier = 'SOLO'
  GROUP BY s.id
  HAVING COUNT(p.id) != 1
) sub;

-- Verificação 5: Query de Teste
SELECT
  CASE
    WHEN COUNT(*) > 0 THEN '✓ PASS'
    ELSE 'ℹ INFO'
  END || ': Appointments encontrados com JOIN correto (' || COUNT(*)::text || ' encontrados)' as verificacao_5
FROM appointments a
INNER JOIN professionals p ON a.professional_id = p.id
INNER JOIN customers c ON a.client_id = c.id
INNER JOIN services s ON a.service_id = s.id
WHERE a.date >= NOW() - INTERVAL '30 days'
LIMIT 10;

-- ============================================================================
-- RESUMO FINAL
-- ============================================================================
DO $$
DECLARE
  fk_ok boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'appointments_client_id_customers_id_fk'
    AND table_name = 'appointments'
  ) INTO fk_ok;

  RAISE NOTICE '';
  RAISE NOTICE '==================================================';
  RAISE NOTICE '✓ FIX APLICADO COM SUCESSO!';
  RAISE NOTICE '==================================================';
  RAISE NOTICE '';
  RAISE NOTICE 'FK para customers: %', CASE WHEN fk_ok THEN '✓ OK' ELSE '✗ ERRO' END;
  RAISE NOTICE '';
  RAISE NOTICE 'Revise os resultados das verificações acima.';
  RAISE NOTICE 'Todas devem mostrar "✓ PASS".';
  RAISE NOTICE '';
  RAISE NOTICE 'PRÓXIMOS PASSOS:';
  RAISE NOTICE '1. Recarregue a página da agenda (F5)';
  RAISE NOTICE '2. Verifique se os appointments aparecem';
  RAISE NOTICE '3. Teste criar novo appointment';
  RAISE NOTICE '';
END $$;
