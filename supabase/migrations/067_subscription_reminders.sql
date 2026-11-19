-- 067_subscription_reminders.sql
-- Aviso de vencimento da assinatura por WhatsApp (docs/ROADMAP.md, fase 8,
-- fatia 8d).
--
--   subscription_reminder_settings   por salão: ligado, dias antes, texto
--   care_message_dispatches          + subscription_id, subscription_due e o
--                                      tipo 'subscription_due'
--
-- Decisões que o SQL carrega:
--   - Nasce DESLIGADO: sem linha de configuração (ou com is_enabled = false) o
--     salão não manda nada. Mandar mensagem a cliente é decisão do salão.
--   - O aviso usa a MESMA fila das mensagens ao cliente (057): mesmo horário de
--     envio, mesmo respeito ao "não quero receber", mesma tela de envios.
--   - Um aviso por assinatura e por VENCIMENTO (UNIQUE): renovou, o vencimento
--     muda e o próximo aviso é outro.
--   - Excluir a assinatura apaga os avisos dela (CASCADE). Só se exclui
--     assinatura que nunca foi cobrada, então na prática não há o que apagar.
--
-- Altera `care_message_dispatches`, que TEM linhas em produção: só acrescenta
-- duas colunas anuláveis e troca três CHECKs por versões mais largas — toda
-- linha que existe continua válida. Copiar a tabela para `backups` antes.
-- Idempotente.

CREATE TABLE IF NOT EXISTS public.subscription_reminder_settings (
  salon_id    uuid PRIMARY KEY REFERENCES public.salons(id) ON DELETE CASCADE,
  is_enabled  boolean NOT NULL DEFAULT false,
  -- Com quantos dias de antecedência o aviso sai.
  days_before integer NOT NULL DEFAULT 3,
  -- NULL = usa o texto padrão do sistema.
  message     text,
  created_at  timestamp NOT NULL DEFAULT now(),
  updated_at  timestamp NOT NULL DEFAULT now(),
  CONSTRAINT subscription_reminder_settings_days_check CHECK (days_before >= 1 AND days_before <= 15),
  CONSTRAINT subscription_reminder_settings_message_check
    CHECK (message IS NULL OR length(btrim(message)) BETWEEN 1 AND 1000)
);

ALTER TABLE public.subscription_reminder_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS deny_all_subscription_reminder_settings ON public.subscription_reminder_settings;
CREATE POLICY deny_all_subscription_reminder_settings ON public.subscription_reminder_settings
  FOR ALL USING (false) WITH CHECK (false);
REVOKE ALL ON TABLE public.subscription_reminder_settings FROM anon, authenticated;

ALTER TABLE public.care_message_dispatches
  ADD COLUMN IF NOT EXISTS subscription_id uuid REFERENCES public.customer_subscriptions(id) ON DELETE CASCADE,
  -- O vencimento que o aviso anuncia.
  ADD COLUMN IF NOT EXISTS subscription_due date;

ALTER TABLE public.care_message_dispatches DROP CONSTRAINT IF EXISTS care_message_dispatches_kind_check;
ALTER TABLE public.care_message_dispatches
  ADD CONSTRAINT care_message_dispatches_kind_check
  CHECK (kind IN ('pre_care', 'post_care', 'return', 'review', 'subscription_due'));

ALTER TABLE public.care_message_dispatches DROP CONSTRAINT IF EXISTS care_message_dispatches_origin_check;
ALTER TABLE public.care_message_dispatches
  ADD CONSTRAINT care_message_dispatches_origin_check
  CHECK (sale_id IS NOT NULL OR appointment_id IS NOT NULL OR subscription_id IS NOT NULL);

ALTER TABLE public.care_message_dispatches DROP CONSTRAINT IF EXISTS care_message_dispatches_subscription_check;
ALTER TABLE public.care_message_dispatches
  ADD CONSTRAINT care_message_dispatches_subscription_check
  CHECK ((kind = 'subscription_due') = (subscription_id IS NOT NULL AND subscription_due IS NOT NULL));

CREATE UNIQUE INDEX IF NOT EXISTS care_message_dispatches_subscription_due_unique
  ON public.care_message_dispatches (subscription_id, subscription_due)
  WHERE subscription_id IS NOT NULL;

DO $$
DECLARE
  aberta int;
  invalidas int;
BEGIN
  IF to_regclass('public.subscription_reminder_settings') IS NULL THEN
    RAISE EXCEPTION '067 FALHOU: tabela subscription_reminder_settings não foi criada';
  END IF;

  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.subscription_reminder_settings'::regclass) THEN
    RAISE EXCEPTION '067 FALHOU: subscription_reminder_settings sem RLS';
  END IF;

  SELECT count(*) INTO aberta
    FROM pg_policy
   WHERE polrelid = 'public.subscription_reminder_settings'::regclass
     AND pg_get_expr(polqual, polrelid) <> 'false';
  IF aberta > 0 THEN
    RAISE EXCEPTION '067 FALHOU: % policy(ies) permissiva(s) em subscription_reminder_settings', aberta;
  END IF;

  IF has_table_privilege('anon', 'public.subscription_reminder_settings', 'SELECT') OR
     has_table_privilege('authenticated', 'public.subscription_reminder_settings', 'SELECT') THEN
    RAISE EXCEPTION '067 FALHOU: subscription_reminder_settings ainda legível por anon/authenticated';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'care_message_dispatches' AND column_name = 'subscription_id'
  ) THEN
    RAISE EXCEPTION '067 FALHOU: care_message_dispatches.subscription_id não foi criada';
  END IF;

  -- Nenhuma linha antiga pode ter ganhado o tipo novo nem ficado sem origem.
  SELECT count(*) INTO invalidas
    FROM public.care_message_dispatches
   WHERE kind = 'subscription_due' AND subscription_id IS NULL;
  IF invalidas > 0 THEN
    RAISE EXCEPTION '067 FALHOU: % envio(s) de assinatura sem assinatura', invalidas;
  END IF;

  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.care_message_dispatches'::regclass) THEN
    RAISE EXCEPTION '067 FALHOU: care_message_dispatches perdeu o RLS';
  END IF;

  RAISE NOTICE '067 OK: subscription_reminder_settings (RLS on, deny_all, REVOKE) e care_message_dispatches com subscription_due';
END $$;
