-- 064_report_favorites.sql
-- Favoritos da central de relatórios (docs/ROADMAP.md, fase 9, fatia 9a).
--
--   report_favorites    os relatórios que UMA pessoa marcou com estrela, num salão
--
-- Decisões que o SQL carrega:
--   - O favorito é da PESSOA no salão (não do salão): cada um monta os seus.
--   - `report_key` é a chave do catálogo em código (domain/report-catalog.ts). O
--     banco só confere o formato; chave que sair do catálogo é ignorada na leitura.
--   - Sair do salão ou excluir o usuário apaga os favoritos (CASCADE).
--
-- Padrão multi-tenant das anteriores: salon_id + FK cascade do salão + RLS ON +
-- policy deny_all + REVOKE de anon/authenticated.
-- Só tabela nova: não mexe em nenhuma tabela existente.
-- Idempotente.

CREATE TABLE IF NOT EXISTS public.report_favorites (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  salon_id   uuid NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  report_key text NOT NULL,
  created_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT report_favorites_key_check CHECK (report_key ~ '^[a-z_]{1,40}\.[a-z_]{1,40}$')
);

CREATE UNIQUE INDEX IF NOT EXISTS report_favorites_user_key_unique
  ON public.report_favorites (salon_id, user_id, report_key);
CREATE INDEX IF NOT EXISTS report_favorites_user_idx
  ON public.report_favorites (user_id);

ALTER TABLE public.report_favorites ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS deny_all_report_favorites ON public.report_favorites;
CREATE POLICY deny_all_report_favorites ON public.report_favorites
  FOR ALL USING (false) WITH CHECK (false);
REVOKE ALL ON TABLE public.report_favorites FROM anon, authenticated;

DO $$
DECLARE
  aberta int;
BEGIN
  IF to_regclass('public.report_favorites') IS NULL THEN
    RAISE EXCEPTION '064 FALHOU: tabela report_favorites não foi criada';
  END IF;

  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.report_favorites'::regclass) THEN
    RAISE EXCEPTION '064 FALHOU: report_favorites sem RLS';
  END IF;

  SELECT count(*) INTO aberta
    FROM pg_policy
   WHERE polrelid = 'public.report_favorites'::regclass
     AND pg_get_expr(polqual, polrelid) <> 'false';
  IF aberta > 0 THEN
    RAISE EXCEPTION '064 FALHOU: % policy(ies) permissiva(s) em report_favorites', aberta;
  END IF;

  IF has_table_privilege('anon', 'public.report_favorites', 'SELECT') OR
     has_table_privilege('authenticated', 'public.report_favorites', 'SELECT') THEN
    RAISE EXCEPTION '064 FALHOU: report_favorites ainda legível por anon/authenticated';
  END IF;

  RAISE NOTICE '064 OK: report_favorites (RLS on, deny_all, REVOKE)';
END $$;
