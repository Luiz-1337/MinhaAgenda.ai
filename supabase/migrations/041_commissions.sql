-- 041_commissions.sql
-- Comissões: regras do salão, comissão por item e extrato
-- (docs/ROADMAP.md, fase 3, fatia 3a).
--
-- A comanda (037) diz o que foi vendido e por quem. Esta migration responde:
-- quanto disso é do profissional?
--
-- Três tabelas:
--   commission_settings  as regras gerais: uma linha do salão e, se houver, uma por
--                        profissional que foge da regra do salão
--   commission_rules     quanto cada item paga de comissão: padrão do salão por
--                        serviço/produto e exceção por profissional
--   commission_entries   o extrato: uma linha por item de comanda FATURADA, com a
--                        conta já feita e gravada
--
-- Decisões que o SQL carrega:
--   - Sobrescrita por profissional é coluna NULA: em commission_settings, NULL numa
--     regra quer dizer "segue o salão". Na linha do salão (professional_id NULL),
--     NULL quer dizer "padrão do sistema".
--   - Uma regra por alvo: índices únicos parciais separam a regra do salão (sem
--     profissional) da exceção do profissional, para serviço e para produto.
--   - O extrato é FOTOGRAFIA, não consulta: a comissão é calculada quando a comanda
--     é faturada e fica gravada. Mudar a regra depois não mexe no que já foi
--     calculado (há um "recalcular período" explícito na tela).
--   - As linhas do extrato somem com a comanda ou com o item (ON DELETE CASCADE).
--     Reabrir a comanda apaga as linhas pelo código, na mesma transação.
--   - `role` já aceita 'assistant' para a comissão de auxiliar (fatia 3b); a 3a só
--     grava 'professional'.
--   - `release_date` é o dia em que a comissão fica disponível. NULL = ainda
--     depende de o cliente pagar (regra "disponibilidade" com valor em aberto).
--
-- Padrão multi-tenant de 020/029/034/036/037/038/039: salon_id + FK cascade do
-- salão + RLS ON + policy deny_all + REVOKE de anon/authenticated (acesso só via
-- Drizzle). Aditiva. Idempotente. Não toca em nenhuma tabela existente.

-- ---------------------------------------------------------------------------
-- commission_settings
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.commission_settings (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  salon_id        uuid NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,
  -- NULL = regra do salão. Preenchido = exceção daquele profissional.
  professional_id uuid REFERENCES public.professionals(id) ON DELETE CASCADE,
  date_basis      text,
  fee_mode        text,
  discount_mode   text,
  created_at      timestamp NOT NULL DEFAULT now(),
  updated_at      timestamp NOT NULL DEFAULT now(),
  CONSTRAINT commission_settings_date_basis_check
    CHECK (date_basis IS NULL OR date_basis IN ('competence', 'availability')),
  CONSTRAINT commission_settings_fee_mode_check
    CHECK (fee_mode IS NULL OR fee_mode IN ('proportional', 'salon', 'professional', 'split')),
  CONSTRAINT commission_settings_discount_mode_check
    CHECK (discount_mode IS NULL OR discount_mode IN ('proportional', 'salon', 'professional', 'split'))
);

-- Uma linha do salão; uma linha por profissional.
CREATE UNIQUE INDEX IF NOT EXISTS commission_settings_salon_unique
  ON public.commission_settings (salon_id)
  WHERE professional_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS commission_settings_professional_unique
  ON public.commission_settings (professional_id)
  WHERE professional_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS commission_settings_salon_idx
  ON public.commission_settings (salon_id);

-- ---------------------------------------------------------------------------
-- commission_rules
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.commission_rules (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  salon_id        uuid NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,
  -- NULL = padrão do salão para o item. Preenchido = exceção do profissional.
  professional_id uuid REFERENCES public.professionals(id) ON DELETE CASCADE,
  service_id      uuid REFERENCES public.services(id) ON DELETE CASCADE,
  product_id      uuid REFERENCES public.products(id) ON DELETE CASCADE,
  -- 'percent': value é o percentual (0 a 100). 'fixed': value é reais por unidade.
  kind            text NOT NULL,
  value           numeric(12,2) NOT NULL,
  created_at      timestamp NOT NULL DEFAULT now(),
  updated_at      timestamp NOT NULL DEFAULT now(),
  CONSTRAINT commission_rules_kind_check CHECK (kind IN ('percent', 'fixed')),
  CONSTRAINT commission_rules_value_check CHECK (value >= 0 AND (kind <> 'percent' OR value <= 100)),
  -- A regra é de UM serviço ou de UM produto.
  CONSTRAINT commission_rules_target_check CHECK (num_nonnulls(service_id, product_id) = 1)
);

CREATE UNIQUE INDEX IF NOT EXISTS commission_rules_salon_service_unique
  ON public.commission_rules (salon_id, service_id)
  WHERE professional_id IS NULL AND service_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS commission_rules_salon_product_unique
  ON public.commission_rules (salon_id, product_id)
  WHERE professional_id IS NULL AND product_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS commission_rules_professional_service_unique
  ON public.commission_rules (professional_id, service_id)
  WHERE professional_id IS NOT NULL AND service_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS commission_rules_professional_product_unique
  ON public.commission_rules (professional_id, product_id)
  WHERE professional_id IS NOT NULL AND product_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS commission_rules_salon_idx
  ON public.commission_rules (salon_id);

-- ---------------------------------------------------------------------------
-- commission_entries
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.commission_entries (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  salon_id        uuid NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,
  sale_id         uuid NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
  sale_item_id    uuid NOT NULL REFERENCES public.sale_items(id) ON DELETE CASCADE,
  professional_id uuid NOT NULL REFERENCES public.professionals(id),
  role            text NOT NULL DEFAULT 'professional',
  -- Sobre quanto a comissão foi calculada (depende de quem arca com o desconto).
  base_amount     numeric(12,2) NOT NULL,
  -- A regra usada, copiada: mudar a regra depois não muda o histórico.
  rate_kind       text NOT NULL,
  rate_value      numeric(12,2) NOT NULL,
  -- Comissão antes da taxa da forma de pagamento.
  gross_amount    numeric(12,2) NOT NULL,
  -- Parcela da taxa que coube ao profissional.
  fee_amount      numeric(12,2) NOT NULL DEFAULT 0,
  -- O que o profissional tem a receber: gross_amount − fee_amount, nunca negativo.
  amount          numeric(12,2) NOT NULL,
  -- Dia da comanda (calendário de Brasília).
  competence_date date NOT NULL,
  -- Dia em que fica disponível. NULL = aguardando o cliente pagar.
  release_date    date,
  created_at      timestamp NOT NULL DEFAULT now(),
  CONSTRAINT commission_entries_role_check CHECK (role IN ('professional', 'assistant')),
  CONSTRAINT commission_entries_rate_kind_check CHECK (rate_kind IN ('percent', 'fixed')),
  CONSTRAINT commission_entries_amounts_check CHECK (
    base_amount >= 0 AND rate_value >= 0 AND gross_amount >= 0 AND fee_amount >= 0
    AND amount >= 0 AND amount <= gross_amount
  )
);

-- Uma linha por item, profissional e papel.
CREATE UNIQUE INDEX IF NOT EXISTS commission_entries_item_unique
  ON public.commission_entries (sale_item_id, professional_id, role);
-- O extrato: comissões do salão (e de um profissional) num período.
CREATE INDEX IF NOT EXISTS commission_entries_statement_idx
  ON public.commission_entries (salon_id, professional_id, release_date);
CREATE INDEX IF NOT EXISTS commission_entries_sale_idx
  ON public.commission_entries (sale_id);

-- ---------------------------------------------------------------------------
-- RLS: deny_all + REVOKE nas três
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['commission_settings', 'commission_rules', 'commission_entries']
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'deny_all_' || t, t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL USING (false) WITH CHECK (false)',
      'deny_all_' || t, t
    );
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon, authenticated', t);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- Conferência
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  t text;
  aberta int;
  sem_rls int;
BEGIN
  FOREACH t IN ARRAY ARRAY['commission_settings', 'commission_rules', 'commission_entries']
  LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      RAISE EXCEPTION '041 FALHOU: tabela % não foi criada', t;
    END IF;
  END LOOP;

  SELECT count(*) INTO sem_rls
    FROM pg_class
   WHERE oid IN (
           'public.commission_settings'::regclass,
           'public.commission_rules'::regclass,
           'public.commission_entries'::regclass
         )
     AND NOT relrowsecurity;

  IF sem_rls > 0 THEN
    RAISE EXCEPTION '041 FALHOU: % tabela(s) sem RLS', sem_rls;
  END IF;

  SELECT count(*) INTO aberta
    FROM pg_policy
   WHERE polrelid IN (
           'public.commission_settings'::regclass,
           'public.commission_rules'::regclass,
           'public.commission_entries'::regclass
         )
     AND pg_get_expr(polqual, polrelid) <> 'false';

  IF aberta > 0 THEN
    RAISE EXCEPTION '041 FALHOU: % policy(ies) permissiva(s) nas tabelas de comissão', aberta;
  END IF;

  RAISE NOTICE '041 OK: commission_settings, commission_rules, commission_entries (RLS on, deny_all, REVOKE)';
END $$;
