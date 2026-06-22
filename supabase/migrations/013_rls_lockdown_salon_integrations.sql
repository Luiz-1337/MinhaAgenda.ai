-- 013_rls_lockdown_salon_integrations.sql  (SEC-1 — P0)
-- Objetivo: parar o vazamento dos tokens OAuth (access_token/refresh_token) de
-- salon_integrations via anon key. Advisor: sensitive_columns_exposed (ERROR).
--
-- Por que é seguro: salon_integrations é Drizzle-only (acessada só via role postgres/
-- service_role, ambos com rolbypassrls=true). Ligar RLS SEM policy = deny-all para
-- anon/authenticated; o app (Drizzle) continua lendo/gravando normalmente.
-- NÃO criamos policy de propósito (deny-all). A cifragem em repouso é separada (SEC-6).
--
-- Idempotente: ENABLE RLS e REVOKE são no-ops se já aplicados.
-- PRÉ-REQUISITO OPERACIONAL: rotacionar a credencial vazada antes/junto (SEC-0),
-- senão quem tem a service_role vazada continua ignorando esta RLS (bypassrls).

ALTER TABLE public.salon_integrations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.salon_integrations FROM anon, authenticated;

DO $$
BEGIN
  RAISE NOTICE '013 OK: RLS habilitada e grants revogados em salon_integrations';
END $$;
