-- 052_package_usage.sql
-- Pacotes: usar o pacote do cliente na comanda (docs/ROADMAP.md, fase 5, fatia 5b).
--
-- Usar uma sessão é pôr na comanda um item de serviço (ou produto) "do pacote":
-- ele aponta para a linha do pacote do cliente e não é cobrado (total zero). O
-- saldo é a quantidade da linha menos o que as comandas FATURADAS usaram — não há
-- tabela de consumo: reabrir a comanda devolve o saldo sozinho.
--
--   sale_items.customer_package_item_id   de qual linha de pacote o item sai
--   customer_package_items.value          a parte do preço do pacote que cabe à
--                                         linha (base da comissão de quem executa)
--
-- Decisões que o SQL carrega:
--   - Item do pacote é serviço ou produto, sem cobrança (total e desconto zero) e
--     com quantidade inteira.
--   - FK sem ON DELETE: o pacote não some enquanto uma comanda (aberta ou faturada)
--     usa uma linha dele. O serviço já barra reabrir a comanda que vendeu um pacote
--     usado; a FK é a rede de segurança. Excluir a comanda que usou solta a ligação
--     (o serviço faz isso, como faz com o agendamento).
--   - `value` nasce 0: só existe pacote de teste apagado até aqui; os novos recebem o
--     rateio no faturamento.
--
-- Padrão das anteriores: aditiva, idempotente, com conferência no fim.
--
-- ORDEM: aplicar ANTES de publicar o código da fatia 5b. Ela acrescenta colunas em
-- `sale_items` e `customer_package_items`, e o INSERT do Drizzle lista todas as
-- colunas: sem elas, salvar qualquer comanda (e faturar pacote) falharia com o
-- código novo. O código da 5a continua funcionando depois da 052: as colunas novas
-- aceitam NULL ou têm default, e o CHECK novo aceita todas as linhas que existem.

-- ---------------------------------------------------------------------------
-- customer_package_items.value
-- ---------------------------------------------------------------------------
ALTER TABLE public.customer_package_items
  ADD COLUMN IF NOT EXISTS value numeric(12,2) NOT NULL DEFAULT 0;

ALTER TABLE public.customer_package_items DROP CONSTRAINT IF EXISTS customer_package_items_value_check;
ALTER TABLE public.customer_package_items
  ADD CONSTRAINT customer_package_items_value_check CHECK (value >= 0);

-- ---------------------------------------------------------------------------
-- sale_items.customer_package_item_id
-- ---------------------------------------------------------------------------
ALTER TABLE public.sale_items
  ADD COLUMN IF NOT EXISTS customer_package_item_id uuid REFERENCES public.customer_package_items(id);

ALTER TABLE public.sale_items DROP CONSTRAINT IF EXISTS sale_items_package_use_check;
ALTER TABLE public.sale_items
  ADD CONSTRAINT sale_items_package_use_check CHECK (
    customer_package_item_id IS NULL OR (
      kind IN ('service', 'product')
      AND total = 0
      AND discount_amount = 0
      AND quantity = trunc(quantity)
    )
  );

-- O saldo de uma linha soma os itens que a usam.
CREATE INDEX IF NOT EXISTS sale_items_customer_package_item_idx
  ON public.sale_items (customer_package_item_id)
  WHERE customer_package_item_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Conferência
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'sale_items' AND column_name = 'customer_package_item_id'
  ) THEN
    RAISE EXCEPTION '052 FALHOU: sale_items.customer_package_item_id ausente';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'customer_package_items' AND column_name = 'value'
  ) THEN
    RAISE EXCEPTION '052 FALHOU: customer_package_items.value ausente';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.sale_items'::regclass AND conname = 'sale_items_package_use_check'
  ) THEN
    RAISE EXCEPTION '052 FALHOU: sale_items_package_use_check ausente';
  END IF;

  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.customer_package_items'::regclass) THEN
    RAISE EXCEPTION '052 FALHOU: customer_package_items sem RLS';
  END IF;

  RAISE NOTICE '052 OK: item do pacote em sale_items, valor da linha em customer_package_items';
END $$;
