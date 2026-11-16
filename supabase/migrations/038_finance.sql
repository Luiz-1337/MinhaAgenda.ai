-- 038_finance.sql
-- Financeiro: contas, categorias e transações (docs/ROADMAP.md, fase 2).
--
-- A comanda (037) registra a VENDA e como ela foi paga. Falta o DINHEIRO: quando
-- o valor entra, em qual conta, quanto a maquininha levou, o que o salão tem a
-- pagar. É o que este arquivo cria — e é o que comissão (fase 3) vai ler para
-- saber quando um valor ficou disponível.
--
-- Três tabelas e uma coluna:
--   financial_accounts      onde o dinheiro está (banco, caixa, cofre)
--   financial_categories    plano de categorias, de receita e de despesa
--   financial_transactions  contas a receber e a pagar, e as transferências
--   payment_methods.account_id   conta de destino de cada forma de pagamento
--
-- Decisões que o SQL carrega:
--   - Uma transação nasce 'open' (a receber/a pagar) e vira 'paid' na baixa.
--     Paga tem que dizer quando (paid_at) — é o eixo do saldo e do fluxo de caixa.
--   - net_amount é gravado, não calculado na leitura: amount − fee_amount. Em
--     saída a taxa é zero. O CHECK garante a conta.
--   - Transação de venda aponta para o PAGAMENTO da comanda (sale_payment_id) com
--     ON DELETE CASCADE: reabrir a comanda apaga os pagamentos, e o que eles
--     geraram no financeiro some junto, no mesmo comando. Uma por pagamento
--     (índice único parcial).
--   - Transferência entre contas são DUAS linhas pagas (saída de uma, entrada na
--     outra) com o mesmo transfer_group. Não entram em receita nem despesa.
--   - account_id é opcional até na transação paga: forma de pagamento sem conta de
--     destino não pode travar o faturamento da comanda. A tela mostra "sem conta".
--   - Sem CASCADE a partir de cliente, profissional, categoria ou conta: apagar um
--     cadastro não apaga lançamento. Categoria e conta viram NULL (SET NULL).
--
-- Padrão multi-tenant de 020/029/034/036/037: salon_id + FK cascade do salão +
-- RLS ON + policy deny_all + REVOKE de anon/authenticated (acesso só via Drizzle).
-- Aditiva. Idempotente. Em tabela existente só adiciona payment_methods.account_id
-- (nula).

-- ---------------------------------------------------------------------------
-- financial_accounts
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.financial_accounts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  salon_id        uuid NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,
  name            text NOT NULL,
  kind            text NOT NULL,
  opening_balance numeric(12,2) NOT NULL DEFAULT 0,
  is_active       boolean NOT NULL DEFAULT true,
  created_at      timestamp NOT NULL DEFAULT now(),
  updated_at      timestamp NOT NULL DEFAULT now(),
  CONSTRAINT financial_accounts_kind_check
    CHECK (kind IN ('bank', 'cash', 'safe', 'other'))
);

CREATE UNIQUE INDEX IF NOT EXISTS financial_accounts_salon_name_unique
  ON public.financial_accounts (salon_id, lower(name));

-- ---------------------------------------------------------------------------
-- financial_categories
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.financial_categories (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  salon_id   uuid NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,
  name       text NOT NULL,
  kind       text NOT NULL,
  is_active  boolean NOT NULL DEFAULT true,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT financial_categories_kind_check CHECK (kind IN ('income', 'expense'))
);

-- Mesmo nome pode existir em receita e em despesa ("Outros").
CREATE UNIQUE INDEX IF NOT EXISTS financial_categories_salon_kind_name_unique
  ON public.financial_categories (salon_id, kind, lower(name));

-- ---------------------------------------------------------------------------
-- payment_methods.account_id — conta de destino
-- ---------------------------------------------------------------------------
ALTER TABLE public.payment_methods
  ADD COLUMN IF NOT EXISTS account_id uuid
    REFERENCES public.financial_accounts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS payment_methods_account_idx
  ON public.payment_methods (account_id)
  WHERE account_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- financial_transactions
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.financial_transactions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  salon_id          uuid NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,
  direction         text NOT NULL,
  kind              text NOT NULL,
  status            text NOT NULL DEFAULT 'open',
  description       text NOT NULL,
  amount            numeric(12,2) NOT NULL,
  fee_amount        numeric(12,2) NOT NULL DEFAULT 0,
  net_amount        numeric(12,2) NOT NULL,
  due_date          date NOT NULL,
  competence_date   date NOT NULL,
  paid_at           timestamp,
  account_id        uuid REFERENCES public.financial_accounts(id) ON DELETE SET NULL,
  category_id       uuid REFERENCES public.financial_categories(id) ON DELETE SET NULL,
  payment_method_id uuid REFERENCES public.payment_methods(id) ON DELETE SET NULL,
  customer_id       uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  professional_id   uuid REFERENCES public.professionals(id) ON DELETE SET NULL,
  counterparty      text,
  sale_id           uuid REFERENCES public.sales(id) ON DELETE CASCADE,
  sale_payment_id   uuid REFERENCES public.sale_payments(id) ON DELETE CASCADE,
  transfer_group    uuid,
  notes             text,
  created_by        uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at        timestamp NOT NULL DEFAULT now(),
  updated_at        timestamp NOT NULL DEFAULT now(),
  CONSTRAINT financial_transactions_direction_check CHECK (direction IN ('in', 'out')),
  CONSTRAINT financial_transactions_kind_check CHECK (kind IN ('sale', 'manual', 'transfer')),
  CONSTRAINT financial_transactions_status_check CHECK (status IN ('open', 'paid')),
  CONSTRAINT financial_transactions_amounts_check CHECK (
    amount > 0 AND fee_amount >= 0 AND fee_amount <= amount AND net_amount = amount - fee_amount
  ),
  -- Paga tem que dizer quando; aberta não pode dizer.
  CONSTRAINT financial_transactions_paid_at_check
    CHECK ((status = 'paid') = (paid_at IS NOT NULL)),
  -- Venda é sempre entrada e sempre aponta para o pagamento que a gerou.
  CONSTRAINT financial_transactions_sale_check CHECK (
    (kind = 'sale') = (sale_payment_id IS NOT NULL) AND
    (kind <> 'sale' OR (direction = 'in' AND sale_id IS NOT NULL))
  ),
  -- Transferência tem grupo, é paga e tem conta; o resto não tem grupo.
  CONSTRAINT financial_transactions_transfer_check CHECK (
    (kind = 'transfer') = (transfer_group IS NOT NULL) AND
    (kind <> 'transfer' OR (status = 'paid' AND account_id IS NOT NULL))
  )
);

-- A lista: por vencimento, com filtro de situação.
CREATE INDEX IF NOT EXISTS financial_transactions_salon_due_idx
  ON public.financial_transactions (salon_id, due_date);
CREATE INDEX IF NOT EXISTS financial_transactions_salon_status_due_idx
  ON public.financial_transactions (salon_id, status, due_date);
-- Saldo por conta: só o que está pago.
CREATE INDEX IF NOT EXISTS financial_transactions_account_paid_idx
  ON public.financial_transactions (account_id)
  WHERE status = 'paid' AND account_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS financial_transactions_sale_idx
  ON public.financial_transactions (sale_id)
  WHERE sale_id IS NOT NULL;
-- Uma transação por pagamento de comanda.
CREATE UNIQUE INDEX IF NOT EXISTS financial_transactions_sale_payment_unique
  ON public.financial_transactions (sale_payment_id)
  WHERE sale_payment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS financial_transactions_transfer_idx
  ON public.financial_transactions (transfer_group)
  WHERE transfer_group IS NOT NULL;

-- ---------------------------------------------------------------------------
-- RLS: deny_all + REVOKE nas três
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['financial_accounts', 'financial_categories', 'financial_transactions']
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
  FOREACH t IN ARRAY ARRAY['financial_accounts', 'financial_categories', 'financial_transactions']
  LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      RAISE EXCEPTION '038 FALHOU: tabela % não foi criada', t;
    END IF;
  END LOOP;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'payment_methods' AND column_name = 'account_id'
  ) THEN
    RAISE EXCEPTION '038 FALHOU: payment_methods.account_id não foi criada';
  END IF;

  SELECT count(*) INTO sem_rls
    FROM pg_class
   WHERE oid IN (
           'public.financial_accounts'::regclass,
           'public.financial_categories'::regclass,
           'public.financial_transactions'::regclass)
     AND NOT relrowsecurity;

  IF sem_rls > 0 THEN
    RAISE EXCEPTION '038 FALHOU: % tabela(s) sem RLS', sem_rls;
  END IF;

  SELECT count(*) INTO aberta
    FROM pg_policy
   WHERE polrelid IN (
           'public.financial_accounts'::regclass,
           'public.financial_categories'::regclass,
           'public.financial_transactions'::regclass)
     AND pg_get_expr(polqual, polrelid) <> 'false';

  IF aberta > 0 THEN
    RAISE EXCEPTION '038 FALHOU: % policy(ies) permissiva(s) nas tabelas do financeiro', aberta;
  END IF;

  RAISE NOTICE '038 OK: financial_accounts, financial_categories, financial_transactions (RLS on, deny_all, REVOKE) + payment_methods.account_id';
END $$;
