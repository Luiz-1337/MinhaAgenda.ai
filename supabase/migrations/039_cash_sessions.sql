-- 039_cash_sessions.sql
-- Caixa: abertura, suprimento, sangria, fechamento e conferência
-- (docs/ROADMAP.md, fase 2, fatia 2e).
--
-- O financeiro (038) diz quanto dinheiro o salão TEM em cada conta. O caixa é
-- outra pergunta: o dinheiro vivo que está na GAVETA agora bate com o que
-- deveria estar? É controle de operação, não de saldo — por isso é separado das
-- contas financeiras e não gera lançamento nelas.
--
-- Duas tabelas:
--   cash_sessions   um período de caixa: quem abriu, com quanto, e como fechou
--   cash_movements  o que entrou e saiu da gaveta durante o período
--
-- Decisões que o SQL carrega:
--   - UM caixa aberto por salão: índice único parcial em (salon_id) WHERE
--     status = 'open'. Duas abas clicando "Abrir caixa" não criam dois.
--   - O esperado NÃO é gravado enquanto o caixa está aberto — é sempre calculado:
--     saldo inicial + suprimentos + vendas em dinheiro − sangrias. No fechamento
--     ficam gravados o esperado, o contado e a diferença, para o histórico não
--     mudar depois.
--   - Venda em dinheiro entra sozinha: movimento 'sale' aponta para o pagamento da
--     comanda (sale_payment_id) com ON DELETE CASCADE. Reabrir a comanda apaga o
--     pagamento e o movimento some junto. Um movimento por pagamento.
--   - Suprimento e sangria são lançados na tela e não apontam para pagamento.
--
-- Padrão multi-tenant de 020/029/034/036/037/038: salon_id + FK cascade do salão +
-- RLS ON + policy deny_all + REVOKE de anon/authenticated (acesso só via Drizzle).
-- Aditiva. Idempotente. Não toca em nenhuma tabela existente.

-- ---------------------------------------------------------------------------
-- cash_sessions
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.cash_sessions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  salon_id        uuid NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,
  status          text NOT NULL DEFAULT 'open',
  opened_by       uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  opened_at       timestamp NOT NULL DEFAULT now(),
  opening_amount  numeric(12,2) NOT NULL DEFAULT 0,
  closed_by       uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  closed_at       timestamp,
  expected_amount numeric(12,2),
  counted_amount  numeric(12,2),
  difference      numeric(12,2),
  notes           text,
  created_at      timestamp NOT NULL DEFAULT now(),
  updated_at      timestamp NOT NULL DEFAULT now(),
  CONSTRAINT cash_sessions_status_check CHECK (status IN ('open', 'closed')),
  CONSTRAINT cash_sessions_opening_check CHECK (opening_amount >= 0),
  -- Fechado tem que dizer quando e com quanto; aberto não pode dizer.
  CONSTRAINT cash_sessions_closing_check CHECK (
    (status = 'closed') = (closed_at IS NOT NULL)
    AND (status = 'closed') = (counted_amount IS NOT NULL)
    AND (status = 'closed') = (expected_amount IS NOT NULL)
    AND (status = 'closed') = (difference IS NOT NULL)
  ),
  CONSTRAINT cash_sessions_difference_check CHECK (
    status <> 'closed' OR (counted_amount >= 0 AND difference = counted_amount - expected_amount)
  )
);

-- Um caixa aberto por salão.
CREATE UNIQUE INDEX IF NOT EXISTS cash_sessions_one_open_per_salon
  ON public.cash_sessions (salon_id)
  WHERE status = 'open';
-- O histórico: caixas do salão, do mais recente para o mais antigo.
CREATE INDEX IF NOT EXISTS cash_sessions_salon_opened_idx
  ON public.cash_sessions (salon_id, opened_at DESC);

-- ---------------------------------------------------------------------------
-- cash_movements
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.cash_movements (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  salon_id        uuid NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,
  cash_session_id uuid NOT NULL REFERENCES public.cash_sessions(id) ON DELETE CASCADE,
  kind            text NOT NULL,
  amount          numeric(12,2) NOT NULL,
  description     text,
  sale_payment_id uuid REFERENCES public.sale_payments(id) ON DELETE CASCADE,
  created_by      uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at      timestamp NOT NULL DEFAULT now(),
  CONSTRAINT cash_movements_kind_check CHECK (kind IN ('supply', 'withdrawal', 'sale')),
  CONSTRAINT cash_movements_amount_check CHECK (amount > 0),
  -- Venda sempre aponta para o pagamento; suprimento e sangria nunca.
  CONSTRAINT cash_movements_sale_check CHECK ((kind = 'sale') = (sale_payment_id IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS cash_movements_session_idx
  ON public.cash_movements (cash_session_id, created_at);
CREATE INDEX IF NOT EXISTS cash_movements_salon_idx
  ON public.cash_movements (salon_id);
-- Um movimento por pagamento de comanda.
CREATE UNIQUE INDEX IF NOT EXISTS cash_movements_sale_payment_unique
  ON public.cash_movements (sale_payment_id)
  WHERE sale_payment_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- RLS: deny_all + REVOKE nas duas
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['cash_sessions', 'cash_movements']
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'deny_all_' || t, t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL USING (false) WITH CHECK (false)',
      'deny_all_' || t, t
    );
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon, authenticated', t);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- Conferência
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  t text;
  aberta int;
  sem_rls int;
BEGIN
  FOREACH t IN ARRAY ARRAY['cash_sessions', 'cash_movements']
  LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      RAISE EXCEPTION '039 FALHOU: tabela % não foi criada', t;
    END IF;
  END LOOP;

  SELECT count(*) INTO sem_rls
    FROM pg_class
   WHERE oid IN ('public.cash_sessions'::regclass, 'public.cash_movements'::regclass)
     AND NOT relrowsecurity;

  IF sem_rls > 0 THEN
    RAISE EXCEPTION '039 FALHOU: % tabela(s) sem RLS', sem_rls;
  END IF;

  SELECT count(*) INTO aberta
    FROM pg_policy
   WHERE polrelid IN ('public.cash_sessions'::regclass, 'public.cash_movements'::regclass)
     AND pg_get_expr(polqual, polrelid) <> 'false';

  IF aberta > 0 THEN
    RAISE EXCEPTION '039 FALHOU: % policy(ies) permissiva(s) nas tabelas do caixa', aberta;
  END IF;

  RAISE NOTICE '039 OK: cash_sessions, cash_movements (RLS on, deny_all, REVOKE)';
END $$;
