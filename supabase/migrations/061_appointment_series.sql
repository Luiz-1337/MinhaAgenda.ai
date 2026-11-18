-- 061_appointment_series.sql
-- Recorrência de agendamento: o mesmo atendimento repetido a cada N semanas
-- (docs/ROADMAP.md, fase 7, fatia 7c).
--
--   appointment_series       a série: de quanto em quanto tempo e quantas vezes
--   appointments.series_id   a série de que o agendamento faz parte
--
-- Decisões que o SQL carrega:
--   - A série NÃO é uma regra que gera horários no futuro: ao criar, o sistema
--     grava cada agendamento de uma vez (cada um passa pelas conferências de
--     sempre). A tabela só amarra os agendamentos entre si e guarda o que foi
--     pedido.
--   - Cada agendamento da série é um agendamento comum: pode ser remarcado,
--     concluído ou cancelado sozinho.
--   - Excluir a série não mexe nos agendamentos: o series_id vira NULL.
--
-- Padrão multi-tenant das anteriores na tabela nova: salon_id + FK cascade do
-- salão + RLS ON + policy deny_all + REVOKE de anon/authenticated.
-- MEXE em tabela existente (appointments), só acrescentando uma coluna sem
-- DEFAULT: nenhuma linha é regravada. Aplicar ANTES de publicar o código — o
-- Drizzle lista todas as colunas no INSERT.
-- Idempotente.

CREATE TABLE IF NOT EXISTS public.appointment_series (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  salon_id       uuid NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,
  -- De quantas em quantas semanas.
  interval_weeks integer NOT NULL,
  -- Quantas vezes foi PEDIDO (as que não couberam na agenda não viram agendamento).
  occurrences    integer NOT NULL,
  created_by     uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at     timestamp NOT NULL DEFAULT now(),
  CONSTRAINT appointment_series_interval_check CHECK (interval_weeks BETWEEN 1 AND 8),
  CONSTRAINT appointment_series_occurrences_check CHECK (occurrences BETWEEN 2 AND 12)
);

ALTER TABLE public.appointment_series ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS deny_all_appointment_series ON public.appointment_series;
CREATE POLICY deny_all_appointment_series ON public.appointment_series
  FOR ALL USING (false) WITH CHECK (false);
REVOKE ALL ON TABLE public.appointment_series FROM anon, authenticated;

ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS series_id uuid REFERENCES public.appointment_series(id) ON DELETE SET NULL;

-- "Este e os próximos da série", em ordem de data.
CREATE INDEX IF NOT EXISTS appt_series_idx ON public.appointments (series_id, date) WHERE series_id IS NOT NULL;

DO $$
DECLARE
  aberta int;
BEGIN
  IF to_regclass('public.appointment_series') IS NULL THEN
    RAISE EXCEPTION '061 FALHOU: tabela appointment_series não foi criada';
  END IF;

  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.appointment_series'::regclass) THEN
    RAISE EXCEPTION '061 FALHOU: appointment_series sem RLS';
  END IF;

  SELECT count(*) INTO aberta
    FROM pg_policy
   WHERE polrelid = 'public.appointment_series'::regclass
     AND pg_get_expr(polqual, polrelid) <> 'false';

  IF aberta > 0 THEN
    RAISE EXCEPTION '061 FALHOU: % policy(ies) permissiva(s) em appointment_series', aberta;
  END IF;

  IF has_table_privilege('anon', 'public.appointment_series', 'SELECT') OR
     has_table_privilege('authenticated', 'public.appointment_series', 'SELECT') THEN
    RAISE EXCEPTION '061 FALHOU: appointment_series ainda legível por anon/authenticated';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'appointments' AND column_name = 'series_id'
  ) THEN
    RAISE EXCEPTION '061 FALHOU: appointments sem a coluna series_id';
  END IF;

  RAISE NOTICE '061 OK: appointment_series (RLS on, deny_all, REVOKE) e appointments.series_id';
END $$;
