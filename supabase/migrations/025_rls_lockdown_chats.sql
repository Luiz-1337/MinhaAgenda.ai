-- 025_rls_lockdown_chats.sql  (fecha a última das 6 tabelas híbridas do SEC-5)
--
-- `chats` foi deixada de fora do lockdown do 014 (ver 014:8-9) porque era
-- superfície PostgREST REAL: getDashboardStats fazia três leituras via
-- supabase-js (.from("chats"), chave anon/publishable, papel `authenticated`).
-- Enquanto isso a policy era `authenticated_all_chats ... USING (true)`, ou seja
-- QUALQUER usuário autenticado da plataforma lia os chats de QUALQUER salão pelo
-- PostgREST — telefone do cliente final, prévia de mensagem, modo manual.
--
-- Essas três leituras foram reescritas em Drizzle (fix(dashboard): autorizar
-- antes de consultar e tirar `chats` do PostgREST). Critério verificado por grep:
-- `from("chats")` não aparece em nenhum .ts/.tsx do repositório, e não há
-- subscription de realtime/postgres_changes sobre a tabela.
--
-- PRÉ-REQUISITO: o código acima precisa estar EM PRODUÇÃO antes desta migration.
-- Aplicar antes derrubaria os três counts do dashboard (regra do projeto:
-- código -> deploy -> migration).
--
-- Estado em produção antes desta migration (conferido em pg_policy):
--   appointments -> deny_all_appointments  USING (false)
--   customers    -> deny_all_customers     USING (false)
--   messages     -> deny_all_messages      USING (false)
--   chats        -> authenticated_all_chats USING (true)   <- a exceção
-- Depois desta, `chats` fica igual às três irmãs.
--
-- Drizzle roda como postgres/service_role (bypassrls), então o app não sente.
--
-- NÃO toca nas outras cinco híbridas (profiles, salons, professionals,
-- availability, schedule_overrides): elas ainda têm leitura via supabase-js e
-- precisam ser escopadas por salão, não fechadas. É dívida separada.
--
-- Idempotente.

DO $$
BEGIN
  IF to_regclass('public.chats') IS NULL THEN
    RAISE NOTICE '025: tabela public.chats não existe; nada a fazer';
    RETURN;
  END IF;

  ALTER TABLE public.chats ENABLE ROW LEVEL SECURITY;

  -- A policy permissiva sai; a deny-all entra. Ordem importa: dropar depois de
  -- criar deixaria uma janela em que a permissiva ainda vale (policies são OR).
  DROP POLICY IF EXISTS authenticated_all_chats ON public.chats;
  DROP POLICY IF EXISTS deny_all_chats ON public.chats;

  CREATE POLICY deny_all_chats ON public.chats
    FOR ALL USING (false) WITH CHECK (false);

  -- Menor privilégio. Observação honesta: no 014 o REVOKE não pegou 100% em
  -- produção (has_table_privilege ainda devolve true para anon/authenticated nas
  -- tabelas deny_all). Quem faz o enforcement é a policy; o REVOKE é a segunda
  -- camada e vai aqui de propósito, mesmo sabendo disso.
  REVOKE ALL ON TABLE public.chats FROM anon, authenticated;
END $$;

-- Verificação (rodar depois de aplicar; schema.ts não é a verdade do banco):
--   select polname, polcmd, pg_get_expr(polqual, polrelid)
--     from pg_policy where polrelid = 'public.chats'::regclass;
--   -> deny_all_chats | * | false
DO $$
DECLARE
  aberta int;
BEGIN
  SELECT count(*) INTO aberta
    FROM pg_policy
   WHERE polrelid = 'public.chats'::regclass
     AND pg_get_expr(polqual, polrelid) = 'true';

  IF aberta > 0 THEN
    RAISE EXCEPTION '025 FALHOU: ainda existe policy permissiva em public.chats';
  END IF;

  RAISE NOTICE '025 OK: chats fora do PostgREST (deny_all + REVOKE anon/authenticated)';
END $$;
