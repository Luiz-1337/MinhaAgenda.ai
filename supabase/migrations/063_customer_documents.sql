-- 063_customer_documents.sql
-- Documentos com assinatura: o salão escreve modelos de termo, gera um documento
-- para um cliente e o cliente assina por um link, sem login
-- (docs/ROADMAP.md, fase 7, fatia 7e).
--
--   document_templates    os modelos do salão (nome e texto)
--   customer_documents    cada documento gerado para um cliente, e a assinatura
--
-- Decisões que o SQL carrega:
--   - O documento é um RETRATO: guarda título e texto como estavam no dia em que
--     foi gerado, e o SHA-256 desse texto. Alterar ou excluir o modelo não muda o
--     que foi (ou vai ser) assinado (template_id vira NULL).
--   - A credencial do link é o token (aleatório, único no sistema inteiro).
--   - Assinado = signed_at preenchido. Nome de quem assinou, imagem da assinatura
--     e data andam juntos (CHECK): ou os três, ou nenhum.
--   - A imagem da assinatura é um PNG pequeno, guardado na própria linha (data
--     URL). Não usa storage: fica atrás do mesmo RLS deny_all do resto.
--   - Excluir o cliente apaga os documentos dele (CASCADE). Quem impede excluir
--     cliente com documento ASSINADO é a aplicação, com aviso.
--
-- Padrão multi-tenant das anteriores: salon_id + FK cascade do salão + RLS ON +
-- policy deny_all + REVOKE de anon/authenticated.
-- Só tabelas novas: não mexe em nenhuma tabela existente.
-- Idempotente.

CREATE TABLE IF NOT EXISTS public.document_templates (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  salon_id   uuid NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,
  name       text NOT NULL,
  body       text NOT NULL,
  -- Modelo inativo não aparece para gerar documento; os já gerados ficam.
  is_active  boolean NOT NULL DEFAULT true,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT document_templates_name_check CHECK (length(btrim(name)) BETWEEN 1 AND 80),
  CONSTRAINT document_templates_body_check CHECK (length(body) BETWEEN 1 AND 20000)
);

CREATE UNIQUE INDEX IF NOT EXISTS document_templates_salon_name_unique
  ON public.document_templates (salon_id, lower(name));

ALTER TABLE public.document_templates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS deny_all_document_templates ON public.document_templates;
CREATE POLICY deny_all_document_templates ON public.document_templates
  FOR ALL USING (false) WITH CHECK (false);
REVOKE ALL ON TABLE public.document_templates FROM anon, authenticated;

CREATE TABLE IF NOT EXISTS public.customer_documents (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  salon_id          uuid NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,
  customer_id       uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  template_id       uuid REFERENCES public.document_templates(id) ON DELETE SET NULL,
  -- O título e o texto no dia em que o documento foi gerado, já com os campos
  -- ({{cliente}}, {{salao}}, {{data}}) preenchidos.
  title             text NOT NULL,
  body              text NOT NULL,
  -- SHA-256 (hex) de título + texto: o que foi assinado.
  body_hash         text NOT NULL,
  token             text NOT NULL,
  -- Até quando o link aceita assinatura.
  expires_at        timestamp NOT NULL,
  signed_at         timestamp,
  signer_name       text,
  -- data:image/png;base64,...
  signature_image   text,
  signer_ip         text,
  signer_user_agent text,
  created_by        uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at        timestamp NOT NULL DEFAULT now(),
  CONSTRAINT customer_documents_title_check CHECK (length(btrim(title)) BETWEEN 1 AND 80),
  CONSTRAINT customer_documents_body_check CHECK (length(body) BETWEEN 1 AND 21000),
  CONSTRAINT customer_documents_hash_check CHECK (body_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT customer_documents_token_check CHECK (token ~ '^[A-Za-z0-9_-]{32,64}$'),
  CONSTRAINT customer_documents_signature_check CHECK (
    (signed_at IS NULL AND signer_name IS NULL AND signature_image IS NULL
       AND signer_ip IS NULL AND signer_user_agent IS NULL)
    OR
    (signed_at IS NOT NULL
       AND length(btrim(signer_name)) BETWEEN 3 AND 120
       AND signature_image LIKE 'data:image/png;base64,%'
       AND length(signature_image) <= 200000)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS customer_documents_token_unique
  ON public.customer_documents (token);
CREATE INDEX IF NOT EXISTS customer_documents_customer_idx
  ON public.customer_documents (customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS customer_documents_salon_idx
  ON public.customer_documents (salon_id);
-- Só para o ON DELETE SET NULL não varrer a tabela ao excluir um modelo.
CREATE INDEX IF NOT EXISTS customer_documents_template_idx
  ON public.customer_documents (template_id) WHERE template_id IS NOT NULL;

ALTER TABLE public.customer_documents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS deny_all_customer_documents ON public.customer_documents;
CREATE POLICY deny_all_customer_documents ON public.customer_documents
  FOR ALL USING (false) WITH CHECK (false);
REVOKE ALL ON TABLE public.customer_documents FROM anon, authenticated;

DO $$
DECLARE
  tabela text;
  aberta int;
BEGIN
  FOREACH tabela IN ARRAY ARRAY['document_templates', 'customer_documents'] LOOP
    IF to_regclass('public.' || tabela) IS NULL THEN
      RAISE EXCEPTION '063 FALHOU: tabela % não foi criada', tabela;
    END IF;

    IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = ('public.' || tabela)::regclass) THEN
      RAISE EXCEPTION '063 FALHOU: % sem RLS', tabela;
    END IF;

    SELECT count(*) INTO aberta
      FROM pg_policy
     WHERE polrelid = ('public.' || tabela)::regclass
       AND pg_get_expr(polqual, polrelid) <> 'false';

    IF aberta > 0 THEN
      RAISE EXCEPTION '063 FALHOU: % policy(ies) permissiva(s) em %', aberta, tabela;
    END IF;

    IF has_table_privilege('anon', 'public.' || tabela, 'SELECT') OR
       has_table_privilege('authenticated', 'public.' || tabela, 'SELECT') THEN
      RAISE EXCEPTION '063 FALHOU: % ainda legível por anon/authenticated', tabela;
    END IF;
  END LOOP;

  RAISE NOTICE '063 OK: document_templates e customer_documents (RLS on, deny_all, REVOKE)';
END $$;
