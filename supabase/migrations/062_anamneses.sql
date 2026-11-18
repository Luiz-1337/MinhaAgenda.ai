-- 062_anamneses.sql
-- Anamneses: modelos de ficha com perguntas, respondidos na ficha do cliente,
-- com histórico (docs/ROADMAP.md, fase 7, fatia 7d).
--
--   anamnesis_templates   os modelos do salão (nome e perguntas)
--   customer_anamneses    cada ficha respondida de um cliente
--
-- Decisões que o SQL carrega:
--   - As perguntas ficam em jsonb no modelo: são sempre lidas e gravadas juntas,
--     e a ordem importa. A regra de formato está em domain/anamneses.ts.
--   - A ficha respondida é um RETRATO: guarda o nome do modelo e, em cada
--     resposta, o texto da pergunta como estava no dia. Alterar ou excluir o
--     modelo não muda o que já foi respondido (template_id vira NULL).
--   - Responder de novo cria outra linha: o histórico é a lista de fichas.
--   - Excluir o cliente apaga as fichas dele (dado de saúde não fica órfão).
--
-- Padrão multi-tenant das anteriores: salon_id + FK cascade do salão + RLS ON +
-- policy deny_all + REVOKE de anon/authenticated.
-- Só tabelas novas: não mexe em nenhuma tabela existente.
-- Idempotente.

CREATE TABLE IF NOT EXISTS public.anamnesis_templates (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  salon_id   uuid NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,
  name       text NOT NULL,
  -- [{ id, label, type, required, options }]
  questions  jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- Modelo inativo não aparece para responder; as fichas já respondidas ficam.
  is_active  boolean NOT NULL DEFAULT true,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT anamnesis_templates_name_check CHECK (length(btrim(name)) BETWEEN 1 AND 80),
  CONSTRAINT anamnesis_templates_questions_check CHECK (jsonb_typeof(questions) = 'array')
);

CREATE UNIQUE INDEX IF NOT EXISTS anamnesis_templates_salon_name_unique
  ON public.anamnesis_templates (salon_id, lower(name));

ALTER TABLE public.anamnesis_templates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS deny_all_anamnesis_templates ON public.anamnesis_templates;
CREATE POLICY deny_all_anamnesis_templates ON public.anamnesis_templates
  FOR ALL USING (false) WITH CHECK (false);
REVOKE ALL ON TABLE public.anamnesis_templates FROM anon, authenticated;

CREATE TABLE IF NOT EXISTS public.customer_anamneses (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  salon_id      uuid NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,
  customer_id   uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  template_id   uuid REFERENCES public.anamnesis_templates(id) ON DELETE SET NULL,
  -- O nome do modelo no dia em que foi respondido.
  template_name text NOT NULL,
  -- [{ questionId, label, type, value }] — value: texto, lista, true/false ou null.
  answers       jsonb NOT NULL,
  filled_by     uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at    timestamp NOT NULL DEFAULT now(),
  CONSTRAINT customer_anamneses_answers_check CHECK (jsonb_typeof(answers) = 'array')
);

CREATE INDEX IF NOT EXISTS customer_anamneses_customer_idx
  ON public.customer_anamneses (customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS customer_anamneses_salon_idx
  ON public.customer_anamneses (salon_id);
-- Só para o ON DELETE SET NULL não varrer a tabela ao excluir um modelo.
CREATE INDEX IF NOT EXISTS customer_anamneses_template_idx
  ON public.customer_anamneses (template_id) WHERE template_id IS NOT NULL;

ALTER TABLE public.customer_anamneses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS deny_all_customer_anamneses ON public.customer_anamneses;
CREATE POLICY deny_all_customer_anamneses ON public.customer_anamneses
  FOR ALL USING (false) WITH CHECK (false);
REVOKE ALL ON TABLE public.customer_anamneses FROM anon, authenticated;

DO $$
DECLARE
  tabela text;
  aberta int;
BEGIN
  FOREACH tabela IN ARRAY ARRAY['anamnesis_templates', 'customer_anamneses'] LOOP
    IF to_regclass('public.' || tabela) IS NULL THEN
      RAISE EXCEPTION '062 FALHOU: tabela % não foi criada', tabela;
    END IF;

    IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = ('public.' || tabela)::regclass) THEN
      RAISE EXCEPTION '062 FALHOU: % sem RLS', tabela;
    END IF;

    SELECT count(*) INTO aberta
      FROM pg_policy
     WHERE polrelid = ('public.' || tabela)::regclass
       AND pg_get_expr(polqual, polrelid) <> 'false';

    IF aberta > 0 THEN
      RAISE EXCEPTION '062 FALHOU: % policy(ies) permissiva(s) em %', aberta, tabela;
    END IF;

    IF has_table_privilege('anon', 'public.' || tabela, 'SELECT') OR
       has_table_privilege('authenticated', 'public.' || tabela, 'SELECT') THEN
      RAISE EXCEPTION '062 FALHOU: % ainda legível por anon/authenticated', tabela;
    END IF;
  END LOOP;

  RAISE NOTICE '062 OK: anamnesis_templates e customer_anamneses (RLS on, deny_all, REVOKE)';
END $$;
