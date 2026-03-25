"use server"

import { redirect } from "next/navigation"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { db, profiles, salons, professionals, eq } from "@repo/db"
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

  // Criar usuário no Supabase Auth
  const supabase = await createClient()
  const fullName = `${data.firstName} ${data.lastName}`.trim()

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

    userId = signUpResult.data.user.id

    // Aguarda o trigger do Supabase criar o perfil (polling ao invés de sleep fixo)
    let profileReady = false
    for (let attempt = 0; attempt < 8; attempt++) {
      await new Promise(resolve => setTimeout(resolve, 250))
      const existing = await db.query.profiles.findFirst({
        where: eq(profiles.id, userId),
        columns: { id: true },
      })
      if (existing) { profileReady = true; break }
    }
    if (!profileReady) {
      throw new Error("Perfil não criado pelo trigger após cadastro. Tente novamente.")
    }

    // Criar salão e atualizar perfil em transação
    // O cliente direto do Drizzle (service-level) bypassa RLS automaticamente
    const result = await db.transaction(async (tx) => {
      const documentNumber = data.document.replace(/\D/g, '')

      // Atualizar perfil com todos os dados
      await tx.update(profiles).set({
        fullName: normalizeString(fullName),
        firstName: normalizeString(data.firstName),
        lastName: normalizeString(data.lastName),
        phone: normalizeString(data.phone),
        billingAddress: normalizeString(data.billingAddress),
        billingPostalCode: normalizeString(data.billingPostalCode),
        billingCity: normalizeString(data.billingCity),
        billingState: normalizeString(data.billingState),
        billingCountry: data.billingCountry || 'BR',
        billingAddressComplement: data.billingAddressComplement
          ? normalizeString(data.billingAddressComplement)
          : null,
        documentType: data.documentType,
        documentNumber,
        role: 'OWNER',
        tier: data.plan,
        updatedAt: new Date(),
      }).where(eq(profiles.id, userId!))

      // Criar salão
      const slug = normalizeString(data.salonName)
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '-') + '-' + Math.random().toString(36).substring(2, 7)

      const [newSalon] = await tx.insert(salons)
        .values({
          name: normalizeString(data.salonName),
          ownerId: userId!,
          slug,
          subscriptionStatus: 'TRIAL',
          address: emptyStringToNull(data.address),
          phone: emptyStringToNull(data.salonPhone),
          whatsapp: emptyStringToNull(data.whatsapp),
          description: emptyStringToNull(data.description),
          workHours: data.workHours !== undefined ? data.workHours : null,
          settings: data.settings !== undefined ? data.settings : null,
        })
        .returning({ id: salons.id })

      // Vincular salão ao perfil
      await tx.update(profiles).set({
        salonId: newSalon.id,
        updatedAt: new Date(),
      }).where(eq(profiles.id, userId!))

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
        .where(eq(profiles.id, userId!))

      return { userId: userId!, salonId: newSalon.id }
    })

    return { success: true, data: result }
  } catch (err) {
    console.error("Erro ao configurar conta:", err)

    // Tenta limpar registros criados para evitar dados órfãos
    if (userId) {
      try {
        const adminClient = createAdminClient()
        if (adminClient) {
          // Deletar usuário do Auth — o cascade do Supabase apaga o profile também
          await adminClient.auth.admin.deleteUser(userId)
          console.log(`Usuário ${userId} deletado do Auth (rollback de onboarding)`)
        } else {
          // Sem SERVICE_ROLE_KEY: limpa diretamente no banco como fallback
          console.warn(`SUPABASE_SERVICE_ROLE_KEY não configurada — fazendo cleanup manual no banco para userId=${userId}`)
          await db.delete(profiles).where(eq(profiles.id, userId))
        }
      } catch (deleteErr) {
        console.error(`Falha no cleanup para userId=${userId}:`, deleteErr)
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


