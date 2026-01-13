"use server"

import { redirect } from "next/navigation"
import { headers } from "next/headers"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import type { ActionState } from "@/lib/types/common"
import { formatAuthError } from "@/lib/services/error.service"
import { normalizeEmail, normalizeString } from "@/lib/services/validation.service"
import { getOwnerSalonId, isSalonOwnerError } from "@/lib/services/salon.service"
import { db, profiles, salons, eq, sql } from "@repo/db"

/**
 * Realiza login do usuário
 */
export async function login(prevState: ActionState, formData: FormData): Promise<ActionState> {
  const email = normalizeEmail(String(formData.get("email") || ""))
  const password = normalizeString(String(formData.get("password") || ""))

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) {
    return { error: formatAuthError(error) }
  }

  // Verifica se o usuário tem um salão
  const salonResult = await getOwnerSalonId()
  
  // Se não tiver salão, redireciona para onboarding
  if (isSalonOwnerError(salonResult)) {
    redirect("/onboarding")
  }

  // Se tiver salão, redireciona para o dashboard do salão
  redirect(`/${salonResult.salonId}/dashboard`)
}

/**
 * Realiza cadastro de novo usuário
 */
export async function signup(prevState: ActionState, formData: FormData): Promise<ActionState> {
  const full_name = normalizeString(String(formData.get("full_name") || ""))
  const email = normalizeEmail(String(formData.get("email") || ""))
  const password = normalizeString(String(formData.get("password") || ""))
  const salon_name = normalizeString(String(formData.get("salon_name") || ""))
  let planInput = String(formData.get("plan") || "SOLO").toUpperCase()
  
  // Valid tiers
  const VALID_TIERS = ['SOLO', 'PRO', 'ENTERPRISE']
  if (!VALID_TIERS.includes(planInput)) {
    planInput = 'SOLO'
  }
  const plan = planInput as 'SOLO' | 'PRO' | 'ENTERPRISE'

  if (!salon_name) {
    return { error: "Nome do salão é obrigatório." }
  }

  // VALIDAÇÃO E PREPARAÇÃO ANTES DE CRIAR O USUÁRIO NO AUTH
  // Isso garante que se der erro, o usuário não será criado no Supabase Auth

  // 1. Preparar tipos e função no banco ANTES de criar usuário
  try {
        // Criar tipos se não existirem (usando verificação explícita, pois IF NOT EXISTS não funciona para enums)
        await db.execute(sql`
          DO $$ BEGIN
            IF NOT EXISTS (
              SELECT 1 FROM pg_type t
              JOIN pg_namespace n ON n.oid = t.typnamespace
              WHERE t.typname = 'profile_role' AND n.nspname = 'public'
            ) THEN
              CREATE TYPE "public"."profile_role" AS ENUM('OWNER', 'PROFESSIONAL', 'CLIENT');
            END IF;
          END $$;
        `)
        
        await db.execute(sql`
          DO $$ BEGIN
            IF NOT EXISTS (
              SELECT 1 FROM pg_type t
              JOIN pg_namespace n ON n.oid = t.typnamespace
              WHERE t.typname = 'subscription_tier' AND n.nspname = 'public'
            ) THEN
              CREATE TYPE "public"."subscription_tier" AS ENUM('SOLO', 'PRO', 'ENTERPRISE');
            END IF;
          END $$;
        `)

        // Criar função atualizada que verifica colunas dinamicamente
        await db.execute(sql`
          CREATE OR REPLACE FUNCTION "public"."update_profile_on_signup"(
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
          RETURNS void
          LANGUAGE plpgsql
          SECURITY DEFINER
          SET search_path = public
          AS $$
          DECLARE
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
          BEGIN
            SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'first_name') INTO v_has_first_name;
            SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'last_name') INTO v_has_last_name;
            SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'billing_address') INTO v_has_billing_address;
            SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'billing_postal_code') INTO v_has_billing_postal_code;
            SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'billing_city') INTO v_has_billing_city;
            SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'billing_state') INTO v_has_billing_state;
            SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'billing_country') INTO v_has_billing_country;
            SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'billing_address_complement') INTO v_has_billing_address_complement;
            SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'role') INTO v_has_role;
            SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'tier') INTO v_has_tier;
            SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'salon_id') INTO v_has_salon_id;
            
            v_set_clauses := 'full_name = ' || quote_literal(p_full_name);
            IF v_has_first_name THEN v_set_clauses := v_set_clauses || ', first_name = ' || quote_literal(p_first_name); END IF;
            IF v_has_last_name THEN v_set_clauses := v_set_clauses || ', last_name = ' || quote_literal(p_last_name); END IF;
            IF p_phone IS NOT NULL THEN v_set_clauses := v_set_clauses || ', phone = ' || quote_literal(p_phone); END IF;
            IF v_has_billing_address AND p_billing_address IS NOT NULL THEN v_set_clauses := v_set_clauses || ', billing_address = ' || quote_literal(p_billing_address); END IF;
            IF v_has_billing_postal_code AND p_billing_postal_code IS NOT NULL THEN v_set_clauses := v_set_clauses || ', billing_postal_code = ' || quote_literal(p_billing_postal_code); END IF;
            IF v_has_billing_city AND p_billing_city IS NOT NULL THEN v_set_clauses := v_set_clauses || ', billing_city = ' || quote_literal(p_billing_city); END IF;
            IF v_has_billing_state AND p_billing_state IS NOT NULL THEN v_set_clauses := v_set_clauses || ', billing_state = ' || quote_literal(p_billing_state); END IF;
            IF v_has_billing_country THEN v_set_clauses := v_set_clauses || ', billing_country = ' || quote_literal(COALESCE(p_billing_country, 'BR')); END IF;
            IF v_has_billing_address_complement AND p_billing_address_complement IS NOT NULL THEN v_set_clauses := v_set_clauses || ', billing_address_complement = ' || quote_literal(p_billing_address_complement); END IF;
            IF v_has_role AND p_role IS NOT NULL THEN v_set_clauses := v_set_clauses || ', role = ' || quote_literal(p_role) || '::profile_role'; END IF;
            IF v_has_tier AND p_tier IS NOT NULL THEN v_set_clauses := v_set_clauses || ', tier = ' || quote_literal(p_tier) || '::subscription_tier'; END IF;
            IF v_has_salon_id AND p_salon_id IS NOT NULL THEN v_set_clauses := v_set_clauses || ', salon_id = ' || quote_literal(p_salon_id); END IF;
            v_set_clauses := v_set_clauses || ', updated_at = now()';
            EXECUTE format('UPDATE "public"."profiles" SET %s WHERE id = %L', v_set_clauses, p_user_id);
          END;
          $$;
        `)
  } catch (createErr) {
    // Se falhar ao preparar tipos/função, retornar erro SEM criar usuário
    console.error("Erro ao preparar tipos/função no banco:", createErr)
    return { error: `Erro ao preparar banco de dados: ${(createErr as Error).message}` }
  }

  // 2. AGORA SIM: Criar usuário no Supabase Auth (após tudo estar pronto)
  const supabase = await createClient()
  let authData: { user: { id: string } | null } | null = null
  let userId: string | null = null

  try {
    const signUpResult = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name },
      },
    })

    if (signUpResult.error) {
      return { error: formatAuthError(signUpResult.error) }
    }

    if (!signUpResult.data.user) {
      return { error: "Erro ao criar usuário" }
    }

    authData = signUpResult.data
    userId = signUpResult.data.user.id

    // Aguardar um pouco para garantir que o trigger do Supabase criou o perfil
    await new Promise(resolve => setTimeout(resolve, 500))

    // 3. Fazer tudo em uma transação usando Drizzle
    // Usar função stored procedure para bypassar RLS
    await db.transaction(async (tx) => {
      // 1. Atualizar o perfil usando função stored procedure (bypassa RLS)
      // O trigger já criou o perfil, então apenas atualizamos
      // Nota: auth.ts usa fluxo simplificado, campos de billing podem ser preenchidos depois
      await tx.execute(sql`
        SELECT update_profile_on_signup(
          ${userId}::uuid,
            ${full_name}::text,
            NULL::text,
            NULL::text,
            NULL::text,
            NULL::text,
            NULL::text,
            NULL::text,
            NULL::text,
            'BR'::text,
            NULL::text,
            ${'OWNER'}::text,
            ${plan}::text,
            NULL::uuid
          )
        `)

      // 2. Criar salão
      if (!userId) {
        throw new Error("User ID is required to create salon")
      }
      const slug = salon_name.toLowerCase().replace(/[^a-z0-9]/g, '-') + '-' + Math.random().toString(36).substring(2, 7)
      const [newSalon] = await tx.insert(salons)
        .values({
          name: salon_name,
          ownerId: userId!, // Non-null assertion: userId is guaranteed to exist at this point
          slug,
          subscriptionStatus: 'ACTIVE', // Mock payment as active
        })
        .returning({ id: salons.id })

      // 3. Vincular salão ao perfil usando função stored procedure
      await tx.execute(sql`
        SELECT update_profile_on_signup(
          ${userId}::uuid,
            ${full_name}::text,
            NULL::text,
            NULL::text,
            NULL::text,
            NULL::text,
            NULL::text,
            NULL::text,
            NULL::text,
            'BR'::text,
            NULL::text,
            ${'OWNER'}::text,
            ${plan}::text,
          ${newSalon.id}::uuid
        )
      `)
    })
  } catch (err) {
    console.error("Erro CRÍTICO ao configurar conta no DB:", err)
    
    // Deletar o usuário do Auth se a criação do perfil/salão falhar
    // Isso garante que não fiquem usuários órfãos no sistema
    if (userId) {
      try {
        const adminClient = createAdminClient()
        if (adminClient) {
          await adminClient.auth.admin.deleteUser(userId)
          console.log(`Usuário ${userId} deletado do Auth devido a erro na criação do perfil`)
        } else {
          console.warn(`Não foi possível deletar usuário ${userId} do Auth: SUPABASE_SERVICE_ROLE_KEY não configurada`)
        }
      } catch (deleteErr) {
        console.error("Erro ao deletar usuário do Auth após falha:", deleteErr)
        // Continuar mesmo se a deleção falhar - o importante é reportar o erro original
      }
    }
    
    return { error: `Erro ao configurar sua conta. Detalhe: ${(err as Error).message}` }
  }

  // Novos usuários sempre precisam fazer onboarding
  redirect("/onboarding")
}

/**
 * Solicita recuperação de senha
 * Envia email com link para redefinição
 */
export async function resetPasswordRequest(prevState: ActionState, formData: FormData): Promise<ActionState> {
  const email = normalizeEmail(String(formData.get("email") || ""))

  if (!email) {
    return { error: "Email é obrigatório." }
  }

  const supabase = await createClient()
  
  // Obter a URL base do ambiente
  const headersList = await headers()
  const host = headersList.get('host') || 'localhost:3000'
  const protocol = process.env.NODE_ENV === 'production' ? 'https' : 'http'
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || `${protocol}://${host}`
  const redirectUrl = `${baseUrl}/reset-password`

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: redirectUrl,
  })

  if (error) {
    // Por segurança, não revelamos se o email existe ou não
    // Sempre retornamos sucesso, mas logamos o erro para debug
    console.error("Erro ao solicitar recuperação de senha:", error)
    // Retornamos mensagem genérica mesmo em caso de erro
    // Isso previne enumeração de emails
  }

  // Sempre retornamos sucesso para não revelar se o email existe
  return { error: "" }
}

/**
 * Atualiza a senha do usuário
 * Deve ser chamado após o usuário clicar no link do email
 */
export async function resetPassword(prevState: ActionState, formData: FormData): Promise<ActionState> {
  const password = normalizeString(String(formData.get("password") || ""))
  const confirmPassword = normalizeString(String(formData.get("confirmPassword") || ""))

  if (!password) {
    return { error: "Senha é obrigatória." }
  }

  if (password.length < 6) {
    return { error: "A senha deve ter no mínimo 6 caracteres." }
  }

  if (password !== confirmPassword) {
    return { error: "As senhas não coincidem." }
  }

  const supabase = await createClient()
  
  // Verificar se há uma sessão ativa (criada pelo link do email)
  const { data: { session } } = await supabase.auth.getSession()
  
  if (!session) {
    return { error: "Link inválido ou expirado. Por favor, solicite um novo link de recuperação." }
  }

  const { error } = await supabase.auth.updateUser({
    password: password,
  })

  if (error) {
    return { error: formatAuthError(error) }
  }

  // Senha atualizada com sucesso, redirecionar para login
  redirect("/login?passwordReset=success")
}
