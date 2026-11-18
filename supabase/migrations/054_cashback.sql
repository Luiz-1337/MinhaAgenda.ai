-- 054_cashback.sql
-- Cashback: o cliente ganha crédito ao comprar e usa numa próxima comanda
-- (docs/ROADMAP.md, fase 6, fatia 6a).
--
--   cashback_settings          a configuração do salão: ligado, valor padrão, mínimo para resgate
--   cashback_rules             o valor de cashback de um serviço ou produto (sobrescreve o padrão)
--   cashback_entries           o extrato do cliente: ganho, resgate e ajuste manual
--   sales.cashback_redeemed    quanto da comanda foi pago com cashback
--
-- Decisões que o SQL carrega:
--   - O saldo do cliente NÃO é coluna: é a soma do extrato. Ganho é positivo,
--     resgate é negativo, ajuste tem o sinal que tiver.
--   - Ganho e resgate nascem no faturamento e apontam para a comanda com CASCADE;
--     o serviço apaga os dois na reabertura (depois de conferir que o saldo não
--     fica negativo).
--   - Resgate não é pagamento: não entra em sale_payments, não gera conta a
--     receber nem taxa. É quanto da comanda o salão deixou de receber.
--   - Regra por item: valor 0 = usa o padrão do salão; inativa = o item não dá
--     cashback.
--
-- Padrão multi-tenant das anteriores: salon_id + FK cascade do salão + RLS ON +
-- policy deny_all + REVOKE de anon/authenticated. Aditiva. Idempotente.
--
-- ORDEM: aplicar ANTES de publicar o código da fatia 6a. Ela acrescenta a coluna
-- `cashback_redeemed` em `sales`, e o INSERT do Drizzle lista todas as colunas:
-- sem ela, criar qualquer comanda falharia com o código novo. O código anterior
-- continua funcionando depois da 054: a coluna nova tem default.

-- ---------------------------------------------------------------------------
-- cashback_settings
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.cashback_settings (
  salon_id      uuid PRIMARY KEY REFERENCES public.salons(id) ON DELETE CASCADE,
  is_enabled    boolean NOT NULL DEFAULT false,
  -- Valor padrão: percentual do item ou valor fixo por unidade.
  default_kind  text NOT NULL DEFAULT 'percent',
  default_value numeric(12,2) NOT NULL DEFAULT 0,
  -- Saldo mínimo para o cliente poder resgatar.
  min_redeem    numeric(12,2) NOT NULL DEFAULT 0,
  created_at    timestamp NOT NULL DEFAULT now(),
  updated_at    timestamp NOT NULL DEFAULT now(),
  CONSTRAINT cashback_settings_kind_check CHECK (default_kind IN ('percent', 'fixed')),
  CONSTRAINT cashback_settings_value_check
    CHECK (default_value >= 0 AND (default_kind <> 'percent' OR default_value <= 100)),
  CONSTRAINT cashback_settings_min_check CHECK (min_redeem >= 0)
);

ALTER TABLE public.cashback_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS deny_all_cashback_settings ON public.cashback_settings;
CREATE POLICY deny_all_cashback_settings ON public.cashback_settings
  FOR ALL USING (false) WITH CHECK (false);
REVOKE ALL ON TABLE public.cashback_settings FROM anon, authenticated;

-- ---------------------------------------------------------------------------
-- cashback_rules
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.cashback_rules (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  salon_id   uuid NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,
  service_id uuid REFERENCES public.services(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.products(id) ON DELETE CASCADE,
  kind       text NOT NULL DEFAULT 'percent',
  -- 0 = usa o padrão do salão.
  value      numeric(12,2) NOT NULL DEFAULT 0,
  -- Inativa = o item não dá cashback.
  is_active  boolean NOT NULL DEFAULT true,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT cashback_rules_kind_check CHECK (kind IN ('percent', 'fixed')),
  CONSTRAINT cashback_rules_value_check CHECK (value >= 0 AND (kind <> 'percent' OR value <= 100)),
  CONSTRAINT cashback_rules_reference_check CHECK (
    (service_id IS NOT NULL AND product_id IS NULL) OR (service_id IS NULL AND product_id IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS cashback_rules_service_unique
  ON public.cashback_rules (salon_id, service_id) WHERE service_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS cashback_rules_product_unique
  ON public.cashback_rules (salon_id, product_id) WHERE product_id IS NOT NULL;

ALTER TABLE public.cashback_rules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS deny_all_cashback_rules ON public.cashback_rules;
CREATE POLICY deny_all_cashback_rules ON public.cashback_rules
  FOR ALL USING (false) WITH CHECK (false);
REVOKE ALL ON TABLE public.cashback_rules FROM anon, authenticated;

-- ---------------------------------------------------------------------------
-- sales.cashback_redeemed
-- ---------------------------------------------------------------------------
ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS cashback_redeemed numeric(12,2) NOT NULL DEFAULT 0;

-- Só comanda faturada usa cashback, e nunca mais do que o total.
ALTER TABLE public.sales DROP CONSTRAINT IF EXISTS sales_cashback_redeemed_check;
ALTER TABLE public.sales
  ADD CONSTRAINT sales_cashback_redeemed_check CHECK (
    cashback_redeemed >= 0 AND cashback_redeemed <= total AND (cashback_redeemed = 0 OR status = 'invoiced')
  );

-- ---------------------------------------------------------------------------
-- cashback_entries
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.cashback_entries (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  salon_id     uuid NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,
  -- Sem ON DELETE, como sales: cliente com extrato não se apaga.
  customer_id  uuid NOT NULL REFERENCES public.customers(id),
  -- earn = ganho numa comanda · redeem = usado numa comanda · adjustment = lançado à mão
  kind         text NOT NULL,
  -- Com sinal: ganho > 0, resgate < 0, ajuste ≠ 0.
  amount       numeric(12,2) NOT NULL,
  sale_id      uuid REFERENCES public.sales(id) ON DELETE CASCADE,
  -- O item que gerou o ganho. NULL no resgate e no ajuste.
  sale_item_id uuid REFERENCES public.sale_items(id) ON DELETE CASCADE,
  -- O motivo do ajuste manual.
  reason       text,
  created_by   uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at   timestamp NOT NULL DEFAULT now(),
  CONSTRAINT cashback_entries_kind_check CHECK (kind IN ('earn', 'redeem', 'adjustment')),
  CONSTRAINT cashback_entries_amount_check CHECK (
    (kind = 'earn' AND amount > 0) OR (kind = 'redeem' AND amount < 0) OR (kind = 'adjustment' AND amount <> 0)
  ),
  CONSTRAINT cashback_entries_origin_check CHECK (
    (kind IN ('earn', 'redeem') AND sale_id IS NOT NULL) OR
    (kind = 'adjustment' AND sale_id IS NULL AND sale_item_id IS NULL AND reason IS NOT NULL)
  )
);

-- O saldo e o extrato de um cliente.
CREATE INDEX IF NOT EXISTS cashback_entries_customer_idx
  ON public.cashback_entries (salon_id, customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS cashback_entries_sale_idx
  ON public.cashback_entries (sale_id) WHERE sale_id IS NOT NULL;
-- Um resgate por comanda.
CREATE UNIQUE INDEX IF NOT EXISTS cashback_entries_sale_redeem_unique
  ON public.cashback_entries (sale_id) WHERE kind = 'redeem';

ALTER TABLE public.cashback_entries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS deny_all_cashback_entries ON public.cashback_entries;
CREATE POLICY deny_all_cashback_entries ON public.cashback_entries
  FOR ALL USING (false) WITH CHECK (false);
REVOKE ALL ON TABLE public.cashback_entries FROM anon, authenticated;

-- ---------------------------------------------------------------------------
-- Conferência
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  tabela   text;
  aberta   int;
BEGIN
  FOREACH tabela IN ARRAY ARRAY['cashback_settings', 'cashback_rules', 'cashback_entries'] LOOP
    IF to_regclass('public.' || tabela) IS NULL THEN
      RAISE EXCEPTION '054 FALHOU: tabela % não foi criada', tabela;
    END IF;

    IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = ('public.' || tabela)::regclass) THEN
      RAISE EXCEPTION '054 FALHOU: % sem RLS', tabela;
    END IF;

    SELECT count(*) INTO aberta
      FROM pg_policy
     WHERE polrelid = ('public.' || tabela)::regclass
       AND pg_get_expr(polqual, polrelid) <> 'false';

    IF aberta > 0 THEN
      RAISE EXCEPTION '054 FALHOU: % policy(ies) permissiva(s) em %', aberta, tabela;
    END IF;

    IF has_table_privilege('anon', 'public.' || tabela, 'SELECT') OR
       has_table_privilege('authenticated', 'public.' || tabela, 'SELECT') THEN
      RAISE EXCEPTION '054 FALHOU: % ainda legível por anon/authenticated', tabela;
    END IF;
  END LOOP;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'sales' AND column_name = 'cashback_redeemed'
  ) THEN
    RAISE EXCEPTION '054 FALHOU: sales.cashback_redeemed ausente';
  END IF;

  RAISE NOTICE '054 OK: cashback_settings, cashback_rules, cashback_entries (RLS on, deny_all, REVOKE), sales.cashback_redeemed';
END $$;
