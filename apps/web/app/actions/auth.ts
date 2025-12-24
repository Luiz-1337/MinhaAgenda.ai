"use server"

import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
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

  const supabase = await createClient()
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name },
    },
  })

  if (error) {
    return { error: formatAuthError(error) }
  }

  if (data.user) {
    try {
      // Aguardar um pouco para garantir que o trigger do Supabase criou o perfil
      await new Promise(resolve => setTimeout(resolve, 500))

      // Garantir que os tipos e a função existem (criar se não existirem)
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

        // Criar função
        await db.execute(sql`
          CREATE OR REPLACE FUNCTION "public"."update_profile_on_signup"(
            p_user_id uuid,
            p_full_name text,
            p_role text,
            p_tier text,
            p_salon_id uuid default null
          )
          RETURNS void
          LANGUAGE plpgsql
          SECURITY DEFINER
          SET search_path = public
          AS $$
          BEGIN
            UPDATE "public"."profiles"
            SET
              full_name = p_full_name,
              role = p_role::profile_role,
              tier = p_tier::subscription_tier,
              salon_id = COALESCE(p_salon_id, salon_id),
              updated_at = now()
            WHERE id = p_user_id;
          END;
          $$;
        `)
      } catch (createErr) {
        // Ignorar se a função já existe ou se houver outro erro não crítico
        console.log("Erro ao criar função/tipos update_profile_on_signup:", createErr instanceof Error ? createErr.message : String(createErr))
      }

      // Fazer tudo em uma transação usando Drizzle
      // Usar função stored procedure para bypassar RLS
      await db.transaction(async (tx) => {
        // 1. Atualizar o perfil usando função stored procedure (bypassa RLS)
        // O trigger já criou o perfil, então apenas atualizamos
        await tx.execute(sql`
          SELECT update_profile_on_signup(
            ${data.user!.id}::uuid,
            ${full_name}::text,
            ${'OWNER'}::text,
            ${plan}::text,
            NULL::uuid
          )
        `)

        // 2. Criar salão
        const slug = salon_name.toLowerCase().replace(/[^a-z0-9]/g, '-') + '-' + Math.random().toString(36).substring(2, 7)
        const [newSalon] = await tx.insert(salons)
          .values({
            name: salon_name,
            ownerId: data.user!.id,
            slug,
            planTier: plan,
            subscriptionStatus: 'ACTIVE', // Mock payment as active
          })
          .returning({ id: salons.id })

        // 3. Vincular salão ao perfil usando função stored procedure
        await tx.execute(sql`
          SELECT update_profile_on_signup(
            ${data.user!.id}::uuid,
            ${full_name}::text,
            ${'OWNER'}::text,
            ${plan}::text,
            ${newSalon.id}::uuid
          )
        `)
      })
    } catch (err) {
      console.error("Erro CRÍTICO ao configurar conta no DB:", err)
      // Opcional: tentar deletar o usuário do Auth se o DB falhar
      // await supabase.auth.admin.deleteUser(data.user.id) // Requer service role key
      return { error: `Erro ao configurar sua conta. Detalhe: ${(err as Error).message}` }
    }
  }

  // Novos usuários sempre precisam fazer onboarding
  redirect("/onboarding")
}
