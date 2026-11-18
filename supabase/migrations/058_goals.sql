-- 058_goals.sql
-- Metas por mês, do salão e de cada profissional (docs/ROADMAP.md, fase 6,
-- fatia 6e).
--
--   goals   a meta de um mês, para um indicador, do salão ou de um profissional
--
-- Decisões que o SQL carrega:
--   - Só a META é gravada. O REALIZADO não mora aqui: é somado das comandas
--     faturadas do mês, na hora de mostrar — nunca fica desatualizado.
--   - `month` é sempre o dia 1 do mês (CHECK).
--   - `professional_id` NULL = a meta é do salão inteiro.
--   - Uma meta por mês, por indicador e por dono (dois índices únicos parciais,
--     porque NULL não entra em índice único comum).
--
-- Padrão multi-tenant das anteriores: salon_id + FK cascade do salão + RLS ON +
-- policy deny_all + REVOKE de anon/authenticated.
-- Aditiva. Idempotente. Não mexe em tabela existente.

CREATE TABLE IF NOT EXISTS public.goals (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  salon_id        uuid NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,
  -- Dia 1 do mês da meta.
  month           date NOT NULL,
  -- NULL = meta do salão.
  professional_id uuid REFERENCES public.professionals(id) ON DELETE CASCADE,
  -- 'revenue' = faturamento; 'services' = em serviços; 'products' = em produtos;
  -- 'sales_count' = comandas faturadas.
  metric          text NOT NULL,
  target          numeric(12,2) NOT NULL,
  created_at      timestamp NOT NULL DEFAULT now(),
  updated_at      timestamp NOT NULL DEFAULT now(),
  CONSTRAINT goals_month_check CHECK (extract(day FROM month) = 1),
  CONSTRAINT goals_metric_check CHECK (metric IN ('revenue', 'services', 'products', 'sales_count')),
  CONSTRAINT goals_target_check CHECK (target > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS goals_salon_unique
  ON public.goals (salon_id, month, metric) WHERE professional_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS goals_professional_unique
  ON public.goals (salon_id, month, professional_id, metric) WHERE professional_id IS NOT NULL;

ALTER TABLE public.goals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS deny_all_goals ON public.goals;
CREATE POLICY deny_all_goals ON public.goals
  FOR ALL USING (false) WITH CHECK (false);
REVOKE ALL ON TABLE public.goals FROM anon, authenticated;

DO $$
DECLARE
  aberta int;
BEGIN
  IF to_regclass('public.goals') IS NULL THEN
    RAISE EXCEPTION '058 FALHOU: tabela goals não foi criada';
  END IF;

  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.goals'::regclass) THEN
    RAISE EXCEPTION '058 FALHOU: goals sem RLS';
  END IF;

  SELECT count(*) INTO aberta
    FROM pg_policy
   WHERE polrelid = 'public.goals'::regclass
     AND pg_get_expr(polqual, polrelid) <> 'false';

  IF aberta > 0 THEN
    RAISE EXCEPTION '058 FALHOU: % policy(ies) permissiva(s) em goals', aberta;
  END IF;

  IF has_table_privilege('anon', 'public.goals', 'SELECT') OR
     has_table_privilege('authenticated', 'public.goals', 'SELECT') THEN
    RAISE EXCEPTION '058 FALHOU: goals ainda legível por anon/authenticated';
  END IF;

  RAISE NOTICE '058 OK: goals (RLS on, deny_all, REVOKE)';
END $$;
