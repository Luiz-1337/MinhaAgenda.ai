-- 065_appointment_deposits.sql
-- Sinal do agendamento, sem pagamento online (docs/ROADMAP.md, fase 8, fatia 8a).
--
--   appointment_deposits    o sinal pedido para UM agendamento, e se foi recebido
--
-- Decisões que o SQL carrega:
--   - O sistema NÃO recebe o dinheiro: o cliente paga por PIX direto ao salão
--     (chave em salons.settings.advance_payment), e alguém do salão marca aqui
--     que recebeu. A linha é só o controle.
--   - No máximo um sinal por agendamento (UNIQUE).
--   - Situação: pending (aguardando), received (recebido), waived (dispensado).
--     Recebido tem data (CHECK); os outros dois não.
--   - Tabela à parte, e não colunas em `appointments`: a agenda é do caminho
--     crítico, e o sinal é um controle que a maioria dos agendamentos não tem.
--   - Excluir o agendamento apaga o sinal (CASCADE). Cancelar NÃO apaga: o
--     agendamento cancelado continua lá, com o sinal recebido para devolver ou não.
--
-- Padrão multi-tenant das anteriores: salon_id + FK cascade do salão + RLS ON +
-- policy deny_all + REVOKE de anon/authenticated.
-- Só tabela nova: não mexe em nenhuma tabela existente.
-- Idempotente.

CREATE TABLE IF NOT EXISTS public.appointment_deposits (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  salon_id       uuid NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,
  appointment_id uuid NOT NULL REFERENCES public.appointments(id) ON DELETE CASCADE,
  amount         numeric(12, 2) NOT NULL,
  status         text NOT NULL DEFAULT 'pending',
  -- De onde o pedido de sinal nasceu: 'online' (página de agendamento) ou 'panel'.
  source         text NOT NULL,
  received_at    timestamp,
  -- Quem marcou como recebido ou dispensado.
  settled_by     uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_by     uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at     timestamp NOT NULL DEFAULT now(),
  updated_at     timestamp NOT NULL DEFAULT now(),
  CONSTRAINT appointment_deposits_amount_check CHECK (amount > 0 AND amount <= 100000),
  CONSTRAINT appointment_deposits_status_check CHECK (status IN ('pending', 'received', 'waived')),
  CONSTRAINT appointment_deposits_source_check CHECK (source IN ('online', 'panel')),
  CONSTRAINT appointment_deposits_received_check CHECK ((status = 'received') = (received_at IS NOT NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS appointment_deposits_appointment_unique
  ON public.appointment_deposits (appointment_id);
CREATE INDEX IF NOT EXISTS appointment_deposits_salon_status_idx
  ON public.appointment_deposits (salon_id, status);

ALTER TABLE public.appointment_deposits ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS deny_all_appointment_deposits ON public.appointment_deposits;
CREATE POLICY deny_all_appointment_deposits ON public.appointment_deposits
  FOR ALL USING (false) WITH CHECK (false);
REVOKE ALL ON TABLE public.appointment_deposits FROM anon, authenticated;

DO $$
DECLARE
  aberta int;
BEGIN
  IF to_regclass('public.appointment_deposits') IS NULL THEN
    RAISE EXCEPTION '065 FALHOU: tabela appointment_deposits não foi criada';
  END IF;

  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.appointment_deposits'::regclass) THEN
    RAISE EXCEPTION '065 FALHOU: appointment_deposits sem RLS';
  END IF;

  SELECT count(*) INTO aberta
    FROM pg_policy
   WHERE polrelid = 'public.appointment_deposits'::regclass
     AND pg_get_expr(polqual, polrelid) <> 'false';
  IF aberta > 0 THEN
    RAISE EXCEPTION '065 FALHOU: % policy(ies) permissiva(s) em appointment_deposits', aberta;
  END IF;

  IF has_table_privilege('anon', 'public.appointment_deposits', 'SELECT') OR
     has_table_privilege('authenticated', 'public.appointment_deposits', 'SELECT') THEN
    RAISE EXCEPTION '065 FALHOU: appointment_deposits ainda legível por anon/authenticated';
  END IF;

  RAISE NOTICE '065 OK: appointment_deposits (RLS on, deny_all, REVOKE)';
END $$;
