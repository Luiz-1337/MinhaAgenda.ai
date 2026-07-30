-- 029_customer_notes.sql
-- Notas de atendimento com AUTOR e DATA.
--
-- O substituto atual é `customers.preferences->>'notes'`: um campo único, que a UI
-- SOBRESCREVE a cada edição (actions/customers.ts, updateSalonCustomer), sem autor,
-- sem data e sem histórico. Pior: divide o mesmo jsonb com as chaves que a IA grava
-- (favoriteProfessional, allergies, ...), então salvar a nota pela tela com o campo
-- vazio apaga o que o agente havia aprendido sobre o cliente.
--
-- Nota é registro de atendimento, não configuração: "cliente pediu para não usar
-- secador", "veio reclamando do corte anterior". Precisa de quem escreveu e quando,
-- e precisa acumular.
--
-- Cópia literal do padrão multi-tenant de 020_customer_tags.sql: salon_id + FK
-- cascade + índices + RLS ON + policy deny_all + REVOKE de anon/authenticated.
-- Aditiva. Idempotente.

CREATE TABLE IF NOT EXISTS public.customer_notes (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  salon_id          uuid NOT NULL REFERENCES public.salons(id)    ON DELETE CASCADE,
  customer_id       uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  -- SET NULL e não CASCADE: a nota é do salão, não da pessoa que digitou. Quando um
  -- funcionário sai (e admin/users.ts apaga o profile), a informação sobre o cliente
  -- tem que sobreviver — só deixa de ter autor conhecido.
  author_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  body              text NOT NULL,
  created_at        timestamp NOT NULL DEFAULT now(),
  updated_at        timestamp NOT NULL DEFAULT now()
);

-- Serve a ficha: notas de um cliente, mais recentes primeiro.
CREATE INDEX IF NOT EXISTS customer_notes_customer_idx
  ON public.customer_notes (customer_id, created_at DESC);
-- Escopo de tenant para varredura/limpeza por salão.
CREATE INDEX IF NOT EXISTS customer_notes_salon_idx
  ON public.customer_notes (salon_id, created_at DESC);

-- RLS Drizzle-only: o acesso é só via postgres/service_role (bypassrls), como
-- customers e customer_tags. A policy deny_all + REVOKE fecham o PostgREST.
ALTER TABLE public.customer_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS deny_all_customer_notes ON public.customer_notes;
CREATE POLICY deny_all_customer_notes ON public.customer_notes
  FOR ALL USING (false) WITH CHECK (false);

REVOKE ALL ON TABLE public.customer_notes FROM anon, authenticated;

DO $$
DECLARE
  aberta int;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = 'customer_notes'
  ) THEN
    RAISE EXCEPTION '029 FALHOU: tabela customer_notes não foi criada';
  END IF;

  SELECT count(*) INTO aberta
    FROM pg_policy
   WHERE polrelid = 'public.customer_notes'::regclass
     AND pg_get_expr(polqual, polrelid) <> 'false';

  IF aberta > 0 THEN
    RAISE EXCEPTION '029 FALHOU: customer_notes tem policy permissiva';
  END IF;

  RAISE NOTICE '029 OK: customer_notes (RLS on, deny_all, REVOKE anon/authenticated)';
END $$;
