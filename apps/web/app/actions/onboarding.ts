"use server"

import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { db, profiles, salons, eq, sql } from "@repo/db"
import type { ActionResult } from "@/lib/types/common"
import { formatAuthError } from "@/lib/services/error.service"
import { normalizeEmail, normalizeString } from "@/lib/services/validation.service"

interface OnboardingStep1Data {
  salonName: string
  fullName: string
  email: string
  password: string
  plan: 'SOLO' | 'PRO' | 'ENTERPRISE'
}

interface OnboardingStep2Data {
  documentType: 'CPF' | 'CNPJ'
  document: string
  userId: string
}

interface OnboardingStep3Data {
  address?: string
  phone?: string
  whatsapp?: string
  description?: string
  workHours?: Record<string, { start: string; end: string }>
  settings?: {
    accepts_card?: boolean
    parking?: boolean
    late_tolerance_minutes?: number
  }
  salonId: string
}

/**
 * Passo 1: Criar conta e salão inicial
 */
export async function onboardingStep1(
  data: OnboardingStep1Data
): Promise<ActionResult<{ userId: string; salonId: string }>> {
  const supabase = await createClient()
  
  // Criar usuário no Supabase Auth
  const { data: authData, error: authError } = await supabase.auth.signUp({
    email: normalizeEmail(data.email),
    password: data.password,
    options: {
      data: { full_name: normalizeString(data.fullName) },
    },
  })

  if (authError) {
    return { error: formatAuthError(authError) }
  }

  if (!authData.user) {
    return { error: "Erro ao criar usuário" }
  }

  // Armazenar userId em variável local para TypeScript
  const userId = authData.user.id

  try {
    // Aguardar trigger criar perfil
    await new Promise(resolve => setTimeout(resolve, 500))

    // Garantir que tipos e função existem
    try {
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
      console.log("Erro ao criar função/tipos:", createErr instanceof Error ? createErr.message : String(createErr))
    }

    // Criar salão e atualizar perfil em transação
    const result = await db.transaction(async (tx) => {
      // Atualizar perfil
      await tx.execute(sql`
        SELECT update_profile_on_signup(
          ${userId}::uuid,
          ${normalizeString(data.fullName)}::text,
          ${'OWNER'}::text,
          ${data.plan}::text,
          NULL::uuid
        )
      `)

      // Criar salão
      const slug = normalizeString(data.salonName)
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '-') + '-' + Math.random().toString(36).substring(2, 7)
      
      const [newSalon] = await tx.insert(salons)
        .values({
          name: normalizeString(data.salonName),
          ownerId: userId,
          slug,
          planTier: data.plan,
          subscriptionStatus: 'ACTIVE',
        })
        .returning({ id: salons.id })

      // Vincular salão ao perfil
      await tx.execute(sql`
        SELECT update_profile_on_signup(
          ${userId}::uuid,
          ${normalizeString(data.fullName)}::text,
          ${'OWNER'}::text,
          ${data.plan}::text,
          ${newSalon.id}::uuid
        )
      `)

      return { userId, salonId: newSalon.id }
    })

    return { success: true, data: result }
  } catch (err) {
    console.error("Erro ao configurar conta:", err)
    return { error: `Erro ao configurar conta: ${(err as Error).message}` }
  }
}

/**
 * Passo 2: Atualizar dados legais (CPF/CNPJ)
 * Por enquanto, vamos armazenar no settings do salão
 */
export async function onboardingStep2(
  data: OnboardingStep2Data
): Promise<ActionResult> {
  try {
    // Buscar salão do usuário
    const profile = await db.query.profiles.findFirst({
      where: eq(profiles.id, data.userId),
      columns: { salonId: true },
    })

    if (!profile?.salonId) {
      return { error: "Salão não encontrado" }
    }

    // Atualizar settings do salão com documento
    const salon = await db.query.salons.findFirst({
      where: eq(salons.id, profile.salonId),
      columns: { settings: true },
    })

    const currentSettings = (salon?.settings as Record<string, unknown>) || {}
    
    await db.update(salons)
      .set({
        settings: {
          ...currentSettings,
          document_type: data.documentType,
          document: data.document,
        },
      })
      .where(eq(salons.id, profile.salonId))

    return { success: true }
  } catch (err) {
    return { error: `Erro ao salvar dados legais: ${(err as Error).message}` }
  }
}

/**
 * Passo 3: Atualizar detalhes do salão
 */
export async function onboardingStep3(
  data: OnboardingStep3Data
): Promise<ActionResult> {
  try {
    const updateData: Record<string, unknown> = {}

    if (data.address !== undefined) updateData.address = normalizeString(data.address)
    if (data.phone !== undefined) updateData.phone = normalizeString(data.phone)
    if (data.whatsapp !== undefined) updateData.whatsapp = normalizeString(data.whatsapp)
    if (data.description !== undefined) updateData.description = normalizeString(data.description)
    if (data.workHours !== undefined) updateData.workHours = data.workHours
    if (data.settings !== undefined) {
      const salon = await db.query.salons.findFirst({
        where: eq(salons.id, data.salonId),
        columns: { settings: true },
      })
      const currentSettings = (salon?.settings as Record<string, unknown>) || {}
      updateData.settings = { ...currentSettings, ...data.settings }
    }

    await db.update(salons)
      .set(updateData)
      .where(eq(salons.id, data.salonId))

    return { success: true }
  } catch (err) {
    return { error: `Erro ao atualizar salão: ${(err as Error).message}` }
  }
}

/**
 * Passo 4: Finalizar onboarding
 */
export async function onboardingStep4(salonId: string): Promise<ActionResult> {
  try {
    // Marcar onboarding como completo
    const salon = await db.query.salons.findFirst({
      where: eq(salons.id, salonId),
      columns: { ownerId: true },
    })

    if (salon?.ownerId) {
      await db.update(profiles)
        .set({ onboardingCompleted: true })
        .where(eq(profiles.id, salon.ownerId))
    }

    return { success: true }
  } catch (err) {
    return { error: `Erro ao finalizar onboarding: ${(err as Error).message}` }
  }
}


