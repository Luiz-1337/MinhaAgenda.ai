-- 035_customer_name_confirmed_and_lead_source.sql
-- Duas informações que o agendamento com agenda oficial (Belasis) passou a precisar.
--
-- (1) customers.name_confirmed_at — o nome foi informado por uma PESSOA?
--     O cliente nasce com o nome do perfil do WhatsApp ("Sil", "Gi", "💤"). Com
--     agenda oficial ativa, o cadastro de lá era criado com esse apelido — em
--     07/11/2026 uma cliente foi cadastrada só como "Sil" na Belasis, e a recepção teve
--     de pedir o sobrenome por mensagem depois. NULL = o nome veio do perfil (ou é
--     provisório); preenchido = a própria cliente informou (tool updateCustomerName),
--     alguém digitou no painel, ou o cadastro veio da agenda oficial.
--     A IA só cria cadastro na agenda oficial com nome confirmado.
--
-- (2) customers.lead_source e appointments.lead_source — de onde veio o lead.
--     'paid_traffic' = a conversa nasceu de clique em anúncio (messages.ad_referral
--     com sourceType 'ad', migration 031); 'organic' = todo o resto que chegou pelo
--     canal oficial. NULL = não se sabe (canais que não entregam a origem).
--     No CLIENTE e não no chat: há um chat por telefone por salão, então dá no
--     mesmo, e é pelo cliente que o agendamento chega (appointments.client_id).
--     No AGENDAMENTO é cópia do valor do cliente no momento da criação: o que foi
--     marcado antes do clique no anúncio continua orgânico.
--
-- Aditiva, nullable, idempotente. APLICAR ANTES DO DEPLOY: o código lê as colunas
-- pelo schema do Drizzle (consultas sem lista de colunas passam a pedi-las).

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS name_confirmed_at timestamp,
  ADD COLUMN IF NOT EXISTS lead_source text;

ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS lead_source text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'customers_lead_source_check' AND conrelid = 'public.customers'::regclass
  ) THEN
    ALTER TABLE public.customers
      ADD CONSTRAINT customers_lead_source_check
      CHECK (lead_source IS NULL OR lead_source IN ('paid_traffic', 'organic'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'appointments_lead_source_check' AND conrelid = 'public.appointments'::regclass
  ) THEN
    ALTER TABLE public.appointments
      ADD CONSTRAINT appointments_lead_source_check
      CHECK (lead_source IS NULL OR lead_source IN ('paid_traffic', 'organic'));
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- Carga inicial da origem, com o que a migration 031 já vinha guardando.
-- Idempotente: pode rodar de novo (por exemplo, depois de unificar cadastros
-- duplicados) e só preenche o que falta.
-- ----------------------------------------------------------------------------

-- Tráfego: alguma mensagem da conversa da cliente veio de anúncio. Sem sourceType
-- mas com ctwaClid também é anúncio (o click id só existe em anúncio).
WITH ad_customers AS (
  SELECT cu.id AS customer_id
    FROM public.customers cu
    JOIN public.chats c ON c.salon_id = cu.salon_id AND c.client_phone = cu.phone
    JOIN public.messages m ON m.chat_id = c.id
   WHERE m.ad_referral IS NOT NULL
     AND (
       m.ad_referral->>'sourceType' = 'ad'
       OR (m.ad_referral->>'sourceType' IS NULL AND m.ad_referral->>'ctwaClid' IS NOT NULL)
     )
   GROUP BY cu.id
)
UPDATE public.customers cu
   SET lead_source = 'paid_traffic'
  FROM ad_customers a
 WHERE a.customer_id = cu.id
   AND cu.lead_source IS DISTINCT FROM 'paid_traffic';

-- Orgânico: conversa no canal oficial (Cloud API), que é o que entrega a origem,
-- e nenhuma mensagem de anúncio. Quem só conversou por canal que não entrega a
-- origem fica NULL: dizer "orgânico" ali seria inventar.
UPDATE public.customers cu
   SET lead_source = 'organic'
 WHERE cu.lead_source IS NULL
   AND EXISTS (
     SELECT 1
       FROM public.chats c
       JOIN public.agents a ON a.id = c.agent_id
      WHERE c.salon_id = cu.salon_id
        AND c.client_phone = cu.phone
        AND a.messaging_provider = 'cloud'
   );

-- Agendamentos: tráfego só o que foi criado DEPOIS do primeiro clique em anúncio.
WITH first_ad AS (
  SELECT cu.id AS customer_id, min(m.created_at) AS first_ad_at
    FROM public.customers cu
    JOIN public.chats c ON c.salon_id = cu.salon_id AND c.client_phone = cu.phone
    JOIN public.messages m ON m.chat_id = c.id
   WHERE m.ad_referral IS NOT NULL
     AND (
       m.ad_referral->>'sourceType' = 'ad'
       OR (m.ad_referral->>'sourceType' IS NULL AND m.ad_referral->>'ctwaClid' IS NOT NULL)
     )
   GROUP BY cu.id
)
UPDATE public.appointments ap
   SET lead_source = CASE
         WHEN f.first_ad_at IS NOT NULL AND ap.created_at >= f.first_ad_at THEN 'paid_traffic'
         ELSE 'organic'
       END
  FROM public.customers cu
  LEFT JOIN first_ad f ON f.customer_id = cu.id
 WHERE cu.id = ap.client_id
   AND ap.lead_source IS NULL
   AND cu.lead_source IS NOT NULL;

DO $$
DECLARE
  faltando int;
  trafego int;
  organico int;
  agendamentos_trafego int;
BEGIN
  SELECT count(*) INTO faltando
    FROM (VALUES
      ('customers', 'name_confirmed_at'),
      ('customers', 'lead_source'),
      ('appointments', 'lead_source')
    ) AS esperado(tabela, coluna)
   WHERE NOT EXISTS (
     SELECT 1 FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name = esperado.tabela
        AND c.column_name = esperado.coluna
   );

  IF faltando > 0 THEN
    RAISE EXCEPTION '035 FALHOU: % coluna(s) não foram criadas', faltando;
  END IF;

  SELECT count(*) FILTER (WHERE lead_source = 'paid_traffic'),
         count(*) FILTER (WHERE lead_source = 'organic')
    INTO trafego, organico
    FROM public.customers;

  SELECT count(*) INTO agendamentos_trafego
    FROM public.appointments
   WHERE lead_source = 'paid_traffic';

  RAISE NOTICE '035 OK: customers.name_confirmed_at, customers.lead_source, appointments.lead_source — clientes: % tráfego, % orgânico; agendamentos de tráfego: %',
    trafego, organico, agendamentos_trafego;
END $$;
