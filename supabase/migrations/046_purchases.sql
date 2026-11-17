-- 046_purchases.sql
-- Estoque: fornecedores, marcas, categorias de produto e compras
-- (docs/ROADMAP.md, fase 4, fatia 4b).
--
-- Até aqui a entrada no estoque é um lançamento solto. Esta migration cria a
-- COMPRA: um documento com fornecedor, data, nota e itens, que dá entrada no
-- estoque, atualiza o custo do produto e (com o financeiro ligado) gera a conta a
-- pagar.
--
--   suppliers              fornecedores do salão
--   product_brands         marcas de produto
--   product_categories     categorias de produto
--   products.brand_id / category_id
--   purchases              a compra (cabeçalho)
--   purchase_items         os itens da compra
--   stock_movements.kind = 'purchase'           entrada gerada por um item de compra
--   financial_transactions.kind = 'purchase'    conta a pagar gerada por uma compra
--
-- Decisões que o SQL carrega:
--   - A compra não tem rascunho nem edição: lançou, valeu. Corrigir é excluir e
--     lançar de novo. Excluir a compra apaga as entradas no estoque e as parcelas
--     no financeiro (CASCADE) — por isso o serviço barra a exclusão quando há
--     parcela paga.
--   - `purchases.total_amount = items_amount + freight_amount − discount_amount`
--     (CHECK): o total é o que se paga ao fornecedor, e é ele que vira conta a
--     pagar.
--   - O item guarda o NOME do produto na hora da compra (`description`) e o custo
--     que o produto tinha antes (`previous_cost`): excluir a compra devolve o custo.
--   - Uma compra pode gerar várias parcelas no financeiro: o índice em
--     `financial_transactions.purchase_id` NÃO é único.
--   - A parcela de compra pode nascer aberta ou paga e recebe baixa/estorno no
--     financeiro como qualquer despesa; o que ela não aceita é edição e exclusão
--     por lá (regra em domain/finance.ts).
--   - Marca e categoria apagadas não apagam produto: a FK é SET NULL.
--   - Nome único por salão, sem diferenciar maiúsculas, em fornecedor, marca e
--     categoria.
--
-- Padrão multi-tenant das anteriores: salon_id + FK cascade do salão + RLS ON +
-- policy deny_all + REVOKE de anon/authenticated. Aditiva. Idempotente.
--
-- ORDEM: aplicar ANTES de publicar o código da fatia 4b. Ela acrescenta colunas em
-- `products`, `stock_movements` e `financial_transactions`, e o INSERT do Drizzle
-- lista todas as colunas: sem elas, cadastrar produto, faturar comanda e lançar no
-- financeiro falhariam em qualquer ambiente com o código novo. O código antigo
-- continua funcionando depois da 046: as colunas novas aceitam NULL.

-- ---------------------------------------------------------------------------
-- suppliers
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.suppliers (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  salon_id   uuid NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,
  name       text NOT NULL,
  -- CPF (11 dígitos) ou CNPJ (14 caracteres), sem pontuação.
  document   text,
  phone      text,
  email      text,
  notes      text,
  is_active  boolean NOT NULL DEFAULT true,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT suppliers_name_check CHECK (length(btrim(name)) > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS suppliers_salon_name_unique
  ON public.suppliers (salon_id, lower(name));

ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS deny_all_suppliers ON public.suppliers;
CREATE POLICY deny_all_suppliers ON public.suppliers
  FOR ALL USING (false) WITH CHECK (false);
REVOKE ALL ON TABLE public.suppliers FROM anon, authenticated;

-- ---------------------------------------------------------------------------
-- product_brands / product_categories
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.product_brands (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  salon_id   uuid NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,
  name       text NOT NULL,
  created_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT product_brands_name_check CHECK (length(btrim(name)) > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS product_brands_salon_name_unique
  ON public.product_brands (salon_id, lower(name));

ALTER TABLE public.product_brands ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS deny_all_product_brands ON public.product_brands;
CREATE POLICY deny_all_product_brands ON public.product_brands
  FOR ALL USING (false) WITH CHECK (false);
REVOKE ALL ON TABLE public.product_brands FROM anon, authenticated;

CREATE TABLE IF NOT EXISTS public.product_categories (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  salon_id   uuid NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,
  name       text NOT NULL,
  created_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT product_categories_name_check CHECK (length(btrim(name)) > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS product_categories_salon_name_unique
  ON public.product_categories (salon_id, lower(name));

ALTER TABLE public.product_categories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS deny_all_product_categories ON public.product_categories;
CREATE POLICY deny_all_product_categories ON public.product_categories
  FOR ALL USING (false) WITH CHECK (false);
REVOKE ALL ON TABLE public.product_categories FROM anon, authenticated;

-- ---------------------------------------------------------------------------
-- products: marca e categoria
-- ---------------------------------------------------------------------------
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS brand_id uuid
    REFERENCES public.product_brands(id) ON DELETE SET NULL;

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS category_id uuid
    REFERENCES public.product_categories(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS products_brand_idx
  ON public.products (brand_id)
  WHERE brand_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS products_category_idx
  ON public.products (category_id)
  WHERE category_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- purchases
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.purchases (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  salon_id        uuid NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,
  -- SET NULL só como rede: o serviço barra excluir fornecedor que tem compra.
  supplier_id     uuid REFERENCES public.suppliers(id) ON DELETE SET NULL,
  -- Dia de calendário em Brasília.
  purchased_on    date NOT NULL,
  invoice_number  text,
  notes           text,
  -- Soma dos itens (quantidade × custo unitário).
  items_amount    numeric(12,2) NOT NULL,
  -- Frete e outros custos da nota que não são produto.
  freight_amount  numeric(12,2) NOT NULL DEFAULT 0,
  discount_amount numeric(12,2) NOT NULL DEFAULT 0,
  -- O que se paga ao fornecedor.
  total_amount    numeric(12,2) NOT NULL,
  created_by      uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at      timestamp NOT NULL DEFAULT now(),
  CONSTRAINT purchases_amounts_check CHECK (
    items_amount >= 0 AND freight_amount >= 0 AND discount_amount >= 0 AND total_amount >= 0 AND
    total_amount = items_amount + freight_amount - discount_amount
  )
);

-- A lista de compras do salão, da mais recente para a mais antiga.
CREATE INDEX IF NOT EXISTS purchases_salon_date_idx
  ON public.purchases (salon_id, purchased_on DESC, created_at DESC);
-- As compras de um fornecedor (e a trava de exclusão dele).
CREATE INDEX IF NOT EXISTS purchases_supplier_idx
  ON public.purchases (supplier_id)
  WHERE supplier_id IS NOT NULL;

ALTER TABLE public.purchases ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS deny_all_purchases ON public.purchases;
CREATE POLICY deny_all_purchases ON public.purchases
  FOR ALL USING (false) WITH CHECK (false);
REVOKE ALL ON TABLE public.purchases FROM anon, authenticated;

-- ---------------------------------------------------------------------------
-- purchase_items
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.purchase_items (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  salon_id      uuid NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,
  purchase_id   uuid NOT NULL REFERENCES public.purchases(id) ON DELETE CASCADE,
  position      integer NOT NULL DEFAULT 0,
  -- Sem ON DELETE, como sale_items: produto com compra não se apaga, desativa-se.
  product_id    uuid NOT NULL REFERENCES public.products(id),
  -- Cópia do nome na hora da compra: renomear o produto não muda o histórico.
  description   text NOT NULL,
  quantity      numeric(12,3) NOT NULL,
  unit_cost     numeric(12,2) NOT NULL,
  total_amount  numeric(12,2) NOT NULL,
  -- O custo de compra que o produto tinha antes desta compra. Excluir a compra
  -- devolve este valor quando o custo atual ainda é o dela.
  previous_cost numeric(12,2),
  created_at    timestamp NOT NULL DEFAULT now(),
  CONSTRAINT purchase_items_quantity_check CHECK (quantity > 0),
  CONSTRAINT purchase_items_amounts_check CHECK (unit_cost >= 0 AND total_amount >= 0)
);

CREATE INDEX IF NOT EXISTS purchase_items_purchase_idx
  ON public.purchase_items (purchase_id, position);
CREATE INDEX IF NOT EXISTS purchase_items_product_idx
  ON public.purchase_items (product_id);
CREATE INDEX IF NOT EXISTS purchase_items_salon_idx
  ON public.purchase_items (salon_id);

ALTER TABLE public.purchase_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS deny_all_purchase_items ON public.purchase_items;
CREATE POLICY deny_all_purchase_items ON public.purchase_items
  FOR ALL USING (false) WITH CHECK (false);
REVOKE ALL ON TABLE public.purchase_items FROM anon, authenticated;

-- ---------------------------------------------------------------------------
-- stock_movements: a entrada por compra
-- ---------------------------------------------------------------------------
ALTER TABLE public.stock_movements
  ADD COLUMN IF NOT EXISTS purchase_id uuid
    REFERENCES public.purchases(id) ON DELETE CASCADE;

ALTER TABLE public.stock_movements
  ADD COLUMN IF NOT EXISTS purchase_item_id uuid
    REFERENCES public.purchase_items(id) ON DELETE CASCADE;

-- Os CHECKs ficam mais largos. DROP + ADD na mesma transação: nenhuma linha
-- existente deixa de valer (todas são 'in', 'out', 'adjustment' ou 'sale').
ALTER TABLE public.stock_movements DROP CONSTRAINT IF EXISTS stock_movements_kind_check;
ALTER TABLE public.stock_movements
  ADD CONSTRAINT stock_movements_kind_check
  CHECK (kind IN ('in', 'out', 'adjustment', 'sale', 'purchase'));

ALTER TABLE public.stock_movements DROP CONSTRAINT IF EXISTS stock_movements_quantity_check;
ALTER TABLE public.stock_movements
  ADD CONSTRAINT stock_movements_quantity_check CHECK (
    quantity <> 0 AND
    (kind NOT IN ('in', 'purchase') OR quantity > 0) AND
    (kind NOT IN ('out', 'sale') OR quantity < 0)
  );

-- Só a compra aponta para compra e item, e aponta para os dois.
ALTER TABLE public.stock_movements DROP CONSTRAINT IF EXISTS stock_movements_purchase_check;
ALTER TABLE public.stock_movements
  ADD CONSTRAINT stock_movements_purchase_check CHECK (
    (kind = 'purchase') = (purchase_id IS NOT NULL) AND
    (kind = 'purchase') = (purchase_item_id IS NOT NULL)
  );

-- Excluir a compra: as entradas dela.
CREATE INDEX IF NOT EXISTS stock_movements_purchase_idx
  ON public.stock_movements (purchase_id)
  WHERE purchase_id IS NOT NULL;
-- Um item de compra dá entrada uma vez só.
CREATE UNIQUE INDEX IF NOT EXISTS stock_movements_purchase_item_unique
  ON public.stock_movements (purchase_item_id)
  WHERE purchase_item_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- financial_transactions: a conta a pagar da compra
-- ---------------------------------------------------------------------------
ALTER TABLE public.financial_transactions
  ADD COLUMN IF NOT EXISTS purchase_id uuid
    REFERENCES public.purchases(id) ON DELETE CASCADE;

ALTER TABLE public.financial_transactions
  DROP CONSTRAINT IF EXISTS financial_transactions_kind_check;
ALTER TABLE public.financial_transactions
  ADD CONSTRAINT financial_transactions_kind_check
  CHECK (kind IN ('sale', 'manual', 'transfer', 'commission', 'purchase'));

-- 'purchase' aponta para a compra e é saída. Os outros tipos não apontam.
ALTER TABLE public.financial_transactions
  DROP CONSTRAINT IF EXISTS financial_transactions_purchase_check;
ALTER TABLE public.financial_transactions
  ADD CONSTRAINT financial_transactions_purchase_check CHECK (
    (kind = 'purchase') = (purchase_id IS NOT NULL) AND
    (kind <> 'purchase' OR direction = 'out')
  );

-- As parcelas de uma compra (não é único: uma compra pode ter várias).
CREATE INDEX IF NOT EXISTS financial_transactions_purchase_idx
  ON public.financial_transactions (purchase_id)
  WHERE purchase_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Conferência
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  tabela   text;
  aberta   int;
  faltando text;
BEGIN
  FOREACH tabela IN ARRAY ARRAY['suppliers', 'product_brands', 'product_categories', 'purchases', 'purchase_items']
  LOOP
    IF to_regclass('public.' || tabela) IS NULL THEN
      RAISE EXCEPTION '046 FALHOU: tabela % não foi criada', tabela;
    END IF;

    IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = ('public.' || tabela)::regclass) THEN
      RAISE EXCEPTION '046 FALHOU: % sem RLS', tabela;
    END IF;

    SELECT count(*) INTO aberta
      FROM pg_policy
     WHERE polrelid = ('public.' || tabela)::regclass
       AND pg_get_expr(polqual, polrelid) <> 'false';

    IF aberta > 0 THEN
      RAISE EXCEPTION '046 FALHOU: % policy(ies) permissiva(s) em %', aberta, tabela;
    END IF;

    IF has_table_privilege('anon', 'public.' || tabela, 'SELECT') OR
       has_table_privilege('authenticated', 'public.' || tabela, 'SELECT') THEN
      RAISE EXCEPTION '046 FALHOU: % ainda legível por anon/authenticated', tabela;
    END IF;
  END LOOP;

  SELECT string_agg(esperada.tabela || '.' || esperada.coluna, ', ') INTO faltando
    FROM (VALUES
      ('products', 'brand_id'),
      ('products', 'category_id'),
      ('stock_movements', 'purchase_id'),
      ('stock_movements', 'purchase_item_id'),
      ('financial_transactions', 'purchase_id')
    ) AS esperada(tabela, coluna)
   WHERE NOT EXISTS (
     SELECT 1 FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name = esperada.tabela
        AND c.column_name = esperada.coluna
   );

  IF faltando IS NOT NULL THEN
    RAISE EXCEPTION '046 FALHOU: coluna(s) ausente(s): %', faltando;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.financial_transactions'::regclass
       AND conname = 'financial_transactions_kind_check'
       AND pg_get_constraintdef(oid) LIKE '%purchase%'
  ) THEN
    RAISE EXCEPTION '046 FALHOU: financial_transactions_kind_check não aceita purchase';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.stock_movements'::regclass
       AND conname = 'stock_movements_kind_check'
       AND pg_get_constraintdef(oid) LIKE '%purchase%'
  ) THEN
    RAISE EXCEPTION '046 FALHOU: stock_movements_kind_check não aceita purchase';
  END IF;

  RAISE NOTICE '046 OK: suppliers, product_brands, product_categories, purchases, purchase_items (RLS on, deny_all, REVOKE); compra no estoque e no financeiro';
END $$;
