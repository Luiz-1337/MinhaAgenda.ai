-- 015_revoke_secdef_execute.sql  (SEC-3)
-- Objetivo: revogar EXECUTE de anon/authenticated/public nas funções SECURITY DEFINER
-- expostas via /rest/v1/rpc/: handle_new_user() e os overloads de update_profile_on_signup().
-- O signup legítimo roda server-side (service_role), então revogar não quebra o fluxo.
-- handle_new_user normalmente é trigger em auth.users (disparado pelo Auth, não por RPC).
--
-- Usa pg_proc para cobrir TODOS os overloads sem precisar das assinaturas exatas. Idempotente.

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('handle_new_user', 'update_profile_on_signup')
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon, authenticated, public;', r.sig);
    RAISE NOTICE '015: EXECUTE revogado de %', r.sig;
  END LOOP;
END $$;
