-- Criar tipos se não existirem
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'profile_role' AND n.nspname = 'public'
  ) THEN
    CREATE TYPE "public"."profile_role" AS ENUM('OWNER', 'PROFESSIONAL', 'CLIENT');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'subscription_tier' AND n.nspname = 'public'
  ) THEN
    CREATE TYPE "public"."subscription_tier" AS ENUM('SOLO', 'PRO', 'ENTERPRISE');
  END IF;
END $$;

-- Função para atualizar perfil durante signup (bypassa RLS)
create or replace function "public"."update_profile_on_signup"(
  p_user_id uuid,
  p_full_name text,
  p_role text,
  p_tier text,
  p_salon_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update "public"."profiles"
  set
    full_name = p_full_name,
    role = p_role::profile_role,
    tier = p_tier::subscription_tier,
    salon_id = coalesce(p_salon_id, salon_id),
    updated_at = now()
  where id = p_user_id;
end;
$$;

