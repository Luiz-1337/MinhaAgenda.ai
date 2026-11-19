-- 066_appointment_deposit_sale.sql
-- Sinal abatido na comanda (docs/ROADMAP.md, fase 8, fatia 8b).
--
--   appointment_deposits.sale_id      a comanda em que o sinal foi abatido
--   appointment_deposits.applied_at   quando
--
-- Decisões que o SQL carrega:
--   - O sinal recebido vira UM PAGAMENTO da comanda no faturamento (linha comum
--     em sale_payments, com forma de pagamento). Aqui fica só o vínculo, para o
--     mesmo sinal não ser abatido duas vezes.
--   - Só sinal RECEBIDO pode estar abatido (CHECK). Reabrir a comanda solta o
--     vínculo (o código zera as duas colunas). A comanda nunca é apagada pelo
--     código (a exclusão é lógica); se a linha sumir, o vínculo cai (SET NULL).
--
-- Altera uma tabela existente, criada na 065 e ainda SEM linhas em produção.
-- Idempotente.

ALTER TABLE public.appointment_deposits
  ADD COLUMN IF NOT EXISTS sale_id uuid REFERENCES public.sales(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS applied_at timestamp;

ALTER TABLE public.appointment_deposits
  DROP CONSTRAINT IF EXISTS appointment_deposits_applied_check;
ALTER TABLE public.appointment_deposits
  ADD CONSTRAINT appointment_deposits_applied_check CHECK (sale_id IS NULL OR status = 'received');

CREATE INDEX IF NOT EXISTS appointment_deposits_sale_idx
  ON public.appointment_deposits (sale_id) WHERE sale_id IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'appointment_deposits' AND column_name = 'sale_id'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'appointment_deposits' AND column_name = 'applied_at'
  ) THEN
    RAISE EXCEPTION '066 FALHOU: colunas sale_id/applied_at não foram criadas';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.appointment_deposits'::regclass
       AND conname = 'appointment_deposits_applied_check'
  ) THEN
    RAISE EXCEPTION '066 FALHOU: CHECK appointment_deposits_applied_check ausente';
  END IF;

  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.appointment_deposits'::regclass) THEN
    RAISE EXCEPTION '066 FALHOU: appointment_deposits sem RLS';
  END IF;

  RAISE NOTICE '066 OK: appointment_deposits.sale_id e applied_at';
END $$;
