-- 060_appointment_labels.sql
-- Etiquetas na agenda: um rótulo com cor por agendamento (docs/ROADMAP.md,
-- fase 7, fatia 7b).
--
--   appointment_labels      as etiquetas do salão (nome e cor)
--   appointments.label_id   a etiqueta do agendamento (no máximo uma)
--
-- Decisões que o SQL carrega:
--   - Uma etiqueta por agendamento. É um marcador para quem olha a agenda
--     ("Primeira vez", "Encaixe", "Aguardando sinal") — não muda horário, status
--     nem cobrança.
--   - Nome único no salão, sem diferença de maiúscula.
--   - Excluir a etiqueta não mexe no agendamento: o label_id vira NULL.
--
-- Padrão multi-tenant das anteriores na tabela nova: salon_id + FK cascade do
-- salão + RLS ON + policy deny_all + REVOKE de anon/authenticated.
-- MEXE em tabela existente (appointments), só acrescentando uma coluna sem
-- DEFAULT: nenhuma linha é regravada. Aplicar ANTES de publicar o código — o
-- Drizzle lista todas as colunas no INSERT.
-- Idempotente.

CREATE TABLE IF NOT EXISTS public.appointment_labels (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  salon_id   uuid NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,
  name       text NOT NULL,
  -- "#RRGGBB"
  color      text NOT NULL,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT appointment_labels_name_check CHECK (length(btrim(name)) BETWEEN 1 AND 30),
  CONSTRAINT appointment_labels_color_check CHECK (color ~ '^#[0-9A-Fa-f]{6}$')
);

CREATE UNIQUE INDEX IF NOT EXISTS appointment_labels_salon_name_unique
  ON public.appointment_labels (salon_id, lower(name));

ALTER TABLE public.appointment_labels ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS deny_all_appointment_labels ON public.appointment_labels;
CREATE POLICY deny_all_appointment_labels ON public.appointment_labels
  FOR ALL USING (false) WITH CHECK (false);
REVOKE ALL ON TABLE public.appointment_labels FROM anon, authenticated;

ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS label_id uuid REFERENCES public.appointment_labels(id) ON DELETE SET NULL;

-- Só para o ON DELETE SET NULL não varrer a tabela inteira ao excluir uma etiqueta.
CREATE INDEX IF NOT EXISTS appt_label_idx ON public.appointments (label_id) WHERE label_id IS NOT NULL;

DO $$
DECLARE
  aberta int;
BEGIN
  IF to_regclass('public.appointment_labels') IS NULL THEN
    RAISE EXCEPTION '060 FALHOU: tabela appointment_labels não foi criada';
  END IF;

  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.appointment_labels'::regclass) THEN
    RAISE EXCEPTION '060 FALHOU: appointment_labels sem RLS';
  END IF;

  SELECT count(*) INTO aberta
    FROM pg_policy
   WHERE polrelid = 'public.appointment_labels'::regclass
     AND pg_get_expr(polqual, polrelid) <> 'false';

  IF aberta > 0 THEN
    RAISE EXCEPTION '060 FALHOU: % policy(ies) permissiva(s) em appointment_labels', aberta;
  END IF;

  IF has_table_privilege('anon', 'public.appointment_labels', 'SELECT') OR
     has_table_privilege('authenticated', 'public.appointment_labels', 'SELECT') THEN
    RAISE EXCEPTION '060 FALHOU: appointment_labels ainda legível por anon/authenticated';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'appointments' AND column_name = 'label_id'
  ) THEN
    RAISE EXCEPTION '060 FALHOU: appointments sem a coluna label_id';
  END IF;

  RAISE NOTICE '060 OK: appointment_labels (RLS on, deny_all, REVOKE) e appointments.label_id';
END $$;
