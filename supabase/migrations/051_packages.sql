-- 051_packages.sql
-- Pacotes: pacotes predefinidos e venda de pacote pela comanda
-- (docs/ROADMAP.md, fase 5, fatia 5a).
--
-- Um pacote predefinido é um modelo ("5 sessões de laser por R$ 900, vale 6
-- meses"). Vender é pôr o modelo como item da comanda; quando a comanda é
-- faturada, nasce o pacote do cliente, com os itens e as quantidades do modelo.
--
--   package_templates          o modelo: nome, preço, validade em dias, ativo
--   package_template_items     o que o modelo inclui: serviço ou produto e quantidade
--   sale_items.kind='package'  a venda do pacote, como item da comanda
--   customer_packages          o pacote do cliente, nascido do item faturado
--   customer_package_items     o que o pacote do cliente inclui (cópia do modelo)
--
-- Decisões que o SQL carrega:
--   - Vender pacote é um item da comanda: o pagamento, o financeiro, o caixa e o
--     débito (fiado) da comanda valem sem nada novo.
--   - O pacote do cliente aponta para o item da comanda com CASCADE, e o item de
--     pacote tem quantidade 1 (um item = um pacote). Reabrir a comanda apaga o
--     pacote (o serviço faz isso explicitamente).
--   - O pacote do cliente COPIA nome, itens, quantidades e preço do modelo no
--     faturamento: mudar o modelo depois não muda o que já foi vendido.
--   - Modelo vendido não se apaga (FK sem ON DELETE): desativa-se.
--   - Quantidade dos itens é inteira (sessões, unidades).
--
-- Padrão multi-tenant das anteriores: salon_id + FK cascade do salão + RLS ON +
-- policy deny_all + REVOKE de anon/authenticated. Aditiva. Idempotente.
--
-- ORDEM: aplicar ANTES de publicar o código da fatia 5a. Ela acrescenta a coluna
-- `package_template_id` em `sale_items`, e o INSERT do Drizzle lista todas as
-- colunas: sem ela, salvar qualquer comanda falharia com o código novo. O código
-- antigo continua funcionando depois da 051: a coluna nova aceita NULL e os CHECKs
-- novos aceitam todas as linhas que existem.

-- ---------------------------------------------------------------------------
-- package_templates
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.package_templates (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  salon_id      uuid NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,
  name          text NOT NULL,
  description   text,
  price         numeric(12,2) NOT NULL DEFAULT 0,
  -- Validade a partir da data da venda. NULL = não vence.
  validity_days integer,
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamp NOT NULL DEFAULT now(),
  updated_at    timestamp NOT NULL DEFAULT now(),
  CONSTRAINT package_templates_price_check CHECK (price >= 0),
  CONSTRAINT package_templates_validity_check
    CHECK (validity_days IS NULL OR (validity_days >= 1 AND validity_days <= 3650))
);

-- Nome único no salão, sem diferença de maiúscula.
CREATE UNIQUE INDEX IF NOT EXISTS package_templates_salon_name_unique
  ON public.package_templates (salon_id, lower(name));

ALTER TABLE public.package_templates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS deny_all_package_templates ON public.package_templates;
CREATE POLICY deny_all_package_templates ON public.package_templates
  FOR ALL USING (false) WITH CHECK (false);
REVOKE ALL ON TABLE public.package_templates FROM anon, authenticated;

-- ---------------------------------------------------------------------------
-- package_template_items
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.package_template_items (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  salon_id    uuid NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,
  template_id uuid NOT NULL REFERENCES public.package_templates(id) ON DELETE CASCADE,
  position    integer NOT NULL DEFAULT 0,
  kind        text NOT NULL,
  -- Sem ON DELETE, como sale_items: serviço ou produto num pacote não se apaga.
  service_id  uuid REFERENCES public.services(id),
  product_id  uuid REFERENCES public.products(id),
  quantity    integer NOT NULL,
  CONSTRAINT package_template_items_kind_check CHECK (kind IN ('service', 'product')),
  CONSTRAINT package_template_items_reference_check CHECK (
    (kind = 'service' AND service_id IS NOT NULL AND product_id IS NULL) OR
    (kind = 'product' AND product_id IS NOT NULL AND service_id IS NULL)
  ),
  CONSTRAINT package_template_items_quantity_check CHECK (quantity >= 1 AND quantity <= 999)
);

CREATE INDEX IF NOT EXISTS package_template_items_template_idx
  ON public.package_template_items (template_id, position);
-- O mesmo serviço (ou produto) aparece uma vez por modelo.
CREATE UNIQUE INDEX IF NOT EXISTS package_template_items_service_unique
  ON public.package_template_items (template_id, service_id)
  WHERE service_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS package_template_items_product_unique
  ON public.package_template_items (template_id, product_id)
  WHERE product_id IS NOT NULL;

ALTER TABLE public.package_template_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS deny_all_package_template_items ON public.package_template_items;
CREATE POLICY deny_all_package_template_items ON public.package_template_items
  FOR ALL USING (false) WITH CHECK (false);
REVOKE ALL ON TABLE public.package_template_items FROM anon, authenticated;

-- ---------------------------------------------------------------------------
-- sale_items: o item de pacote
-- ---------------------------------------------------------------------------
ALTER TABLE public.sale_items
  ADD COLUMN IF NOT EXISTS package_template_id uuid REFERENCES public.package_templates(id);

-- Os CHECKs ficam mais largos. DROP + ADD na mesma transação: nenhuma linha
-- existente deixa de valer (todas têm package_template_id NULL).
ALTER TABLE public.sale_items DROP CONSTRAINT IF EXISTS sale_items_kind_check;
ALTER TABLE public.sale_items
  ADD CONSTRAINT sale_items_kind_check CHECK (kind IN ('service', 'product', 'package'));

ALTER TABLE public.sale_items DROP CONSTRAINT IF EXISTS sale_items_reference_check;
ALTER TABLE public.sale_items
  ADD CONSTRAINT sale_items_reference_check CHECK (
    (kind = 'service' AND service_id IS NOT NULL AND product_id IS NULL AND package_template_id IS NULL) OR
    (kind = 'product' AND product_id IS NOT NULL AND service_id IS NULL AND package_template_id IS NULL) OR
    (kind = 'package' AND package_template_id IS NOT NULL AND service_id IS NULL AND product_id IS NULL)
  );

-- Um item de pacote é UM pacote.
ALTER TABLE public.sale_items DROP CONSTRAINT IF EXISTS sale_items_package_quantity_check;
ALTER TABLE public.sale_items
  ADD CONSTRAINT sale_items_package_quantity_check CHECK (kind <> 'package' OR quantity = 1);

CREATE INDEX IF NOT EXISTS sale_items_package_template_idx
  ON public.sale_items (package_template_id)
  WHERE package_template_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- customer_packages
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.customer_packages (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  salon_id     uuid NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,
  -- Sem ON DELETE, como sales: cliente com pacote não se apaga.
  customer_id  uuid NOT NULL REFERENCES public.customers(id),
  sale_id      uuid NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
  -- O item faturado que gerou o pacote. CASCADE: o item some, o pacote some.
  sale_item_id uuid NOT NULL REFERENCES public.sale_items(id) ON DELETE CASCADE,
  -- Sem ON DELETE: modelo vendido não se apaga, desativa-se.
  template_id  uuid NOT NULL REFERENCES public.package_templates(id),
  -- Cópia do nome do modelo na venda.
  name         text NOT NULL,
  -- Dia da comanda (Brasília) e até quando vale. NULL = não vence.
  sold_on      date NOT NULL,
  expires_on   date,
  -- Quem vendeu (o profissional do item da comanda), se informado.
  seller_id    uuid REFERENCES public.professionals(id),
  -- O que o cliente pagou pelo pacote: o total do item.
  price        numeric(12,2) NOT NULL DEFAULT 0,
  created_at   timestamp NOT NULL DEFAULT now(),
  CONSTRAINT customer_packages_price_check CHECK (price >= 0),
  CONSTRAINT customer_packages_expiry_check CHECK (expires_on IS NULL OR expires_on >= sold_on)
);

-- Um item de comanda gera um pacote só.
CREATE UNIQUE INDEX IF NOT EXISTS customer_packages_sale_item_unique
  ON public.customer_packages (sale_item_id);
-- Pacotes vendidos do salão, do mais recente para o mais antigo.
CREATE INDEX IF NOT EXISTS customer_packages_salon_idx
  ON public.customer_packages (salon_id, sold_on DESC);
-- Os pacotes de um cliente (ficha do cliente, uso na comanda).
CREATE INDEX IF NOT EXISTS customer_packages_customer_idx
  ON public.customer_packages (customer_id);
CREATE INDEX IF NOT EXISTS customer_packages_sale_idx
  ON public.customer_packages (sale_id);
CREATE INDEX IF NOT EXISTS customer_packages_template_idx
  ON public.customer_packages (template_id);

ALTER TABLE public.customer_packages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS deny_all_customer_packages ON public.customer_packages;
CREATE POLICY deny_all_customer_packages ON public.customer_packages
  FOR ALL USING (false) WITH CHECK (false);
REVOKE ALL ON TABLE public.customer_packages FROM anon, authenticated;

-- ---------------------------------------------------------------------------
-- customer_package_items
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.customer_package_items (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  salon_id            uuid NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,
  customer_package_id uuid NOT NULL REFERENCES public.customer_packages(id) ON DELETE CASCADE,
  position            integer NOT NULL DEFAULT 0,
  kind                text NOT NULL,
  service_id          uuid REFERENCES public.services(id),
  product_id          uuid REFERENCES public.products(id),
  -- Cópia do nome na venda.
  description         text NOT NULL,
  quantity            integer NOT NULL,
  CONSTRAINT customer_package_items_kind_check CHECK (kind IN ('service', 'product')),
  CONSTRAINT customer_package_items_reference_check CHECK (
    (kind = 'service' AND service_id IS NOT NULL AND product_id IS NULL) OR
    (kind = 'product' AND product_id IS NOT NULL AND service_id IS NULL)
  ),
  CONSTRAINT customer_package_items_quantity_check CHECK (quantity >= 1)
);

CREATE INDEX IF NOT EXISTS customer_package_items_package_idx
  ON public.customer_package_items (customer_package_id, position);

ALTER TABLE public.customer_package_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS deny_all_customer_package_items ON public.customer_package_items;
CREATE POLICY deny_all_customer_package_items ON public.customer_package_items
  FOR ALL USING (false) WITH CHECK (false);
REVOKE ALL ON TABLE public.customer_package_items FROM anon, authenticated;

-- ---------------------------------------------------------------------------
-- Conferência
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  tabela   text;
  aberta   int;
BEGIN
  FOREACH tabela IN ARRAY ARRAY[
    'package_templates', 'package_template_items', 'customer_packages', 'customer_package_items'
  ] LOOP
    IF to_regclass('public.' || tabela) IS NULL THEN
      RAISE EXCEPTION '051 FALHOU: tabela % não foi criada', tabela;
    END IF;

    IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = ('public.' || tabela)::regclass) THEN
      RAISE EXCEPTION '051 FALHOU: % sem RLS', tabela;
    END IF;

    SELECT count(*) INTO aberta
      FROM pg_policy
     WHERE polrelid = ('public.' || tabela)::regclass
       AND pg_get_expr(polqual, polrelid) <> 'false';

    IF aberta > 0 THEN
      RAISE EXCEPTION '051 FALHOU: % policy(ies) permissiva(s) em %', aberta, tabela;
    END IF;

    IF has_table_privilege('anon', 'public.' || tabela, 'SELECT') OR
       has_table_privilege('authenticated', 'public.' || tabela, 'SELECT') THEN
      RAISE EXCEPTION '051 FALHOU: % ainda legível por anon/authenticated', tabela;
    END IF;
  END LOOP;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'sale_items' AND column_name = 'package_template_id'
  ) THEN
    RAISE EXCEPTION '051 FALHOU: sale_items.package_template_id ausente';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.sale_items'::regclass
       AND conname = 'sale_items_kind_check'
       AND pg_get_constraintdef(oid) LIKE '%package%'
  ) THEN
    RAISE EXCEPTION '051 FALHOU: sale_items_kind_check não aceita package';
  END IF;

  RAISE NOTICE '051 OK: package_templates, package_template_items, customer_packages, customer_package_items (RLS on, deny_all, REVOKE), item de pacote em sale_items';
END $$;
