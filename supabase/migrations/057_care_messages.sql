-- 057_care_messages.sql
-- Mensagens de cuidados e de retorno por serviço e por produto, e o envio do
-- pedido de avaliação pelo WhatsApp (docs/ROADMAP.md, fase 6, fatia 6d).
--
--   care_message_rules        a mensagem de um serviço ou produto, por tipo
--   care_message_dispatches   a fila e o histórico de cada envio ao cliente
--   review_settings           + enviar o pedido de avaliação pelo WhatsApp
--
-- Decisões que o SQL carrega:
--   - Uma mensagem por tipo e por item (índices únicos): cuidados antes do
--     atendimento (só serviço), cuidados depois, e retorno.
--   - `offset_days` é "dias antes do agendamento" nos cuidados de antes, e "dias
--     depois da comanda" nos outros dois.
--   - Cada envio é uma linha da fila, com a origem: a comanda (cuidados de depois,
--     retorno e avaliação) ou o agendamento (cuidados de antes). Os índices únicos
--     garantem um envio por origem e por mensagem — faturar de novo depois de
--     reabrir não manda duas vezes.
--   - A mensagem excluída deixa o histórico (rule_id vira NULL); o nome do item
--     fica copiado na linha.
--
-- Padrão multi-tenant das anteriores: salon_id + FK cascade do salão + RLS ON +
-- policy deny_all + REVOKE de anon/authenticated.
-- Idempotente. MEXE em tabela existente: review_settings ganha três colunas, todas
-- com DEFAULT — aplicar ANTES de publicar o código.

-- ---------------------------------------------------------------------------
-- care_message_rules
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.care_message_rules (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  salon_id    uuid NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,
  -- 'pre_care' = antes do atendimento; 'post_care' = depois; 'return' = retorno.
  kind        text NOT NULL,
  service_id  uuid REFERENCES public.services(id) ON DELETE CASCADE,
  product_id  uuid REFERENCES public.products(id) ON DELETE CASCADE,
  offset_days integer NOT NULL,
  message     text NOT NULL,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamp NOT NULL DEFAULT now(),
  updated_at  timestamp NOT NULL DEFAULT now(),
  CONSTRAINT care_message_rules_kind_check CHECK (kind IN ('pre_care', 'post_care', 'return')),
  CONSTRAINT care_message_rules_target_check CHECK ((service_id IS NULL) <> (product_id IS NULL)),
  -- Produto não tem agendamento: não há "antes".
  CONSTRAINT care_message_rules_pre_care_check CHECK (kind <> 'pre_care' OR service_id IS NOT NULL),
  CONSTRAINT care_message_rules_offset_check CHECK (offset_days >= 0 AND offset_days <= 365),
  CONSTRAINT care_message_rules_message_check CHECK (length(btrim(message)) BETWEEN 1 AND 1000)
);

CREATE UNIQUE INDEX IF NOT EXISTS care_message_rules_service_unique
  ON public.care_message_rules (salon_id, kind, service_id) WHERE service_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS care_message_rules_product_unique
  ON public.care_message_rules (salon_id, kind, product_id) WHERE product_id IS NOT NULL;

ALTER TABLE public.care_message_rules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS deny_all_care_message_rules ON public.care_message_rules;
CREATE POLICY deny_all_care_message_rules ON public.care_message_rules
  FOR ALL USING (false) WITH CHECK (false);
REVOKE ALL ON TABLE public.care_message_rules FROM anon, authenticated;

-- ---------------------------------------------------------------------------
-- care_message_dispatches
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.care_message_dispatches (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  salon_id       uuid NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,
  customer_id    uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  -- Os três tipos de mensagem, mais 'review' (o pedido de avaliação).
  kind           text NOT NULL,
  rule_id        uuid REFERENCES public.care_message_rules(id) ON DELETE SET NULL,
  sale_id        uuid REFERENCES public.sales(id) ON DELETE CASCADE,
  appointment_id uuid REFERENCES public.appointments(id) ON DELETE CASCADE,
  review_id      uuid REFERENCES public.reviews(id) ON DELETE CASCADE,
  -- Nome do serviço ou do produto na hora em que o envio foi agendado.
  item_name      text,
  scheduled_for  timestamp NOT NULL,
  status         text NOT NULL DEFAULT 'pending',
  -- O texto que saiu (preenchido no envio).
  body           text,
  -- Por que falhou ou por que não foi enviado.
  detail         text,
  sent_at        timestamp,
  created_at     timestamp NOT NULL DEFAULT now(),
  updated_at     timestamp NOT NULL DEFAULT now(),
  CONSTRAINT care_message_dispatches_kind_check
    CHECK (kind IN ('pre_care', 'post_care', 'return', 'review')),
  CONSTRAINT care_message_dispatches_status_check
    CHECK (status IN ('pending', 'sending', 'sent', 'failed', 'skipped')),
  CONSTRAINT care_message_dispatches_origin_check
    CHECK (sale_id IS NOT NULL OR appointment_id IS NOT NULL),
  CONSTRAINT care_message_dispatches_review_check
    CHECK ((kind = 'review') = (review_id IS NOT NULL)),
  CONSTRAINT care_message_dispatches_sent_check
    CHECK ((status = 'sent') = (sent_at IS NOT NULL))
);

-- Um envio por comanda e por mensagem; um por agendamento e por mensagem; um por
-- pedido de avaliação.
CREATE UNIQUE INDEX IF NOT EXISTS care_message_dispatches_sale_rule_unique
  ON public.care_message_dispatches (sale_id, rule_id) WHERE sale_id IS NOT NULL AND rule_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS care_message_dispatches_appointment_rule_unique
  ON public.care_message_dispatches (appointment_id, rule_id)
  WHERE appointment_id IS NOT NULL AND rule_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS care_message_dispatches_review_unique
  ON public.care_message_dispatches (review_id) WHERE review_id IS NOT NULL;
-- A fila: o que está para sair.
CREATE INDEX IF NOT EXISTS care_message_dispatches_due_idx
  ON public.care_message_dispatches (scheduled_for) WHERE status = 'pending';
-- A lista de envios do salão.
CREATE INDEX IF NOT EXISTS care_message_dispatches_salon_idx
  ON public.care_message_dispatches (salon_id, scheduled_for DESC);
CREATE INDEX IF NOT EXISTS care_message_dispatches_customer_idx
  ON public.care_message_dispatches (customer_id);

ALTER TABLE public.care_message_dispatches ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS deny_all_care_message_dispatches ON public.care_message_dispatches;
CREATE POLICY deny_all_care_message_dispatches ON public.care_message_dispatches
  FOR ALL USING (false) WITH CHECK (false);
REVOKE ALL ON TABLE public.care_message_dispatches FROM anon, authenticated;

-- ---------------------------------------------------------------------------
-- review_settings: o pedido de avaliação pelo WhatsApp
-- ---------------------------------------------------------------------------
ALTER TABLE public.review_settings
  ADD COLUMN IF NOT EXISTS send_whatsapp boolean NOT NULL DEFAULT false,
  -- Horas entre faturar a comanda e mandar o pedido.
  ADD COLUMN IF NOT EXISTS whatsapp_delay_hours integer NOT NULL DEFAULT 2,
  -- NULL = usa o texto padrão do sistema.
  ADD COLUMN IF NOT EXISTS whatsapp_text text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'review_settings_whatsapp_delay_check'
  ) THEN
    ALTER TABLE public.review_settings
      ADD CONSTRAINT review_settings_whatsapp_delay_check
      CHECK (whatsapp_delay_hours >= 0 AND whatsapp_delay_hours <= 72);
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Conferência
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  tabela   text;
  aberta   int;
  colunas  int;
BEGIN
  FOREACH tabela IN ARRAY ARRAY['care_message_rules', 'care_message_dispatches'] LOOP
    IF to_regclass('public.' || tabela) IS NULL THEN
      RAISE EXCEPTION '057 FALHOU: tabela % não foi criada', tabela;
    END IF;

    IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = ('public.' || tabela)::regclass) THEN
      RAISE EXCEPTION '057 FALHOU: % sem RLS', tabela;
    END IF;

    SELECT count(*) INTO aberta
      FROM pg_policy
     WHERE polrelid = ('public.' || tabela)::regclass
       AND pg_get_expr(polqual, polrelid) <> 'false';

    IF aberta > 0 THEN
      RAISE EXCEPTION '057 FALHOU: % policy(ies) permissiva(s) em %', aberta, tabela;
    END IF;

    IF has_table_privilege('anon', 'public.' || tabela, 'SELECT') OR
       has_table_privilege('authenticated', 'public.' || tabela, 'SELECT') THEN
      RAISE EXCEPTION '057 FALHOU: % ainda legível por anon/authenticated', tabela;
    END IF;
  END LOOP;

  SELECT count(*) INTO colunas
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'review_settings'
     AND column_name IN ('send_whatsapp', 'whatsapp_delay_hours', 'whatsapp_text');

  IF colunas <> 3 THEN
    RAISE EXCEPTION '057 FALHOU: review_settings com % de 3 colunas novas', colunas;
  END IF;

  RAISE NOTICE '057 OK: care_message_rules, care_message_dispatches, review_settings (+3 colunas)';
END $$;
