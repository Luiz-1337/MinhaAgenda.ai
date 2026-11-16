-- 036_access_profiles.sql
-- Perfis de acesso: permissão por recurso × ação (docs/ROADMAP.md, fase 0).
--
-- Até aqui o acesso a um salão tinha três níveis fixos, derivados do papel
-- (dono/OWNER/MANAGER gerenciam, STAFF lê o CRM, o resto não entra). Os módulos de
-- gestão que vêm a seguir (comandas, financeiro, comissões) precisam de permissão
-- mais fina: "fatura comanda mas não edita comanda faturada", "vê só as próprias".
--
-- Duas formas de dar permissão a um profissional, as mesmas da Belasis:
--   - PERFIL reutilizável (`access_profiles`): alterar o perfil vale para todos os
--     vinculados;
--   - PERSONALIZADO (`professionals.custom_permissions`): lista própria, com
--     prioridade sobre o perfil.
--
-- Sem perfil e sem personalização (as duas colunas NULL) o profissional segue o
-- comportamento de hoje pelo papel. É o estado de TODAS as linhas depois desta
-- migration — nenhum salão muda de comportamento ao aplicar.
--
-- `permissions` guarda um array JSON de chaves ("sales.invoice"). O catálogo de
-- chaves válidas vive em código (packages/db/src/domain/permissions.ts), não no
-- banco: chave desconhecida é ignorada na leitura, então remover uma chave do
-- catálogo não exige migration de dados.
--
-- Padrão multi-tenant de 020/029/034: salon_id + FK cascade + RLS ON + policy
-- deny_all + REVOKE de anon/authenticated (acesso só via Drizzle).
-- Aditiva. Idempotente.

CREATE TABLE IF NOT EXISTS public.access_profiles (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  salon_id    uuid NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,
  name        text NOT NULL,
  permissions jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at  timestamp NOT NULL DEFAULT now(),
  updated_at  timestamp NOT NULL DEFAULT now(),
  CONSTRAINT access_profiles_permissions_is_array
    CHECK (jsonb_typeof(permissions) = 'array')
);

-- Nome único por salão, sem diferenciar maiúsculas ("Recepção" = "recepção").
CREATE UNIQUE INDEX IF NOT EXISTS access_profiles_salon_name_unique
  ON public.access_profiles (salon_id, lower(name));

ALTER TABLE public.access_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS deny_all_access_profiles ON public.access_profiles;
CREATE POLICY deny_all_access_profiles ON public.access_profiles
  FOR ALL USING (false) WITH CHECK (false);

REVOKE ALL ON TABLE public.access_profiles FROM anon, authenticated;

-- Excluir um perfil devolve os vinculados ao comportamento do papel (SET NULL),
-- em vez de barrar a exclusão ou de apagar profissionais.
ALTER TABLE public.professionals
  ADD COLUMN IF NOT EXISTS access_profile_id uuid
    REFERENCES public.access_profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS custom_permissions jsonb;

ALTER TABLE public.professionals
  DROP CONSTRAINT IF EXISTS professionals_custom_permissions_is_array;
ALTER TABLE public.professionals
  ADD  CONSTRAINT professionals_custom_permissions_is_array
  CHECK (custom_permissions IS NULL OR jsonb_typeof(custom_permissions) = 'array');

-- FK sem índice de cobertura trava o DELETE do perfil numa varredura da tabela.
CREATE INDEX IF NOT EXISTS professionals_access_profile_idx
  ON public.professionals (access_profile_id)
  WHERE access_profile_id IS NOT NULL;

DO $$
DECLARE
  aberta int;
  faltando int;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = 'access_profiles'
  ) THEN
    RAISE EXCEPTION '036 FALHOU: tabela access_profiles não foi criada';
  END IF;

  SELECT count(*) INTO aberta
    FROM pg_policy
   WHERE polrelid = 'public.access_profiles'::regclass
     AND pg_get_expr(polqual, polrelid) <> 'false';

  IF aberta > 0 THEN
    RAISE EXCEPTION '036 FALHOU: access_profiles tem policy permissiva';
  END IF;

  SELECT count(*) INTO faltando
    FROM (VALUES ('access_profile_id'), ('custom_permissions')) AS v(col)
   WHERE NOT EXISTS (
     SELECT 1 FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name = 'professionals'
        AND c.column_name = v.col
   );

  IF faltando > 0 THEN
    RAISE EXCEPTION '036 FALHOU: % coluna(s) nova(s) ausente(s) em professionals', faltando;
  END IF;

  RAISE NOTICE '036 OK: access_profiles (RLS on, deny_all, REVOKE) + professionals.access_profile_id/custom_permissions';
END $$;
