-- 030_customers_list_index.sql
-- Índice para a listagem de contatos.
--
-- `getSalonCustomers` ordena por `updated_at DESC` filtrando `is_system = false`, e
-- não havia índice nenhum que servisse: `customers` tem só o UNIQUE (salon_id, phone)
-- e o índice de salon_id. Com a paginação no servidor (que entra junto com esta
-- migration no código), a query passa a ter LIMIT/OFFSET — e ordenação sem índice
-- com LIMIT é o pior caso: o Postgres ordena a partição inteira do salão para
-- devolver 20 linhas.
--
-- PARCIAL em `is_system = false` porque é exatamente o filtro da listagem (exclui o
-- contato placeholder "Google Calendar"): o índice fica menor e cobre o predicado.
--
-- Aditiva. Idempotente.

CREATE INDEX IF NOT EXISTS customers_salon_updated_idx
  ON public.customers (salon_id, updated_at DESC)
  WHERE is_system = false;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
     WHERE schemaname = 'public' AND indexname = 'customers_salon_updated_idx'
  ) THEN
    RAISE EXCEPTION '030 FALHOU: índice customers_salon_updated_idx não foi criado';
  END IF;

  RAISE NOTICE '030 OK: customers_salon_updated_idx (parcial em is_system = false)';
END $$;
