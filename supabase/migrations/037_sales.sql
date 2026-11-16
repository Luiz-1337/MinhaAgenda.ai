-- 037_sales.sql
-- Comandas (docs/ROADMAP.md, fase 1).
--
-- Até aqui o "valor cobrado" de um atendimento era um campo digitado ao concluir o
-- agendamento (appointments.price_charged, migration 027). Não havia venda: nem
-- item, nem produto vendido junto, nem forma de pagamento, nem taxa. A comanda é
-- esse fato — e é a base de financeiro, comissão, estoque e pacotes.
--
-- Cinco tabelas:
--   payment_methods  formas de pagamento do salão (taxa e prazo de recebimento)
--   sale_counters    numeração sequencial por salão
--   sales            a comanda: open (Pendente) → invoiced (Finalizado); void (Excluída)
--   sale_items       serviço ou produto, com profissional, quantidade e desconto
--   sale_payments    como a comanda faturada foi paga (taxa e prazo COPIADOS)
--
-- `sale_payments`, e não `payments`: `payments` já existe e é a cobrança do SaaS.
--
-- Decisões que o SQL carrega:
--   - Numeração por contador com linha travada (sale_counters), nunca max()+1 —
--     duas comandas abertas ao mesmo tempo receberiam o mesmo número.
--   - Um agendamento entra em NO MÁXIMO uma comanda: índice único em
--     sale_items.appointment_id. Excluir a comanda zera esse campo nos itens
--     (feito pelo código), o que libera o agendamento.
--   - unit_price aceita NULL enquanto a comanda está aberta: serviço de preço em
--     faixa ou "sob avaliação" entra sem valor e só fatura depois de digitado.
--   - Taxa e prazo são copiados para sale_payments no faturamento: mudar a forma
--     de pagamento depois não reescreve o passado.
--   - Sem ON DELETE CASCADE a partir de customers/services/products/professionals:
--     apagar um cadastro não pode apagar venda. A descrição do item é uma cópia.
--
-- Padrão multi-tenant de 020/029/034/036: salon_id + FK cascade do salão + RLS ON
-- + policy deny_all + REVOKE de anon/authenticated (acesso só via Drizzle).
-- Aditiva. Idempotente. Não toca em nenhuma tabela existente.

-- ---------------------------------------------------------------------------
-- payment_methods
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.payment_methods (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  salon_id        uuid NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,
  name            text NOT NULL,
  kind            text NOT NULL,
  fee_percent     numeric(5,2) NOT NULL DEFAULT 0,
  settlement_days integer NOT NULL DEFAULT 0,
  is_active       boolean NOT NULL DEFAULT true,
  created_at      timestamp NOT NULL DEFAULT now(),
  updated_at      timestamp NOT NULL DEFAULT now(),
  CONSTRAINT payment_methods_kind_check
    CHECK (kind IN ('cash', 'pix', 'credit_card', 'debit_card', 'other')),
  CONSTRAINT payment_methods_fee_check
    CHECK (fee_percent >= 0 AND fee_percent <= 100),
  CONSTRAINT payment_methods_settlement_check
    CHECK (settlement_days >= 0 AND settlement_days <= 365)
);

CREATE UNIQUE INDEX IF NOT EXISTS payment_methods_salon_name_unique
  ON public.payment_methods (salon_id, lower(name));

-- ---------------------------------------------------------------------------
-- sale_counters
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sale_counters (
  salon_id    uuid PRIMARY KEY REFERENCES public.salons(id) ON DELETE CASCADE,
  last_number integer NOT NULL DEFAULT 0,
  CONSTRAINT sale_counters_last_number_check CHECK (last_number >= 0)
);

-- ---------------------------------------------------------------------------
-- sales
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sales (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  salon_id       uuid NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,
  number         integer NOT NULL,
  customer_id    uuid NOT NULL REFERENCES public.customers(id),
  status         text NOT NULL DEFAULT 'open',
  sale_date      timestamp NOT NULL DEFAULT now(),
  notes          text,
  subtotal       numeric(12,2) NOT NULL DEFAULT 0,
  discount_total numeric(12,2) NOT NULL DEFAULT 0,
  total          numeric(12,2) NOT NULL DEFAULT 0,
  invoiced_at    timestamp,
  invoiced_by    uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  voided_at      timestamp,
  voided_by      uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  void_reason    text,
  created_by     uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at     timestamp NOT NULL DEFAULT now(),
  updated_at     timestamp NOT NULL DEFAULT now(),
  CONSTRAINT sales_status_check CHECK (status IN ('open', 'invoiced', 'void')),
  CONSTRAINT sales_totals_check
    CHECK (subtotal >= 0 AND discount_total >= 0 AND total >= 0),
  -- Faturada tem que dizer quando. É o eixo de tempo de todo relatório de venda.
  CONSTRAINT sales_invoiced_requires_date
    CHECK (status <> 'invoiced' OR invoiced_at IS NOT NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS sales_salon_number_unique
  ON public.sales (salon_id, number);
-- A lista: comandas do salão por data, com filtro de status.
CREATE INDEX IF NOT EXISTS sales_salon_date_idx
  ON public.sales (salon_id, sale_date DESC);
CREATE INDEX IF NOT EXISTS sales_salon_status_idx
  ON public.sales (salon_id, status, sale_date DESC);
-- A aba Vendas da ficha do cliente.
CREATE INDEX IF NOT EXISTS sales_customer_idx
  ON public.sales (customer_id);

-- ---------------------------------------------------------------------------
-- sale_items
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sale_items (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  sale_id         uuid NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
  salon_id        uuid NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,
  position        integer NOT NULL DEFAULT 0,
  kind            text NOT NULL,
  service_id      uuid REFERENCES public.services(id),
  product_id      uuid REFERENCES public.products(id),
  description     text NOT NULL,
  professional_id uuid REFERENCES public.professionals(id),
  quantity        numeric(10,3) NOT NULL DEFAULT 1,
  unit_price      numeric(12,2),
  discount_amount numeric(12,2) NOT NULL DEFAULT 0,
  total           numeric(12,2) NOT NULL DEFAULT 0,
  appointment_id  uuid REFERENCES public.appointments(id),
  created_at      timestamp NOT NULL DEFAULT now(),
  CONSTRAINT sale_items_kind_check CHECK (kind IN ('service', 'product')),
  -- Exatamente um dos dois, e do tipo que `kind` diz.
  CONSTRAINT sale_items_reference_check CHECK (
    (kind = 'service' AND service_id IS NOT NULL AND product_id IS NULL) OR
    (kind = 'product' AND product_id IS NOT NULL AND service_id IS NULL)
  ),
  -- Serviço sempre tem quem executou (é a base da comissão). Produto pode não ter.
  CONSTRAINT sale_items_service_requires_professional
    CHECK (kind <> 'service' OR professional_id IS NOT NULL),
  -- Agendamento só se liga a item de serviço.
  CONSTRAINT sale_items_appointment_only_service
    CHECK (appointment_id IS NULL OR kind = 'service'),
  CONSTRAINT sale_items_amounts_check CHECK (
    quantity > 0 AND
    (unit_price IS NULL OR unit_price >= 0) AND
    discount_amount >= 0 AND
    total >= 0
  )
);

CREATE INDEX IF NOT EXISTS sale_items_sale_idx
  ON public.sale_items (sale_id, position);
CREATE INDEX IF NOT EXISTS sale_items_salon_idx
  ON public.sale_items (salon_id);
-- "Vê só as próprias": comandas com item do profissional.
CREATE INDEX IF NOT EXISTS sale_items_professional_idx
  ON public.sale_items (professional_id)
  WHERE professional_id IS NOT NULL;
-- Um agendamento em no máximo uma comanda.
CREATE UNIQUE INDEX IF NOT EXISTS sale_items_appointment_unique
  ON public.sale_items (appointment_id)
  WHERE appointment_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- sale_payments
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sale_payments (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  sale_id           uuid NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
  salon_id          uuid NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,
  payment_method_id uuid NOT NULL REFERENCES public.payment_methods(id),
  amount            numeric(12,2) NOT NULL,
  fee_percent       numeric(5,2) NOT NULL DEFAULT 0,
  fee_amount        numeric(12,2) NOT NULL DEFAULT 0,
  settles_on        date NOT NULL,
  paid_at           timestamp NOT NULL DEFAULT now(),
  created_by        uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at        timestamp NOT NULL DEFAULT now(),
  CONSTRAINT sale_payments_amounts_check
    CHECK (amount > 0 AND fee_percent >= 0 AND fee_amount >= 0 AND fee_amount <= amount)
);

CREATE INDEX IF NOT EXISTS sale_payments_sale_idx
  ON public.sale_payments (sale_id);
CREATE INDEX IF NOT EXISTS sale_payments_salon_idx
  ON public.sale_payments (salon_id, paid_at DESC);
CREATE INDEX IF NOT EXISTS sale_payments_method_idx
  ON public.sale_payments (payment_method_id);

-- ---------------------------------------------------------------------------
-- RLS: deny_all + REVOKE nas cinco
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['payment_methods', 'sale_counters', 'sales', 'sale_items', 'sale_payments']
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
  FOREACH t IN ARRAY ARRAY['payment_methods', 'sale_counters', 'sales', 'sale_items', 'sale_payments']
  LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      RAISE EXCEPTION '037 FALHOU: tabela % não foi criada', t;
    END IF;
  END LOOP;

  SELECT count(*) INTO sem_rls
    FROM pg_class
   WHERE oid IN (
           'public.payment_methods'::regclass, 'public.sale_counters'::regclass,
           'public.sales'::regclass, 'public.sale_items'::regclass,
           'public.sale_payments'::regclass)
     AND NOT relrowsecurity;

  IF sem_rls > 0 THEN
    RAISE EXCEPTION '037 FALHOU: % tabela(s) sem RLS', sem_rls;
  END IF;

  SELECT count(*) INTO aberta
    FROM pg_policy
   WHERE polrelid IN (
           'public.payment_methods'::regclass, 'public.sale_counters'::regclass,
           'public.sales'::regclass, 'public.sale_items'::regclass,
           'public.sale_payments'::regclass)
     AND pg_get_expr(polqual, polrelid) <> 'false';

  IF aberta > 0 THEN
    RAISE EXCEPTION '037 FALHOU: % policy(ies) permissiva(s) nas tabelas de comanda', aberta;
  END IF;

  RAISE NOTICE '037 OK: payment_methods, sale_counters, sales, sale_items, sale_payments (RLS on, deny_all, REVOKE)';
END $$;
