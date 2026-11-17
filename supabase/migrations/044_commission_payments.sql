-- 044_commission_payments.sql
-- Pagamento de comissão em lote e saída do vale no financeiro
-- (docs/ROADMAP.md, fase 3, fatia 3d).
--
-- Até a 043 o extrato diz quanto cada profissional tem a receber, mas nada diz o
-- que JÁ FOI PAGO. Esta migration guarda o pagamento e marca o que ele quitou:
--
--   commission_payments          um pagamento a UM profissional. Os feitos juntos
--                                compartilham `batch_id` (o "lote" da Belasis).
--   commission_entries.payment_id      a comissão do item foi quitada neste pagamento
--   commission_adjustments.payment_id  o vale / a bonificação entrou neste pagamento
--
-- Valor pago = comissões − vales + bonificações de tudo o que estava EM ABERTO até
-- a data de corte. O que não foi quitado continua em aberto e entra no próximo
-- pagamento — é assim que um vale maior que a comissão passa para o mês seguinte.
--
-- E o dinheiro no financeiro (fase 2):
--
--   financial_transactions.kind = 'commission'   despesa PAGA gerada por um
--       pagamento de comissão (`commission_payment_id`) ou por um vale
--       (`commission_adjustment_id`). Só existe quando quem lançou escolheu a
--       conta de onde o dinheiro saiu.
--
-- Decisões que o SQL carrega:
--   - Estornar um pagamento é APAGAR a linha: as comissões e os lançamentos voltam
--     a ficar em aberto (ON DELETE SET NULL) e a despesa some junto (ON DELETE
--     CASCADE). O mesmo vale para excluir um vale com saída no financeiro.
--   - `amount` pode ser ZERO: comissão e vale que se anulam são quitados sem sair
--     dinheiro. Negativo não existe — quem deve não recebe, o saldo fica em aberto.
--   - `professional_id` sem ON DELETE CASCADE, como nas outras tabelas de comissão:
--     apagar um profissional não apaga o histórico do que foi pago a ele.
--   - Lançamento do financeiro de tipo 'commission' é sempre saída, paga e com
--     conta: não se edita, não se estorna e não se exclui pela tela do financeiro.
--
-- Padrão multi-tenant das anteriores: salon_id + FK cascade do salão + RLS ON +
-- policy deny_all + REVOKE de anon/authenticated. Aditiva. Idempotente.
--
-- ORDEM: aplicar ANTES de publicar o código da fatia 3d. Ela acrescenta colunas em
-- tabelas que o código já grava (`commission_entries`, `commission_adjustments` e
-- `financial_transactions`): o INSERT do Drizzle lista todas as colunas, então sem
-- elas faturar comanda (com os módulos ligados) e lançar no financeiro falham.
-- O código antigo continua funcionando depois da 044: as colunas novas são
-- opcionais e o CHECK de `kind` só ficou mais largo.

-- ---------------------------------------------------------------------------
-- commission_payments
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.commission_payments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  salon_id        uuid NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,
  -- Pagamentos feitos na mesma operação (impressão agrupada dos recibos).
  batch_id        uuid NOT NULL,
  professional_id uuid NOT NULL REFERENCES public.professionals(id),
  -- Quitou tudo o que estava em aberto ATÉ este dia (calendário de Brasília).
  cutoff_date     date NOT NULL,
  -- Fotografia do que foi quitado: o recibo não muda se algo for recalculado.
  entries_amount  numeric(12,2) NOT NULL DEFAULT 0,
  advances_amount numeric(12,2) NOT NULL DEFAULT 0,
  bonuses_amount  numeric(12,2) NOT NULL DEFAULT 0,
  -- O que saiu para o profissional: comissões − vales + bonificações.
  amount          numeric(12,2) NOT NULL,
  -- Dia em que o dinheiro foi entregue.
  paid_on         date NOT NULL,
  -- De onde saiu. NULL = pago sem registrar no financeiro.
  account_id      uuid REFERENCES public.financial_accounts(id) ON DELETE SET NULL,
  notes           text,
  created_by      uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at      timestamp NOT NULL DEFAULT now(),
  CONSTRAINT commission_payments_amounts_check CHECK (
    entries_amount >= 0 AND advances_amount >= 0 AND bonuses_amount >= 0 AND
    amount >= 0 AND amount = entries_amount - advances_amount + bonuses_amount
  )
);

-- A lista "Pagas": por dia do pagamento, do salão ou de um profissional.
CREATE INDEX IF NOT EXISTS commission_payments_salon_paid_idx
  ON public.commission_payments (salon_id, paid_on DESC);
CREATE INDEX IF NOT EXISTS commission_payments_professional_idx
  ON public.commission_payments (professional_id, paid_on DESC);
CREATE INDEX IF NOT EXISTS commission_payments_batch_idx
  ON public.commission_payments (batch_id);

ALTER TABLE public.commission_payments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS deny_all_commission_payments ON public.commission_payments;
CREATE POLICY deny_all_commission_payments ON public.commission_payments
  FOR ALL USING (false) WITH CHECK (false);
REVOKE ALL ON TABLE public.commission_payments FROM anon, authenticated;

-- ---------------------------------------------------------------------------
-- O que cada pagamento quitou
-- ---------------------------------------------------------------------------
ALTER TABLE public.commission_entries
  ADD COLUMN IF NOT EXISTS payment_id uuid REFERENCES public.commission_payments(id) ON DELETE SET NULL;

ALTER TABLE public.commission_adjustments
  ADD COLUMN IF NOT EXISTS payment_id uuid REFERENCES public.commission_payments(id) ON DELETE SET NULL;

-- Estorno e recibo: as linhas de um pagamento.
CREATE INDEX IF NOT EXISTS commission_entries_payment_idx
  ON public.commission_entries (payment_id)
  WHERE payment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS commission_adjustments_payment_idx
  ON public.commission_adjustments (payment_id)
  WHERE payment_id IS NOT NULL;

-- "Em aberto até o dia X": o que ainda não foi quitado, por profissional.
CREATE INDEX IF NOT EXISTS commission_entries_open_idx
  ON public.commission_entries (salon_id, professional_id, release_date)
  WHERE payment_id IS NULL;
CREATE INDEX IF NOT EXISTS commission_adjustments_open_idx
  ON public.commission_adjustments (salon_id, professional_id, reference_date)
  WHERE payment_id IS NULL;

-- ---------------------------------------------------------------------------
-- A saída no financeiro
-- ---------------------------------------------------------------------------
ALTER TABLE public.financial_transactions
  ADD COLUMN IF NOT EXISTS commission_payment_id uuid
    REFERENCES public.commission_payments(id) ON DELETE CASCADE;

ALTER TABLE public.financial_transactions
  ADD COLUMN IF NOT EXISTS commission_adjustment_id uuid
    REFERENCES public.commission_adjustments(id) ON DELETE CASCADE;

-- O CHECK de `kind` fica mais largo. DROP + ADD na mesma transação: nenhuma linha
-- existente deixa de valer (todas são 'sale', 'manual' ou 'transfer').
ALTER TABLE public.financial_transactions
  DROP CONSTRAINT IF EXISTS financial_transactions_kind_check;
ALTER TABLE public.financial_transactions
  ADD CONSTRAINT financial_transactions_kind_check
  CHECK (kind IN ('sale', 'manual', 'transfer', 'commission'));

-- 'commission' aponta para UM dos dois (pagamento ou vale), é saída, paga e com
-- conta. Os outros tipos não apontam para nenhum.
ALTER TABLE public.financial_transactions
  DROP CONSTRAINT IF EXISTS financial_transactions_commission_check;
ALTER TABLE public.financial_transactions
  ADD CONSTRAINT financial_transactions_commission_check CHECK (
    (kind = 'commission') = (num_nonnulls(commission_payment_id, commission_adjustment_id) = 1) AND
    num_nonnulls(commission_payment_id, commission_adjustment_id) <= 1 AND
    (kind <> 'commission' OR (direction = 'out' AND status = 'paid' AND account_id IS NOT NULL))
  );

-- Uma despesa por pagamento e uma por vale.
CREATE UNIQUE INDEX IF NOT EXISTS financial_transactions_commission_payment_unique
  ON public.financial_transactions (commission_payment_id)
  WHERE commission_payment_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS financial_transactions_commission_adjustment_unique
  ON public.financial_transactions (commission_adjustment_id)
  WHERE commission_adjustment_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Conferência
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  aberta   int;
  faltando text;
BEGIN
  IF to_regclass('public.commission_payments') IS NULL THEN
    RAISE EXCEPTION '044 FALHOU: tabela commission_payments não foi criada';
  END IF;

  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.commission_payments'::regclass) THEN
    RAISE EXCEPTION '044 FALHOU: commission_payments sem RLS';
  END IF;

  SELECT count(*) INTO aberta
    FROM pg_policy
   WHERE polrelid = 'public.commission_payments'::regclass
     AND pg_get_expr(polqual, polrelid) <> 'false';

  IF aberta > 0 THEN
    RAISE EXCEPTION '044 FALHOU: % policy(ies) permissiva(s) em commission_payments', aberta;
  END IF;

  SELECT string_agg(esperada.tabela || '.' || esperada.coluna, ', ') INTO faltando
    FROM (VALUES
      ('commission_entries', 'payment_id'),
      ('commission_adjustments', 'payment_id'),
      ('financial_transactions', 'commission_payment_id'),
      ('financial_transactions', 'commission_adjustment_id')
    ) AS esperada(tabela, coluna)
   WHERE NOT EXISTS (
     SELECT 1 FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name = esperada.tabela
        AND c.column_name = esperada.coluna
   );

  IF faltando IS NOT NULL THEN
    RAISE EXCEPTION '044 FALHOU: coluna(s) ausente(s): %', faltando;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.financial_transactions'::regclass
       AND conname = 'financial_transactions_kind_check'
       AND pg_get_constraintdef(oid) LIKE '%commission%'
  ) THEN
    RAISE EXCEPTION '044 FALHOU: o CHECK de kind não aceita ''commission''';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.financial_transactions'::regclass
       AND conname = 'financial_transactions_commission_check'
  ) THEN
    RAISE EXCEPTION '044 FALHOU: financial_transactions_commission_check não foi criado';
  END IF;

  RAISE NOTICE '044 OK: commission_payments (RLS on, deny_all, REVOKE), payment_id nas comissões e nos lançamentos, tipo commission no financeiro';
END $$;
