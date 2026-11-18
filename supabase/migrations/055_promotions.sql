-- 055_promotions.sql
-- Promoções e cupons: desconto com código, vigência e dias da semana, aplicado na
-- comanda (docs/ROADMAP.md, fase 6, fatia 6b).
--
--   promotions                 a promoção: nome, cupom, desconto, vigência, dias, ativa
--   sales.promotion_id         a promoção aplicada na comanda
--   sales.coupon_code          o código digitado (cópia: renomear o cupom não muda o histórico)
--   sale_items.coupon_discount a parte do desconto do item que veio do cupom
--
-- Decisões que o SQL carrega:
--   - O desconto do cupom entra em `sale_items.discount_amount`, junto com o
--     desconto dado à mão: total, comissão e cashback continuam lendo um desconto
--     só. `coupon_discount` guarda quanto desse desconto é do cupom (nunca mais que
--     o desconto do item), para a tela separar os dois e o relatório somar.
--   - Promoção usada em comanda não se apaga (FK sem ON DELETE): desativa-se.
--   - `weekdays` vazio = todos os dias. 0 = domingo … 6 = sábado.
--   - Cupom único no salão, sem diferença de maiúscula.
--
-- Padrão multi-tenant das anteriores: salon_id + FK cascade do salão + RLS ON +
-- policy deny_all + REVOKE de anon/authenticated. Aditiva. Idempotente.
--
-- ORDEM: aplicar ANTES de publicar o código da fatia 6b. Ela acrescenta colunas em
-- `sales` e `sale_items`, e o INSERT do Drizzle lista todas as colunas: sem elas,
-- salvar qualquer comanda falharia com o código novo. O código anterior continua
-- funcionando depois da 055: as colunas novas aceitam NULL ou têm default.

-- ---------------------------------------------------------------------------
-- promotions
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.promotions (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  salon_id       uuid NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,
  name           text NOT NULL,
  -- O cupom, em maiúsculas.
  code           text NOT NULL,
  -- Percentual sobre os itens que valem, ou valor fixo abatido da comanda.
  discount_kind  text NOT NULL DEFAULT 'percent',
  discount_value numeric(12,2) NOT NULL,
  -- Em quais itens o desconto vale.
  applies_to     text NOT NULL DEFAULT 'all',
  -- Vigência (dia da comanda em Brasília). NULL = sem começo / sem fim.
  starts_on      date,
  ends_on        date,
  -- Dias da semana em que vale. Vazio = todos. 0 = domingo … 6 = sábado.
  weekdays       integer[] NOT NULL DEFAULT '{}',
  is_active      boolean NOT NULL DEFAULT true,
  created_at     timestamp NOT NULL DEFAULT now(),
  updated_at     timestamp NOT NULL DEFAULT now(),
  CONSTRAINT promotions_kind_check CHECK (discount_kind IN ('percent', 'fixed')),
  CONSTRAINT promotions_value_check
    CHECK (discount_value > 0 AND (discount_kind <> 'percent' OR discount_value <= 100)),
  CONSTRAINT promotions_applies_check CHECK (applies_to IN ('all', 'services', 'products')),
  CONSTRAINT promotions_period_check CHECK (starts_on IS NULL OR ends_on IS NULL OR ends_on >= starts_on),
  CONSTRAINT promotions_weekdays_check CHECK (weekdays <@ ARRAY[0, 1, 2, 3, 4, 5, 6])
);

CREATE UNIQUE INDEX IF NOT EXISTS promotions_salon_code_unique
  ON public.promotions (salon_id, lower(code));

ALTER TABLE public.promotions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS deny_all_promotions ON public.promotions;
CREATE POLICY deny_all_promotions ON public.promotions
  FOR ALL USING (false) WITH CHECK (false);
REVOKE ALL ON TABLE public.promotions FROM anon, authenticated;

-- ---------------------------------------------------------------------------
-- sales: a promoção aplicada
-- ---------------------------------------------------------------------------
ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS promotion_id uuid REFERENCES public.promotions(id);
ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS coupon_code text;

-- Os dois andam juntos.
ALTER TABLE public.sales DROP CONSTRAINT IF EXISTS sales_coupon_check;
ALTER TABLE public.sales
  ADD CONSTRAINT sales_coupon_check CHECK ((promotion_id IS NULL) = (coupon_code IS NULL));

CREATE INDEX IF NOT EXISTS sales_promotion_idx
  ON public.sales (promotion_id) WHERE promotion_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- sale_items: a parte do desconto que veio do cupom
-- ---------------------------------------------------------------------------
ALTER TABLE public.sale_items
  ADD COLUMN IF NOT EXISTS coupon_discount numeric(12,2) NOT NULL DEFAULT 0;

ALTER TABLE public.sale_items DROP CONSTRAINT IF EXISTS sale_items_coupon_discount_check;
ALTER TABLE public.sale_items
  ADD CONSTRAINT sale_items_coupon_discount_check
    CHECK (coupon_discount >= 0 AND coupon_discount <= discount_amount);

-- ---------------------------------------------------------------------------
-- Conferência
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  aberta int;
BEGIN
  IF to_regclass('public.promotions') IS NULL THEN
    RAISE EXCEPTION '055 FALHOU: tabela promotions não foi criada';
  END IF;

  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.promotions'::regclass) THEN
    RAISE EXCEPTION '055 FALHOU: promotions sem RLS';
  END IF;

  SELECT count(*) INTO aberta
    FROM pg_policy
   WHERE polrelid = 'public.promotions'::regclass
     AND pg_get_expr(polqual, polrelid) <> 'false';
  IF aberta > 0 THEN
    RAISE EXCEPTION '055 FALHOU: % policy(ies) permissiva(s) em promotions', aberta;
  END IF;

  IF has_table_privilege('anon', 'public.promotions', 'SELECT') OR
     has_table_privilege('authenticated', 'public.promotions', 'SELECT') THEN
    RAISE EXCEPTION '055 FALHOU: promotions ainda legível por anon/authenticated';
  END IF;

  IF (SELECT count(*) FROM information_schema.columns
       WHERE table_schema = 'public'
         AND ((table_name = 'sales' AND column_name IN ('promotion_id', 'coupon_code'))
           OR (table_name = 'sale_items' AND column_name = 'coupon_discount'))) <> 3 THEN
    RAISE EXCEPTION '055 FALHOU: colunas de cupom ausentes em sales / sale_items';
  END IF;

  RAISE NOTICE '055 OK: promotions (RLS on, deny_all, REVOKE), cupom em sales e sale_items';
END $$;
