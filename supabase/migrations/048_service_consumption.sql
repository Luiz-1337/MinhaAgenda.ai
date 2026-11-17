-- 048_service_consumption.sql
-- Estoque: produtos consumidos por serviço e fracionamento
-- (docs/ROADMAP.md, fase 4, fatia 4d).
--
-- Até aqui só a venda do produto baixa o estoque. O insumo gasto no atendimento
-- (o shampoo do lavatório, a tinta da coloração) some da prateleira sem registro.
-- Esta migration cria:
--
--   products.content_amount / content_unit   "uma unidade equivale a" (ex.: 1000 ml)
--   service_products                         o que cada serviço consome por atendimento
--   stock_movements.kind = 'consumption'     baixa de insumo pelo faturamento
--
-- Decisões que o SQL carrega:
--   - O estoque continua em UNIDADES (frascos). O fracionamento só diz quanto cabe
--     em uma unidade; a quantidade consumida pelo serviço é informada na unidade de
--     consumo (ml, g) e convertida para fração de unidade na hora da baixa.
--   - Produto sem fracionamento: o consumo é em unidades, direto.
--   - `content_amount` e `content_unit` andam juntos: ou os dois, ou nenhum.
--   - A baixa de consumo aponta para a comanda e para o ITEM DE SERVIÇO que a
--     gerou, como a venda. CASCADE: reabrir a comanda devolve o insumo.
--   - Um item de produto vendido baixa uma vez (índice único, agora só para
--     `kind = 'sale'`). Um item de serviço pode consumir vários produtos, mas cada
--     produto uma vez só por item (índice único novo).
--   - Um serviço lista cada produto uma vez.
--
-- Padrão multi-tenant das anteriores: salon_id + FK cascade do salão + RLS ON +
-- policy deny_all + REVOKE de anon/authenticated. Aditiva. Idempotente.
--
-- ORDEM: aplicar ANTES de publicar o código da fatia 4d. Ela acrescenta colunas em
-- `products`, e o INSERT do Drizzle lista todas as colunas: sem elas, cadastrar
-- produto falharia em qualquer salão com o código novo. O código antigo continua
-- funcionando depois da 048: as colunas novas aceitam NULL e os CHECKs de
-- `stock_movements` só ficam mais largos.

-- ---------------------------------------------------------------------------
-- products: fracionamento
-- ---------------------------------------------------------------------------
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS content_amount numeric(12,3),
  ADD COLUMN IF NOT EXISTS content_unit   text;

ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_content_check;
ALTER TABLE public.products
  ADD CONSTRAINT products_content_check CHECK (
    (content_amount IS NULL AND content_unit IS NULL) OR
    (content_amount > 0 AND content_unit IN ('ml', 'g', 'un'))
  );

-- ---------------------------------------------------------------------------
-- service_products
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.service_products (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  salon_id   uuid NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,
  service_id uuid NOT NULL REFERENCES public.services(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  -- Quanto um atendimento consome, na unidade de consumo do produto (ml, g) ou em
  -- unidades quando o produto não é fracionado.
  quantity   numeric(12,3) NOT NULL,
  created_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT service_products_quantity_check CHECK (quantity > 0)
);

-- Um serviço lista cada produto uma vez.
CREATE UNIQUE INDEX IF NOT EXISTS service_products_service_product_unique
  ON public.service_products (service_id, product_id);
CREATE INDEX IF NOT EXISTS service_products_salon_idx
  ON public.service_products (salon_id);
CREATE INDEX IF NOT EXISTS service_products_product_idx
  ON public.service_products (product_id);

ALTER TABLE public.service_products ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS deny_all_service_products ON public.service_products;
CREATE POLICY deny_all_service_products ON public.service_products
  FOR ALL USING (false) WITH CHECK (false);
REVOKE ALL ON TABLE public.service_products FROM anon, authenticated;

-- ---------------------------------------------------------------------------
-- stock_movements: a baixa de consumo
-- ---------------------------------------------------------------------------
-- Os CHECKs ficam mais largos. DROP + ADD na mesma transação: nenhuma linha
-- existente deixa de valer.
ALTER TABLE public.stock_movements DROP CONSTRAINT IF EXISTS stock_movements_kind_check;
ALTER TABLE public.stock_movements
  ADD CONSTRAINT stock_movements_kind_check
  CHECK (kind IN ('in', 'out', 'adjustment', 'sale', 'purchase', 'consumption'));

ALTER TABLE public.stock_movements DROP CONSTRAINT IF EXISTS stock_movements_quantity_check;
ALTER TABLE public.stock_movements
  ADD CONSTRAINT stock_movements_quantity_check CHECK (
    quantity <> 0 AND
    (kind NOT IN ('in', 'purchase') OR quantity > 0) AND
    (kind NOT IN ('out', 'sale', 'consumption') OR quantity < 0)
  );

-- Venda e consumo apontam para a comanda e para o item; os outros tipos, não.
ALTER TABLE public.stock_movements DROP CONSTRAINT IF EXISTS stock_movements_sale_check;
ALTER TABLE public.stock_movements
  ADD CONSTRAINT stock_movements_sale_check CHECK (
    (kind IN ('sale', 'consumption')) = (sale_id IS NOT NULL) AND
    (kind IN ('sale', 'consumption')) = (sale_item_id IS NOT NULL)
  );

-- Um item de PRODUTO vendido baixa o estoque uma vez só. O índice antigo valia para
-- qualquer movimento com item; agora o item de serviço pode ter vários consumos.
DROP INDEX IF EXISTS public.stock_movements_sale_item_unique;
CREATE UNIQUE INDEX stock_movements_sale_item_unique
  ON public.stock_movements (sale_item_id)
  WHERE kind = 'sale';

-- Um item de serviço consome cada produto uma vez só.
CREATE UNIQUE INDEX IF NOT EXISTS stock_movements_consumption_unique
  ON public.stock_movements (sale_item_id, product_id)
  WHERE kind = 'consumption';

-- ---------------------------------------------------------------------------
-- Conferência
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  aberta   int;
  faltando text;
BEGIN
  IF to_regclass('public.service_products') IS NULL THEN
    RAISE EXCEPTION '048 FALHOU: tabela service_products não foi criada';
  END IF;

  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.service_products'::regclass) THEN
    RAISE EXCEPTION '048 FALHOU: service_products sem RLS';
  END IF;

  SELECT count(*) INTO aberta
    FROM pg_policy
   WHERE polrelid = 'public.service_products'::regclass
     AND pg_get_expr(polqual, polrelid) <> 'false';

  IF aberta > 0 THEN
    RAISE EXCEPTION '048 FALHOU: % policy(ies) permissiva(s) em service_products', aberta;
  END IF;

  IF has_table_privilege('anon', 'public.service_products', 'SELECT') OR
     has_table_privilege('authenticated', 'public.service_products', 'SELECT') THEN
    RAISE EXCEPTION '048 FALHOU: service_products ainda legível por anon/authenticated';
  END IF;

  SELECT string_agg(esperada.coluna, ', ') INTO faltando
    FROM (VALUES ('content_amount'), ('content_unit')) AS esperada(coluna)
   WHERE NOT EXISTS (
     SELECT 1 FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name = 'products'
        AND c.column_name = esperada.coluna
   );

  IF faltando IS NOT NULL THEN
    RAISE EXCEPTION '048 FALHOU: coluna(s) ausente(s) em products: %', faltando;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.stock_movements'::regclass
       AND conname = 'stock_movements_kind_check'
       AND pg_get_constraintdef(oid) LIKE '%consumption%'
  ) THEN
    RAISE EXCEPTION '048 FALHOU: stock_movements_kind_check não aceita consumption';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
     WHERE schemaname = 'public'
       AND indexname = 'stock_movements_sale_item_unique'
       AND indexdef LIKE '%kind = ''sale''%'
  ) THEN
    RAISE EXCEPTION '048 FALHOU: stock_movements_sale_item_unique não foi recriado só para venda';
  END IF;

  -- Nenhum produto existente passa a ser fracionado sozinho.
  IF EXISTS (SELECT 1 FROM public.products WHERE content_amount IS NOT NULL) AND
     NOT EXISTS (SELECT 1 FROM public.service_products) THEN
    RAISE NOTICE '048: há produto fracionado e nenhum consumo por serviço (esperado só ao reaplicar)';
  END IF;

  RAISE NOTICE '048 OK: fracionamento em products, service_products (RLS on, deny_all, REVOKE), consumo em stock_movements';
END $$;
