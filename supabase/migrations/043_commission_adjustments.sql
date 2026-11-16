-- 043_commission_adjustments.sql
-- Vales e bonificações do profissional
-- (docs/ROADMAP.md, fase 3, fatia 3c).
--
-- A 041 e a 042 dizem quanto o profissional ganhou em cada item. Esta migration
-- guarda o que entra por fora dos itens:
--   vale         ('advance')  adiantamento — ABATE o que ele tem a receber
--   bonificação  ('bonus')    prêmio, ajuda de custo — SOMA ao que ele tem a receber
--
-- No extrato: líquido = comissões a receber − vales + bonificações.
--
-- Decisões que o SQL carrega:
--   - `reference_date` é o dia em que o lançamento entra no extrato (o "Vencimento"
--     da Belasis): um vale dado no dia 20 para descontar em dezembro leva a data
--     de dezembro.
--   - `amount` é sempre positivo; o sinal vem do `kind`.
--   - Não gera lançamento no financeiro: a saída de dinheiro do vale e o pagamento
--     do líquido ficam para a fatia 3d (pagamento de comissão em lote).
--   - `professional_id` sem ON DELETE CASCADE, como em commission_entries: apagar
--     um profissional não pode apagar o histórico do que foi adiantado a ele.
--
-- Padrão multi-tenant das anteriores: salon_id + FK cascade do salão + RLS ON +
-- policy deny_all + REVOKE de anon/authenticated. Aditiva. Idempotente. Não toca
-- em nenhuma tabela existente.
--
-- ORDEM: só cria tabela nova. Com o módulo `commissions` desligado ela não é lida.
-- Com o módulo ligado, o extrato passa a consultá-la — aplicar antes de publicar o
-- código da fatia 3c em qualquer ambiente que tenha um salão com o módulo ligado.

CREATE TABLE IF NOT EXISTS public.commission_adjustments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  salon_id        uuid NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,
  professional_id uuid NOT NULL REFERENCES public.professionals(id),
  kind            text NOT NULL,
  amount          numeric(12,2) NOT NULL,
  -- Dia em que entra no extrato (calendário de Brasília).
  reference_date  date NOT NULL,
  notes           text,
  created_by      uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at      timestamp NOT NULL DEFAULT now(),
  CONSTRAINT commission_adjustments_kind_check CHECK (kind IN ('advance', 'bonus')),
  CONSTRAINT commission_adjustments_amount_check CHECK (amount > 0)
);

-- O extrato: lançamentos do salão (e de um profissional) num período.
CREATE INDEX IF NOT EXISTS commission_adjustments_statement_idx
  ON public.commission_adjustments (salon_id, professional_id, reference_date);

ALTER TABLE public.commission_adjustments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS deny_all_commission_adjustments ON public.commission_adjustments;
CREATE POLICY deny_all_commission_adjustments ON public.commission_adjustments
  FOR ALL USING (false) WITH CHECK (false);
REVOKE ALL ON TABLE public.commission_adjustments FROM anon, authenticated;

-- ---------------------------------------------------------------------------
-- Conferência
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  aberta int;
BEGIN
  IF to_regclass('public.commission_adjustments') IS NULL THEN
    RAISE EXCEPTION '043 FALHOU: tabela commission_adjustments não foi criada';
  END IF;

  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.commission_adjustments'::regclass) THEN
    RAISE EXCEPTION '043 FALHOU: commission_adjustments sem RLS';
  END IF;

  SELECT count(*) INTO aberta
    FROM pg_policy
   WHERE polrelid = 'public.commission_adjustments'::regclass
     AND pg_get_expr(polqual, polrelid) <> 'false';

  IF aberta > 0 THEN
    RAISE EXCEPTION '043 FALHOU: % policy(ies) permissiva(s) em commission_adjustments', aberta;
  END IF;

  RAISE NOTICE '043 OK: commission_adjustments (RLS on, deny_all, REVOKE)';
END $$;
