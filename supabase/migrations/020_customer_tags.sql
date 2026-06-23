-- 020_customer_tags.sql
-- Tags personalizáveis de contatos: catálogo por salão (nome + cor) + junção M:N
-- com customers. Additivo (só cria objetos novos; não toca dados existentes).
-- Idempotente (IF [NOT] EXISTS). Escala pequena → CREATE INDEX simples basta.
--
-- RLS: ambas são Drizzle-only (acesso só via postgres/service_role, bypassrls),
-- como customers. Espelha a proteção REAL de customers em prod: RLS ON + policy
-- deny-all (USING false) + REVOKE de anon/authenticated. Roles bypassrls usados
-- pelo Drizzle ignoram a policy. NÃO entram nas 6 tabelas híbridas do PostgREST.

-- 1) Catálogo de tags
CREATE TABLE IF NOT EXISTS public.customer_tags (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  salon_id   uuid NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,
  name       text NOT NULL,
  color      text NOT NULL DEFAULT '#94a3b8',
  position   integer NOT NULL DEFAULT 0,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS customer_tags_salon_idx
  ON public.customer_tags (salon_id, position);
CREATE UNIQUE INDEX IF NOT EXISTS customer_tags_salon_name_unique
  ON public.customer_tags (salon_id, name);

-- 2) Junção contato <-> tag (PK composta dedupe; cascade nos dois lados)
CREATE TABLE IF NOT EXISTS public.customer_tag_assignments (
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  tag_id      uuid NOT NULL REFERENCES public.customer_tags(id) ON DELETE CASCADE,
  salon_id    uuid NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,
  created_at  timestamp NOT NULL DEFAULT now(),
  PRIMARY KEY (customer_id, tag_id)
);

CREATE INDEX IF NOT EXISTS customer_tag_assignments_tag_idx
  ON public.customer_tag_assignments (tag_id);
CREATE INDEX IF NOT EXISTS customer_tag_assignments_salon_customer_idx
  ON public.customer_tag_assignments (salon_id, customer_id);

-- 3) RLS Drizzle-only: ENABLE + policy deny-all + REVOKE
ALTER TABLE public.customer_tags            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_tag_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS deny_all_customer_tags ON public.customer_tags;
CREATE POLICY deny_all_customer_tags ON public.customer_tags
  FOR ALL USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS deny_all_customer_tag_assignments ON public.customer_tag_assignments;
CREATE POLICY deny_all_customer_tag_assignments ON public.customer_tag_assignments
  FOR ALL USING (false) WITH CHECK (false);

REVOKE ALL ON TABLE public.customer_tags            FROM anon, authenticated;
REVOKE ALL ON TABLE public.customer_tag_assignments FROM anon, authenticated;

DO $$
BEGIN
  RAISE NOTICE '020 OK: customer_tags + customer_tag_assignments (RLS on, REVOKE anon/authenticated)';
END $$;
