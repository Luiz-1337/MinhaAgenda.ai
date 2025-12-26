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
-- Esta função verifica se as colunas existem antes de tentar atualizá-las
create or replace function "public"."update_profile_on_signup"(
  p_user_id uuid,
  p_full_name text,
  p_first_name text,
  p_last_name text,
  p_phone text,
  p_billing_address text,
  p_billing_postal_code text,
  p_billing_city text,
  p_billing_state text,
  p_billing_country text,
  p_billing_address_complement text,
  p_role text,
  p_tier text,
  p_salon_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_set_clauses text := '';
  v_has_first_name boolean;
  v_has_last_name boolean;
  v_has_billing_address boolean;
  v_has_billing_postal_code boolean;
  v_has_billing_city boolean;
  v_has_billing_state boolean;
  v_has_billing_country boolean;
  v_has_billing_address_complement boolean;
  v_has_role boolean;
  v_has_tier boolean;
  v_has_salon_id boolean;
begin
  -- Verificar quais colunas existem
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'first_name'
  ) INTO v_has_first_name;
  
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'last_name'
  ) INTO v_has_last_name;
  
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'billing_address'
  ) INTO v_has_billing_address;
  
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'billing_postal_code'
  ) INTO v_has_billing_postal_code;
  
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'billing_city'
  ) INTO v_has_billing_city;
  
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'billing_state'
  ) INTO v_has_billing_state;
  
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'billing_country'
  ) INTO v_has_billing_country;
  
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'billing_address_complement'
  ) INTO v_has_billing_address_complement;
  
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'role'
  ) INTO v_has_role;
  
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'tier'
  ) INTO v_has_tier;
  
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'salon_id'
  ) INTO v_has_salon_id;
  
  -- Construir cláusulas SET apenas para colunas que existem
  v_set_clauses := 'full_name = ' || quote_literal(p_full_name);
  
  IF v_has_first_name THEN
    v_set_clauses := v_set_clauses || ', first_name = ' || quote_literal(p_first_name);
  END IF;
  
  IF v_has_last_name THEN
    v_set_clauses := v_set_clauses || ', last_name = ' || quote_literal(p_last_name);
  END IF;
  
  IF p_phone IS NOT NULL THEN
    v_set_clauses := v_set_clauses || ', phone = ' || quote_literal(p_phone);
  END IF;
  
  IF v_has_billing_address AND p_billing_address IS NOT NULL THEN
    v_set_clauses := v_set_clauses || ', billing_address = ' || quote_literal(p_billing_address);
  END IF;
  
  IF v_has_billing_postal_code AND p_billing_postal_code IS NOT NULL THEN
    v_set_clauses := v_set_clauses || ', billing_postal_code = ' || quote_literal(p_billing_postal_code);
  END IF;
  
  IF v_has_billing_city AND p_billing_city IS NOT NULL THEN
    v_set_clauses := v_set_clauses || ', billing_city = ' || quote_literal(p_billing_city);
  END IF;
  
  IF v_has_billing_state AND p_billing_state IS NOT NULL THEN
    v_set_clauses := v_set_clauses || ', billing_state = ' || quote_literal(p_billing_state);
  END IF;
  
  IF v_has_billing_country THEN
    v_set_clauses := v_set_clauses || ', billing_country = ' || quote_literal(COALESCE(p_billing_country, 'BR'));
  END IF;
  
  IF v_has_billing_address_complement AND p_billing_address_complement IS NOT NULL THEN
    v_set_clauses := v_set_clauses || ', billing_address_complement = ' || quote_literal(p_billing_address_complement);
  END IF;
  
  IF v_has_role AND p_role IS NOT NULL THEN
    v_set_clauses := v_set_clauses || ', role = ' || quote_literal(p_role) || '::profile_role';
  END IF;
  
  IF v_has_tier AND p_tier IS NOT NULL THEN
    v_set_clauses := v_set_clauses || ', tier = ' || quote_literal(p_tier) || '::subscription_tier';
  END IF;
  
  IF v_has_salon_id AND p_salon_id IS NOT NULL THEN
    v_set_clauses := v_set_clauses || ', salon_id = ' || quote_literal(p_salon_id);
  END IF;
  
  v_set_clauses := v_set_clauses || ', updated_at = now()';
  
  -- Executar UPDATE dinâmico
  EXECUTE format('UPDATE "public"."profiles" SET %s WHERE id = %L', v_set_clauses, p_user_id);
end;
$$;

