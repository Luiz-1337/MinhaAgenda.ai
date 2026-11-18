-- 053_subscriptions.sql
-- Assinaturas de cliente: planos, assinaturas e renovação pela comanda
-- (docs/ROADMAP.md, fase 5, fatia 5c).
--
-- Um plano de assinatura é um modelo ("Clube mensal por R$ 120"). A assinatura é
-- o plano de UM cliente. Renovar é cobrar: um item de assinatura numa comanda;
-- quando a comanda é faturada, nasce um período pago, e a assinatura fica ativa
-- até o vencimento dele.
--
--   subscription_plans             o modelo: nome, valor, periodicidade, ativo, visível
--   customer_subscriptions         a assinatura do cliente (cópia do plano)
--   sale_items.kind='subscription' a cobrança, como item da comanda
--   customer_subscription_periods  o período pago, nascido do item faturado
--
-- Decisões que o SQL carrega:
--   - A cobrança é um item da comanda: pagamento, financeiro, caixa e fiado valem
--     sem nada novo (como o pacote, migration 051).
--   - A situação NÃO é coluna: sai dos períodos (sem período = pendente; último
--     vencimento de hoje em diante = ativa; passado = expirada) e de
--     `deactivated_at` (desativada). Reabrir a comanda apaga o período e a
--     situação volta sozinha.
--   - O período aponta para o item da comanda com CASCADE; o serviço apaga o
--     período explicitamente na reabertura.
--   - A assinatura COPIA nome, valor e periodicidade do plano: mudar o plano não
--     muda quem já assina.
--   - Plano com assinatura e assinatura já cobrada não se apagam (FK sem ON
--     DELETE): desativam-se.
--   - Uma assinatura em vigor por cliente e plano (índice único parcial).
--
-- Padrão multi-tenant das anteriores: salon_id + FK cascade do salão + RLS ON +
-- policy deny_all + REVOKE de anon/authenticated. Aditiva. Idempotente.
--
-- ORDEM: aplicar ANTES de publicar o código da fatia 5c. Ela acrescenta a coluna
-- `customer_subscription_id` em `sale_items`, e o INSERT do Drizzle lista todas as
-- colunas: sem ela, salvar qualquer comanda falharia com o código novo. O código
-- da 5b continua funcionando depois da 053: a coluna nova aceita NULL e os CHECKs
-- novos aceitam todas as linhas que existem.

-- ---------------------------------------------------------------------------
-- subscription_plans
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.subscription_plans (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  salon_id        uuid NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,
  name            text NOT NULL,
  description     text,
  price           numeric(12,2) NOT NULL DEFAULT 0,
  -- De quanto em quanto tempo se cobra, em meses (1 = mensal, 12 = anual).
  interval_months integer NOT NULL DEFAULT 1,
  -- Situação: inativo não aceita assinatura nova.
  is_active       boolean NOT NULL DEFAULT true,
  -- Visível: aparece na página pública de planos (fase 8). Hoje só é guardado.
  is_visible      boolean NOT NULL DEFAULT false,
  created_at      timestamp NOT NULL DEFAULT now(),
  updated_at      timestamp NOT NULL DEFAULT now(),
  CONSTRAINT subscription_plans_price_check CHECK (price >= 0),
  CONSTRAINT subscription_plans_interval_check CHECK (interval_months >= 1 AND interval_months <= 36)
);

CREATE UNIQUE INDEX IF NOT EXISTS subscription_plans_salon_name_unique
  ON public.subscription_plans (salon_id, lower(name));

ALTER TABLE public.subscription_plans ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS deny_all_subscription_plans ON public.subscription_plans;
CREATE POLICY deny_all_subscription_plans ON public.subscription_plans
  FOR ALL USING (false) WITH CHECK (false);
REVOKE ALL ON TABLE public.subscription_plans FROM anon, authenticated;

-- ---------------------------------------------------------------------------
-- customer_subscriptions
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.customer_subscriptions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  salon_id        uuid NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,
  -- Sem ON DELETE, como sales: cliente com assinatura não se apaga.
  customer_id     uuid NOT NULL REFERENCES public.customers(id),
  -- Sem ON DELETE: plano com assinatura não se apaga, desativa-se.
  plan_id         uuid NOT NULL REFERENCES public.subscription_plans(id),
  -- Cópias do plano no dia em que a assinatura foi criada.
  name            text NOT NULL,
  price           numeric(12,2) NOT NULL DEFAULT 0,
  interval_months integer NOT NULL DEFAULT 1,
  -- Dia em que foi criada (Brasília).
  started_on      date NOT NULL,
  -- NULL = em vigor. Preenchida = desativada (não aceita cobrança nova).
  deactivated_at  timestamp,
  created_at      timestamp NOT NULL DEFAULT now(),
  updated_at      timestamp NOT NULL DEFAULT now(),
  CONSTRAINT customer_subscriptions_price_check CHECK (price >= 0),
  CONSTRAINT customer_subscriptions_interval_check CHECK (interval_months >= 1 AND interval_months <= 36)
);

CREATE INDEX IF NOT EXISTS customer_subscriptions_salon_idx
  ON public.customer_subscriptions (salon_id, created_at DESC);
CREATE INDEX IF NOT EXISTS customer_subscriptions_customer_idx
  ON public.customer_subscriptions (customer_id);
CREATE INDEX IF NOT EXISTS customer_subscriptions_plan_idx
  ON public.customer_subscriptions (plan_id);
-- Uma assinatura em vigor por cliente e plano.
CREATE UNIQUE INDEX IF NOT EXISTS customer_subscriptions_customer_plan_unique
  ON public.customer_subscriptions (customer_id, plan_id)
  WHERE deactivated_at IS NULL;

ALTER TABLE public.customer_subscriptions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS deny_all_customer_subscriptions ON public.customer_subscriptions;
CREATE POLICY deny_all_customer_subscriptions ON public.customer_subscriptions
  FOR ALL USING (false) WITH CHECK (false);
REVOKE ALL ON TABLE public.customer_subscriptions FROM anon, authenticated;

-- ---------------------------------------------------------------------------
-- sale_items: o item de assinatura (a cobrança)
-- ---------------------------------------------------------------------------
ALTER TABLE public.sale_items
  ADD COLUMN IF NOT EXISTS customer_subscription_id uuid REFERENCES public.customer_subscriptions(id);

-- Os CHECKs ficam mais largos. DROP + ADD na mesma transação: nenhuma linha
-- existente deixa de valer (todas têm customer_subscription_id NULL).
ALTER TABLE public.sale_items DROP CONSTRAINT IF EXISTS sale_items_kind_check;
ALTER TABLE public.sale_items
  ADD CONSTRAINT sale_items_kind_check CHECK (kind IN ('service', 'product', 'package', 'subscription'));

ALTER TABLE public.sale_items DROP CONSTRAINT IF EXISTS sale_items_reference_check;
ALTER TABLE public.sale_items
  ADD CONSTRAINT sale_items_reference_check CHECK (
    (kind = 'service' AND service_id IS NOT NULL AND product_id IS NULL AND package_template_id IS NULL) OR
    (kind = 'product' AND product_id IS NOT NULL AND service_id IS NULL AND package_template_id IS NULL) OR
    (kind = 'package' AND package_template_id IS NOT NULL AND service_id IS NULL AND product_id IS NULL) OR
    (kind = 'subscription' AND service_id IS NULL AND product_id IS NULL AND package_template_id IS NULL)
  );

-- Só item de assinatura cita assinatura. O contrário não é exigido: a comanda
-- EXCLUÍDA solta a assinatura (o serviço zera a coluna), para que uma assinatura
-- criada por engano possa ser apagada.
ALTER TABLE public.sale_items DROP CONSTRAINT IF EXISTS sale_items_subscription_check;
ALTER TABLE public.sale_items
  ADD CONSTRAINT sale_items_subscription_check CHECK (
    customer_subscription_id IS NULL OR (kind = 'subscription' AND customer_package_item_id IS NULL)
  );

-- Um item de assinatura é UMA cobrança (um período).
ALTER TABLE public.sale_items DROP CONSTRAINT IF EXISTS sale_items_subscription_quantity_check;
ALTER TABLE public.sale_items
  ADD CONSTRAINT sale_items_subscription_quantity_check CHECK (kind <> 'subscription' OR quantity = 1);

CREATE INDEX IF NOT EXISTS sale_items_customer_subscription_idx
  ON public.sale_items (customer_subscription_id)
  WHERE customer_subscription_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- customer_subscription_periods
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.customer_subscription_periods (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  salon_id        uuid NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,
  -- Sem ON DELETE: assinatura cobrada não se apaga, desativa-se.
  subscription_id uuid NOT NULL REFERENCES public.customer_subscriptions(id),
  sale_id         uuid NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
  -- O item faturado que pagou o período. CASCADE: o item some, o período some.
  sale_item_id    uuid NOT NULL REFERENCES public.sale_items(id) ON DELETE CASCADE,
  -- De quando a quando vale. `period_end` é o vencimento: vale até ele, inclusive,
  -- e a renovação seguinte começa nele.
  period_start    date NOT NULL,
  period_end      date NOT NULL,
  -- O que foi cobrado: o total do item.
  amount          numeric(12,2) NOT NULL DEFAULT 0,
  created_at      timestamp NOT NULL DEFAULT now(),
  CONSTRAINT customer_subscription_periods_dates_check CHECK (period_end > period_start),
  CONSTRAINT customer_subscription_periods_amount_check CHECK (amount >= 0)
);

-- Um item de comanda paga um período só.
CREATE UNIQUE INDEX IF NOT EXISTS customer_subscription_periods_sale_item_unique
  ON public.customer_subscription_periods (sale_item_id);
-- O último período de uma assinatura (situação e vencimento).
CREATE INDEX IF NOT EXISTS customer_subscription_periods_subscription_idx
  ON public.customer_subscription_periods (subscription_id, period_end DESC);
CREATE INDEX IF NOT EXISTS customer_subscription_periods_sale_idx
  ON public.customer_subscription_periods (sale_id);
CREATE INDEX IF NOT EXISTS customer_subscription_periods_salon_idx
  ON public.customer_subscription_periods (salon_id);

ALTER TABLE public.customer_subscription_periods ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS deny_all_customer_subscription_periods ON public.customer_subscription_periods;
CREATE POLICY deny_all_customer_subscription_periods ON public.customer_subscription_periods
  FOR ALL USING (false) WITH CHECK (false);
REVOKE ALL ON TABLE public.customer_subscription_periods FROM anon, authenticated;

-- ---------------------------------------------------------------------------
-- Conferência
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  tabela   text;
  aberta   int;
BEGIN
  FOREACH tabela IN ARRAY ARRAY[
    'subscription_plans', 'customer_subscriptions', 'customer_subscription_periods'
  ] LOOP
    IF to_regclass('public.' || tabela) IS NULL THEN
      RAISE EXCEPTION '053 FALHOU: tabela % não foi criada', tabela;
    END IF;

    IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = ('public.' || tabela)::regclass) THEN
      RAISE EXCEPTION '053 FALHOU: % sem RLS', tabela;
    END IF;

    SELECT count(*) INTO aberta
      FROM pg_policy
     WHERE polrelid = ('public.' || tabela)::regclass
       AND pg_get_expr(polqual, polrelid) <> 'false';

    IF aberta > 0 THEN
      RAISE EXCEPTION '053 FALHOU: % policy(ies) permissiva(s) em %', aberta, tabela;
    END IF;

    IF has_table_privilege('anon', 'public.' || tabela, 'SELECT') OR
       has_table_privilege('authenticated', 'public.' || tabela, 'SELECT') THEN
      RAISE EXCEPTION '053 FALHOU: % ainda legível por anon/authenticated', tabela;
    END IF;
  END LOOP;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'sale_items' AND column_name = 'customer_subscription_id'
  ) THEN
    RAISE EXCEPTION '053 FALHOU: sale_items.customer_subscription_id ausente';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.sale_items'::regclass
       AND conname = 'sale_items_kind_check'
       AND pg_get_constraintdef(oid) LIKE '%subscription%'
  ) THEN
    RAISE EXCEPTION '053 FALHOU: sale_items_kind_check não aceita subscription';
  END IF;

  RAISE NOTICE '053 OK: subscription_plans, customer_subscriptions, customer_subscription_periods (RLS on, deny_all, REVOKE), item de assinatura em sale_items';
END $$;
