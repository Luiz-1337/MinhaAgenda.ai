-- 045_inventory.sql
-- Estoque: controle por produto e movimentações
-- (docs/ROADMAP.md, fase 4, fatia 4a).
--
-- Até aqui o produto é só nome e preço. Esta migration põe no produto o que o
-- controle de estoque precisa e cria o registro de tudo o que entra e sai:
--
--   products.track_stock   o salão controla o estoque deste produto?
--   products.min_stock     abaixo disto, o produto entra na sugestão de compra
--   products.cost_price    custo de compra (para o valor do estoque)
--   products.sku / barcode código interno e código de barras
--
--   stock_movements        uma linha por entrada, saída, acerto ou venda
--
-- Decisões que o SQL carrega:
--   - O SALDO NÃO É GRAVADO: é a soma de `stock_movements.quantity` do produto,
--     como o saldo das contas do financeiro. Não há número para sair de sincronia.
--   - `quantity` tem SINAL: positivo entra, negativo sai. O acerto de inventário
--     grava a DIFERENÇA entre o que havia e o que foi contado.
--   - Venda (`kind = 'sale'`) aponta para a comanda e para o item. CASCADE de
--     propósito: reabrir a comanda apaga a baixa que ela fez, como já acontece com
--     o financeiro e com as comissões.
--   - Vender sem saldo não é barrado no banco: o produto já saiu da prateleira. O
--     saldo fica negativo e a tela avisa.
--   - Quantidade em numeric(12,3), como `sale_items.quantity`: produto fracionado
--     (ml, g) cabe sem mudar o tipo depois.
--
-- Padrão multi-tenant das anteriores: salon_id + FK cascade do salão + RLS ON +
-- policy deny_all + REVOKE de anon/authenticated. Aditiva. Idempotente.
--
-- ORDEM: aplicar ANTES de publicar o código da fatia 4a. Ela acrescenta colunas em
-- `products`, tabela que TODO salão usa: o INSERT do Drizzle lista todas as
-- colunas, então sem elas cadastrar produto falharia em qualquer ambiente com o
-- código novo. O código antigo continua funcionando depois da 045: as colunas
-- novas têm padrão ou aceitam NULL.

-- ---------------------------------------------------------------------------
-- products: o que o controle de estoque precisa
-- ---------------------------------------------------------------------------
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS track_stock boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS min_stock   numeric(12,3) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cost_price  numeric(12,2),
  ADD COLUMN IF NOT EXISTS sku         text,
  ADD COLUMN IF NOT EXISTS barcode     text;

ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_min_stock_check;
ALTER TABLE public.products
  ADD CONSTRAINT products_min_stock_check CHECK (min_stock >= 0);

ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_cost_price_check;
ALTER TABLE public.products
  ADD CONSTRAINT products_cost_price_check CHECK (cost_price IS NULL OR cost_price >= 0);

-- ---------------------------------------------------------------------------
-- stock_movements
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.stock_movements (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  salon_id     uuid NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,
  product_id   uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  -- in = entrada · out = saída (perda, uso interno) · adjustment = acerto de
  -- inventário · sale = baixa pelo faturamento de uma comanda
  kind         text NOT NULL,
  -- Com sinal: positivo entra, negativo sai.
  quantity     numeric(12,3) NOT NULL,
  -- Custo unitário informado na entrada. NULL = não informado.
  unit_cost    numeric(12,2),
  notes        text,
  sale_id      uuid REFERENCES public.sales(id) ON DELETE CASCADE,
  sale_item_id uuid REFERENCES public.sale_items(id) ON DELETE CASCADE,
  created_by   uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at   timestamp NOT NULL DEFAULT now(),
  CONSTRAINT stock_movements_kind_check CHECK (kind IN ('in', 'out', 'adjustment', 'sale')),
  -- Movimento zerado não é movimento; entrada é positiva, saída e venda negativas.
  CONSTRAINT stock_movements_quantity_check CHECK (
    quantity <> 0 AND
    (kind <> 'in' OR quantity > 0) AND
    (kind NOT IN ('out', 'sale') OR quantity < 0)
  ),
  CONSTRAINT stock_movements_unit_cost_check CHECK (unit_cost IS NULL OR unit_cost >= 0),
  -- Só a venda aponta para comanda e item, e aponta para os dois.
  CONSTRAINT stock_movements_sale_check CHECK (
    (kind = 'sale') = (sale_id IS NOT NULL) AND
    (kind = 'sale') = (sale_item_id IS NOT NULL)
  )
);

-- O saldo de um produto e a movimentação dele, da mais recente para a mais antiga.
CREATE INDEX IF NOT EXISTS stock_movements_product_idx
  ON public.stock_movements (product_id, created_at DESC);
-- A movimentação do salão.
CREATE INDEX IF NOT EXISTS stock_movements_salon_idx
  ON public.stock_movements (salon_id, created_at DESC);
-- Reabrir a comanda: as baixas dela.
CREATE INDEX IF NOT EXISTS stock_movements_sale_idx
  ON public.stock_movements (sale_id)
  WHERE sale_id IS NOT NULL;
-- Um item de comanda baixa o estoque uma vez só.
CREATE UNIQUE INDEX IF NOT EXISTS stock_movements_sale_item_unique
  ON public.stock_movements (sale_item_id)
  WHERE sale_item_id IS NOT NULL;

ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS deny_all_stock_movements ON public.stock_movements;
CREATE POLICY deny_all_stock_movements ON public.stock_movements
  FOR ALL USING (false) WITH CHECK (false);
REVOKE ALL ON TABLE public.stock_movements FROM anon, authenticated;

-- ---------------------------------------------------------------------------
-- Conferência
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  aberta   int;
  faltando text;
BEGIN
  IF to_regclass('public.stock_movements') IS NULL THEN
    RAISE EXCEPTION '045 FALHOU: tabela stock_movements não foi criada';
  END IF;

  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.stock_movements'::regclass) THEN
    RAISE EXCEPTION '045 FALHOU: stock_movements sem RLS';
  END IF;

  SELECT count(*) INTO aberta
    FROM pg_policy
   WHERE polrelid = 'public.stock_movements'::regclass
     AND pg_get_expr(polqual, polrelid) <> 'false';

  IF aberta > 0 THEN
    RAISE EXCEPTION '045 FALHOU: % policy(ies) permissiva(s) em stock_movements', aberta;
  END IF;

  SELECT string_agg(esperada.coluna, ', ') INTO faltando
    FROM (VALUES ('track_stock'), ('min_stock'), ('cost_price'), ('sku'), ('barcode')) AS esperada(coluna)
   WHERE NOT EXISTS (
     SELECT 1 FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name = 'products'
        AND c.column_name = esperada.coluna
   );

  IF faltando IS NOT NULL THEN
    RAISE EXCEPTION '045 FALHOU: coluna(s) ausente(s) em products: %', faltando;
  END IF;

  -- Nenhum produto existente passa a controlar estoque sozinho.
  IF EXISTS (SELECT 1 FROM public.products WHERE track_stock) AND
     NOT EXISTS (SELECT 1 FROM public.stock_movements) THEN
    RAISE NOTICE '045: há produto com track_stock ligado e nenhuma movimentação (esperado só ao reaplicar)';
  END IF;

  RAISE NOTICE '045 OK: products com controle de estoque, stock_movements (RLS on, deny_all, REVOKE)';
END $$;
