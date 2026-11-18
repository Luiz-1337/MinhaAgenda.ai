-- 056_reviews.sql
-- Avaliações pós-atendimento: o cliente dá uma nota à comanda faturada, por um
-- link (docs/ROADMAP.md, fase 6, fatia 6c).
--
--   review_settings   a configuração do salão: ligado e os textos do formulário
--   reviews           um pedido de avaliação por comanda faturada, com a resposta
--
-- Decisões que o SQL carrega:
--   - Um pedido por comanda (índice único). Ele nasce no faturamento, com um
--     token aleatório que é a única credencial do formulário público.
--   - Pendente = sem nota e sem data de resposta; respondida = com as duas
--     (CHECK). Responde-se uma vez só.
--   - O pedido aponta para a comanda com CASCADE, mas o serviço só apaga o pedido
--     PENDENTE quando a comanda é excluída: a avaliação que o cliente escreveu fica.
--   - A data do atendimento é cópia do dia da comanda: é o que o formulário mostra.
--
-- Padrão multi-tenant das anteriores: salon_id + FK cascade do salão + RLS ON +
-- policy deny_all + REVOKE de anon/authenticated. O formulário público NÃO lê a
-- tabela pelo cliente do Supabase: passa pelo servidor, que procura pelo token.
-- Aditiva. Idempotente. Não mexe em tabela existente.

-- ---------------------------------------------------------------------------
-- review_settings
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.review_settings (
  salon_id     uuid PRIMARY KEY REFERENCES public.salons(id) ON DELETE CASCADE,
  is_enabled   boolean NOT NULL DEFAULT false,
  -- Textos do formulário. NULL = usa o texto padrão do sistema.
  title        text,
  welcome_text text,
  thanks_text  text,
  created_at   timestamp NOT NULL DEFAULT now(),
  updated_at   timestamp NOT NULL DEFAULT now()
);

ALTER TABLE public.review_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS deny_all_review_settings ON public.review_settings;
CREATE POLICY deny_all_review_settings ON public.review_settings
  FOR ALL USING (false) WITH CHECK (false);
REVOKE ALL ON TABLE public.review_settings FROM anon, authenticated;

-- ---------------------------------------------------------------------------
-- reviews
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.reviews (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  salon_id     uuid NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,
  sale_id      uuid NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
  -- Sem ON DELETE, como sales: cliente com avaliação não se apaga.
  customer_id  uuid NOT NULL REFERENCES public.customers(id),
  -- A credencial do formulário público. Aleatório, único no sistema inteiro.
  token        text NOT NULL,
  -- Dia da comanda (Brasília): o "atendimento de dd/mm" do formulário.
  service_date date NOT NULL,
  -- 1 a 5. NULL = ainda não respondeu.
  rating       smallint,
  comment      text,
  requested_at timestamp NOT NULL DEFAULT now(),
  responded_at timestamp,
  CONSTRAINT reviews_rating_check CHECK (rating IS NULL OR (rating >= 1 AND rating <= 5)),
  CONSTRAINT reviews_response_check CHECK ((rating IS NULL) = (responded_at IS NULL)),
  CONSTRAINT reviews_comment_check CHECK (comment IS NULL OR rating IS NOT NULL),
  CONSTRAINT reviews_token_check CHECK (length(token) >= 32)
);

CREATE UNIQUE INDEX IF NOT EXISTS reviews_token_unique ON public.reviews (token);
-- Um pedido por comanda.
CREATE UNIQUE INDEX IF NOT EXISTS reviews_sale_unique ON public.reviews (sale_id);
-- A lista e o painel do salão, por dia do atendimento.
CREATE INDEX IF NOT EXISTS reviews_salon_date_idx ON public.reviews (salon_id, service_date DESC);
CREATE INDEX IF NOT EXISTS reviews_customer_idx ON public.reviews (customer_id);

ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS deny_all_reviews ON public.reviews;
CREATE POLICY deny_all_reviews ON public.reviews
  FOR ALL USING (false) WITH CHECK (false);
REVOKE ALL ON TABLE public.reviews FROM anon, authenticated;

-- ---------------------------------------------------------------------------
-- Conferência
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  tabela   text;
  aberta   int;
BEGIN
  FOREACH tabela IN ARRAY ARRAY['review_settings', 'reviews'] LOOP
    IF to_regclass('public.' || tabela) IS NULL THEN
      RAISE EXCEPTION '056 FALHOU: tabela % não foi criada', tabela;
    END IF;

    IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = ('public.' || tabela)::regclass) THEN
      RAISE EXCEPTION '056 FALHOU: % sem RLS', tabela;
    END IF;

    SELECT count(*) INTO aberta
      FROM pg_policy
     WHERE polrelid = ('public.' || tabela)::regclass
       AND pg_get_expr(polqual, polrelid) <> 'false';

    IF aberta > 0 THEN
      RAISE EXCEPTION '056 FALHOU: % policy(ies) permissiva(s) em %', aberta, tabela;
    END IF;

    IF has_table_privilege('anon', 'public.' || tabela, 'SELECT') OR
       has_table_privilege('authenticated', 'public.' || tabela, 'SELECT') THEN
      RAISE EXCEPTION '056 FALHOU: % ainda legível por anon/authenticated', tabela;
    END IF;
  END LOOP;

  RAISE NOTICE '056 OK: review_settings, reviews (RLS on, deny_all, REVOKE)';
END $$;
