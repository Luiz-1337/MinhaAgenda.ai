"use server"

import { redirect } from "next/navigation"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { db, profiles, salons, professionals, eq, sql } from "@repo/db"
import type { ActionResult } from "@/lib/types/common"
import { formatAuthError } from "@/lib/services/error.service"
import { normalizeEmail, normalizeString, emptyStringToNull } from "@/lib/services/validation.service"

interface OnboardingStep1Data {
  salonName: string
  firstName: string
  lastName: string
  email: string
  phone: string
  password: string
  plan: 'SOLO' | 'PRO' | 'ENTERPRISE'
  // Endereço de cobrança
  billingAddress: string
  billingPostalCode: string
  billingCity: string
  billingState: string
  billingCountry?: string
  billingAddressComplement?: string
  // Dados legais
  documentType: 'CPF' | 'CNPJ'
  document: string
  // Detalhes do salão
  address?: string
  salonPhone?: string
  whatsapp?: string
  description?: string
  workHours?: Record<string, { start: string; end: string }>
  settings?: {
    accepts_card?: boolean
    parking?: boolean
    late_tolerance_minutes?: number
  }
}

interface OnboardingStep2Data {
  documentType: 'CPF' | 'CNPJ'
  document: string
  documentNumber: string
  userId: string
}

interface OnboardingStep3Data {
  address?: string
  salonPhone?: string
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
 * Criar conta completa após pagamento confirmado
 * Esta função cria tudo de uma vez: usuário, perfil, salão e marca onboarding como completo
 */
export async function completeOnboardingWithPayment(
  data: OnboardingStep1Data
): Promise<ActionResult<{ userId: string; salonId: string }>> {
  // VALIDAÇÃO E PREPARAÇÃO ANTES DE CRIAR O USUÁRIO NO AUTH
  // Isso garante que se der erro, o usuário não será criado no Supabase Auth
  
  // 1. Validar dados obrigatórios
  if (!data.firstName || !data.lastName || !data.phone || !data.billingAddress || 
      !data.billingPostalCode || !data.billingCity || !data.billingState ||
      !data.documentType || !data.document) {
    return { error: "Campos obrigatórios não preenchidos" }
  }

  // 2. Preparar tipos e função no banco ANTES de criar usuário
  try {
    // Garantir que tipos e função existem
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

  // 3. AGORA SIM: Criar usuário no Supabase Auth (após tudo estar pronto)
  const supabase = await createClient()
  const fullName = `${data.firstName} ${data.lastName}`.trim()
  
  let authData: { user: { id: string } | null } | null = null
  let userId: string | null = null
  
  try {
    const signUpResult = await supabase.auth.signUp({
      email: normalizeEmail(data.email),
      password: data.password,
      options: {
        data: { full_name: fullName },
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

    // Aguardar trigger criar perfil básico
    await new Promise(resolve => setTimeout(resolve, 500))

    // 4. Criar salão e atualizar perfil em transação
    const result = await db.transaction(async (tx) => {
      if (!userId) {
        throw new Error("User ID não disponível")
      }

      const fullName = `${data.firstName} ${data.lastName}`.trim()
      const documentNumber = data.document.replace(/\D/g, '')
      
      // Atualizar perfil com todos os dados
      await tx.execute(sql`
        SELECT update_profile_on_signup(
          ${userId}::uuid,
          ${normalizeString(fullName)}::text,
          ${normalizeString(data.firstName)}::text,
          ${normalizeString(data.lastName)}::text,
          ${normalizeString(data.phone)}::text,
          ${normalizeString(data.billingAddress)}::text,
          ${normalizeString(data.billingPostalCode)}::text,
          ${normalizeString(data.billingCity)}::text,
          ${normalizeString(data.billingState)}::text,
          ${(data.billingCountry || 'BR')}::text,
          ${data.billingAddressComplement ? normalizeString(data.billingAddressComplement) : null}::text,
          ${'OWNER'}::text,
          ${data.plan}::text,
          NULL::uuid
        )
      `)

      // Atualizar dados legais
      await tx.update(profiles)
        .set({
          documentType: data.documentType,
          documentNumber: documentNumber,
        })
        .where(eq(profiles.id, userId))

      // Criar salão
      const slug = normalizeString(data.salonName)
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '-') + '-' + Math.random().toString(36).substring(2, 7)
      
      const salonData = {
        name: normalizeString(data.salonName),
        ownerId: userId,
        slug,
        subscriptionStatus: 'ACTIVE' as const,
        address: data.address !== undefined ? normalizeString(data.address) : null,
        phone: data.salonPhone !== undefined ? normalizeString(data.salonPhone) : null,
        whatsapp: data.whatsapp !== undefined ? normalizeString(data.whatsapp) : null,
        description: data.description !== undefined ? normalizeString(data.description) : null,
        workHours: data.workHours !== undefined ? data.workHours : null,
        settings: data.settings !== undefined ? data.settings : null,
      }

      const [newSalon] = await tx.insert(salons)
        .values(salonData)
        .returning({ id: salons.id })

      // Vincular salão ao perfil e marcar onboarding como completo
      await tx.execute(sql`
        SELECT update_profile_on_signup(
          ${userId}::uuid,
          ${normalizeString(fullName)}::text,
          ${normalizeString(data.firstName)}::text,
          ${normalizeString(data.lastName)}::text,
          ${normalizeString(data.phone)}::text,
          ${normalizeString(data.billingAddress)}::text,
          ${normalizeString(data.billingPostalCode)}::text,
          ${normalizeString(data.billingCity)}::text,
          ${normalizeString(data.billingState)}::text,
          ${(data.billingCountry || 'BR')}::text,
          ${data.billingAddressComplement ? normalizeString(data.billingAddressComplement) : null}::text,
          ${'OWNER'}::text,
          ${data.plan}::text,
          ${newSalon.id}::uuid
        )
      `)

      // Criar profissional automaticamente se for plano SOLO
      if (data.plan === 'SOLO') {
        const [newProfessional] = await tx.insert(professionals).values({
          salonId: newSalon.id,
          userId: userId,
          name: normalizeString(fullName),
          email: normalizeEmail(data.email),
          phone: emptyStringToNull(data.phone),
          role: 'MANAGER', // Owner sempre é MANAGER
          isActive: true,
          commissionRate: '0',
        }).returning({ id: professionals.id })

        // Criar disponibilidade padrão (Segunda a Sexta, 9h às 18h)
        // Isso permite que o profissional comece a aceitar agendamentos imediatamente
        const { availability } = await import('@repo/db')
        const defaultAvailability = []

        // Segunda (1) a Sexta (5), 9:00 às 18:00
        for (let dayOfWeek = 1; dayOfWeek <= 5; dayOfWeek++) {
          defaultAvailability.push({
            professionalId: newProfessional.id,
            dayOfWeek,
            startTime: '09:00',
            endTime: '18:00',
            isBreak: false,
          })
        }

        await tx.insert(availability).values(defaultAvailability)
      }

      // Marcar onboarding como completo
      await tx.update(profiles)
        .set({ onboardingCompleted: true })
        .where(eq(profiles.id, userId))

      return { userId, salonId: newSalon.id }
    })

    return { success: true, data: result }
  } catch (err) {
    console.error("Erro ao configurar conta:", err)
    
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
    
    return { error: `Erro ao configurar conta: ${(err as Error).message}` }
  }
}

/**
 * Passo 2: Atualizar dados legais (CPF/CNPJ)
 * Salva no profile do usuário
 */
export async function onboardingStep2(
  data: OnboardingStep2Data
): Promise<ActionResult> {
  try {
    // Remove formatação do documento (apenas números)
    const documentNumber = data.document.replace(/\D/g, '')
    
    // Atualizar profile com dados legais
    await db.update(profiles)
      .set({
        documentType: data.documentType,
        documentNumber: documentNumber,
      })
      .where(eq(profiles.id, data.userId))

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
    if (data.salonPhone !== undefined) updateData.phone = normalizeString(data.salonPhone)
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


