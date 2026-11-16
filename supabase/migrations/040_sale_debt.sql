-- 040_sale_debt.sql
-- Débito de cliente: comanda faturada com valor em aberto
-- (docs/ROADMAP.md, fase 2, fatia 2f).
--
-- Até aqui uma comanda só faturava com os pagamentos fechando o total (037). No
-- balcão isso não basta: a cliente paga metade e o resto na semana que vem, ou
-- leva fiado. Sem registrar isso a comanda ficava aberta para sempre — e o
-- agendamento sem desfecho.
--
-- Não há tabela nova. O débito é a própria comanda:
--   sales.amount_due      quanto da comanda faturada ainda não foi pago
--   sales.debt_due_date   quando a cliente combinou de pagar (opcional)
--
-- Receber depois é lançar MAIS um pagamento na mesma comanda (sale_payments), que
-- baixa amount_due. Por isso pagamento parcial e em várias vezes saem de graça, e o
-- que o pagamento já dispara (conta a receber no financeiro, entrada no caixa)
-- continua valendo sem código novo.
--
-- amount_due é gravado, e não calculado na leitura, porque as duas perguntas que
-- importam são filtros: "quais comandas têm valor em aberto?" e "quanto esta
-- cliente deve?". O CHECK abaixo impede que ele saia do intervalo; quem o mantém
-- igual a total − pagamentos é o código, dentro da transação do pagamento.
--
-- Aditiva. Idempotente. Só adiciona duas colunas a `sales` (criada na 037).

ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS amount_due numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS debt_due_date date;

ALTER TABLE public.sales DROP CONSTRAINT IF EXISTS sales_amount_due_check;
ALTER TABLE public.sales
  ADD  CONSTRAINT sales_amount_due_check CHECK (
    amount_due >= 0
    AND amount_due <= total
    -- Só comanda faturada deve: aberta e excluída não têm débito.
    AND (status = 'invoiced' OR amount_due = 0)
    -- Vencimento só faz sentido enquanto há valor em aberto.
    AND (amount_due > 0 OR debt_due_date IS NULL)
  );

-- "Quanto esta cliente deve?" e "quais comandas têm valor em aberto?".
CREATE INDEX IF NOT EXISTS sales_debt_idx
  ON public.sales (salon_id, customer_id)
  WHERE status = 'invoiced' AND amount_due > 0;

DO $$
DECLARE
  faltando int;
  fora int;
BEGIN
  SELECT count(*) INTO faltando
    FROM (VALUES ('amount_due'), ('debt_due_date')) AS v(col)
   WHERE NOT EXISTS (
     SELECT 1 FROM information_schema.columns c
      WHERE c.table_schema = 'public' AND c.table_name = 'sales' AND c.column_name = v.col
   );

  IF faltando > 0 THEN
    RAISE EXCEPTION '040 FALHOU: % coluna(s) nova(s) ausente(s) em sales', faltando;
  END IF;

  -- Toda comanda que já existe tem que ter nascido sem débito.
  SELECT count(*) INTO fora FROM public.sales WHERE amount_due <> 0;

  IF fora > 0 THEN
    RAISE EXCEPTION '040 FALHOU: % comanda(s) com amount_due diferente de zero logo após a migration', fora;
  END IF;

  RAISE NOTICE '040 OK: sales.amount_due e sales.debt_due_date';
END $$;
