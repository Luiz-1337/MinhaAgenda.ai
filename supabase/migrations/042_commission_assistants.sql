-- 042_commission_assistants.sql
-- Auxiliar no item da comanda e comissão como auxiliar
-- (docs/ROADMAP.md, fase 3, fatia 3b).
--
-- A 041 calcula a comissão de quem executou o serviço. Esta migration responde:
-- e quem ajudou? O auxiliar entra no item da comanda e ganha a própria linha no
-- extrato; o valor dele sai do salão ou da comissão do profissional.
--
-- O que muda:
--   sale_items.assistant_id                 quem auxiliou naquele serviço (opcional)
--   commission_assistant_rules  (nova)      quanto o auxiliar ganha por serviço:
--                                           padrão do salão e exceção por profissional
--   commission_entries.assistant_deduction  quanto da comissão do profissional foi
--                                           para o auxiliar ("desconto de auxiliar")
--
-- Decisões que o SQL carrega:
--   - Auxiliar só em item de SERVIÇO, e nunca a mesma pessoa que o executou
--     (CHECK em sale_items).
--   - A regra de auxiliar é só por serviço — produto não tem auxiliar — e fica em
--     tabela própria, para as consultas da comissão do profissional (041) não
--     precisarem saber que ela existe.
--   - `base`: sobre o que o percentual incide — 'gross' (valor do serviço) ou
--     'commission' (a comissão do profissional). Em regra de valor fixo não é usado.
--   - `deduct_from`: de quem sai — 'salon' ou 'professional'.
--   - A linha do auxiliar no extrato é commission_entries com role = 'assistant'
--     (a 041 já aceitava). A linha do profissional guarda em `assistant_deduction`
--     o que foi descontado dela: amount = gross_amount − fee_amount −
--     assistant_deduction.
--
-- ORDEM: esta migration altera duas tabelas que o código já lê e grava
-- (sale_items e commission_entries). Aplicar ANTES de publicar o código da fatia
-- 3b — sem as colunas, salvar comanda e abrir o extrato falham.
--
-- Padrão multi-tenant das anteriores: salon_id + FK cascade do salão + RLS ON +
-- policy deny_all + REVOKE de anon/authenticated. Aditiva. Idempotente.

-- ---------------------------------------------------------------------------
-- sale_items.assistant_id
-- ---------------------------------------------------------------------------
ALTER TABLE public.sale_items
  ADD COLUMN IF NOT EXISTS assistant_id uuid REFERENCES public.professionals(id);

ALTER TABLE public.sale_items DROP CONSTRAINT IF EXISTS sale_items_assistant_check;
ALTER TABLE public.sale_items
  ADD  CONSTRAINT sale_items_assistant_check CHECK (
    assistant_id IS NULL
    OR (kind = 'service' AND assistant_id IS DISTINCT FROM professional_id)
  );

CREATE INDEX IF NOT EXISTS sale_items_assistant_idx
  ON public.sale_items (assistant_id)
  WHERE assistant_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- commission_assistant_rules
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.commission_assistant_rules (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  salon_id        uuid NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,
  -- NULL = padrão do salão para o serviço. Preenchido = o que AQUELE profissional
  -- ganha quando é o auxiliar.
  professional_id uuid REFERENCES public.professionals(id) ON DELETE CASCADE,
  service_id      uuid NOT NULL REFERENCES public.services(id) ON DELETE CASCADE,
  -- 'percent': value é o percentual (0 a 100). 'fixed': value é reais por unidade.
  kind            text NOT NULL,
  value           numeric(12,2) NOT NULL,
  base            text NOT NULL DEFAULT 'gross',
  deduct_from     text NOT NULL DEFAULT 'professional',
  created_at      timestamp NOT NULL DEFAULT now(),
  updated_at      timestamp NOT NULL DEFAULT now(),
  CONSTRAINT commission_assistant_rules_kind_check CHECK (kind IN ('percent', 'fixed')),
  CONSTRAINT commission_assistant_rules_value_check CHECK (value >= 0 AND (kind <> 'percent' OR value <= 100)),
  CONSTRAINT commission_assistant_rules_base_check CHECK (base IN ('gross', 'commission')),
  CONSTRAINT commission_assistant_rules_deduct_check CHECK (deduct_from IN ('salon', 'professional'))
);

CREATE UNIQUE INDEX IF NOT EXISTS commission_assistant_rules_salon_unique
  ON public.commission_assistant_rules (salon_id, service_id)
  WHERE professional_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS commission_assistant_rules_professional_unique
  ON public.commission_assistant_rules (professional_id, service_id)
  WHERE professional_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS commission_assistant_rules_salon_idx
  ON public.commission_assistant_rules (salon_id);

ALTER TABLE public.commission_assistant_rules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS deny_all_commission_assistant_rules ON public.commission_assistant_rules;
CREATE POLICY deny_all_commission_assistant_rules ON public.commission_assistant_rules
  FOR ALL USING (false) WITH CHECK (false);
REVOKE ALL ON TABLE public.commission_assistant_rules FROM anon, authenticated;

-- ---------------------------------------------------------------------------
-- commission_entries.assistant_deduction
-- ---------------------------------------------------------------------------
ALTER TABLE public.commission_entries
  ADD COLUMN IF NOT EXISTS assistant_deduction numeric(12,2) NOT NULL DEFAULT 0;

ALTER TABLE public.commission_entries DROP CONSTRAINT IF EXISTS commission_entries_assistant_deduction_check;
ALTER TABLE public.commission_entries
  ADD  CONSTRAINT commission_entries_assistant_deduction_check CHECK (
    assistant_deduction >= 0
    -- O desconto nunca passa do que sobrou depois da taxa.
    AND assistant_deduction <= gross_amount - fee_amount
    -- Só a linha do profissional é descontada; a do auxiliar é o que ele recebe.
    AND (role = 'professional' OR assistant_deduction = 0)
  );

-- ---------------------------------------------------------------------------
-- Conferência
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  faltando int;
  aberta int;
BEGIN
  SELECT count(*) INTO faltando
    FROM (VALUES ('sale_items', 'assistant_id'), ('commission_entries', 'assistant_deduction')) AS v(tab, col)
   WHERE NOT EXISTS (
     SELECT 1 FROM information_schema.columns c
      WHERE c.table_schema = 'public' AND c.table_name = v.tab AND c.column_name = v.col
   );

  IF faltando > 0 THEN
    RAISE EXCEPTION '042 FALHOU: % coluna(s) nova(s) ausente(s)', faltando;
  END IF;

  IF to_regclass('public.commission_assistant_rules') IS NULL THEN
    RAISE EXCEPTION '042 FALHOU: tabela commission_assistant_rules não foi criada';
  END IF;

  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.commission_assistant_rules'::regclass) THEN
    RAISE EXCEPTION '042 FALHOU: commission_assistant_rules sem RLS';
  END IF;

  SELECT count(*) INTO aberta
    FROM pg_policy
   WHERE polrelid = 'public.commission_assistant_rules'::regclass
     AND pg_get_expr(polqual, polrelid) <> 'false';

  IF aberta > 0 THEN
    RAISE EXCEPTION '042 FALHOU: % policy(ies) permissiva(s) em commission_assistant_rules', aberta;
  END IF;

  RAISE NOTICE '042 OK: sale_items.assistant_id, commission_assistant_rules (RLS on, deny_all, REVOKE), commission_entries.assistant_deduction';
END $$;
