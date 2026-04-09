"use server"

import { redirect } from "next/navigation"
import { headers } from "next/headers"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import type { ActionState } from "@/lib/types/common"
import { formatAuthError } from "@/lib/services/error.service"
import { normalizeEmail, normalizeString } from "@/lib/services/validation.service"
import { getOwnerSalonId, isSalonOwnerError } from "@/lib/services/salon.service"
import { db, profiles, salons, eq } from "@repo/db"

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
  let salonResult: Awaited<ReturnType<typeof getOwnerSalonId>>
  try {
    salonResult = await getOwnerSalonId()
  } catch (err) {
    console.error("Erro ao buscar salão após login:", err)
    return { error: "Erro temporário de conexão. Tente novamente." }
  }

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

  // Criar usuário no Supabase Auth
  const supabase = await createClient()
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

    // Configurar perfil e salão em uma única transação
    // O cliente direto do Drizzle (service-level) bypassa RLS automaticamente
    await db.transaction(async (tx) => {
      // 1. Atualizar perfil com role e tier
      await tx.update(profiles).set({
        fullName: full_name,
        role: 'OWNER',
        tier: plan,
        billingCountry: 'BR',
        updatedAt: new Date(),
      }).where(eq(profiles.id, userId!))

      // 2. Criar salão
      const slug = salon_name.toLowerCase().replace(/[^a-z0-9]/g, '-') + '-' + Math.random().toString(36).substring(2, 7)
      const [newSalon] = await tx.insert(salons)
        .values({
          name: salon_name,
          ownerId: userId!,
          slug,
          subscriptionStatus: 'TRIAL',
        })
        .returning({ id: salons.id })

      // 3. Vincular salão ao perfil
      await tx.update(profiles).set({
        salonId: newSalon.id,
        updatedAt: new Date(),
      }).where(eq(profiles.id, userId!))
    })
  } catch (err) {
    console.error("Erro CRÍTICO ao configurar conta no DB:", err)

    if (userId) {
      try {
        const adminClient = createAdminClient()
        if (adminClient) {
          await adminClient.auth.admin.deleteUser(userId)
          console.log(`Usuário ${userId} deletado do Auth (rollback de signup)`)
        } else {
          console.warn(`SUPABASE_SERVICE_ROLE_KEY não configurada — fazendo cleanup manual no banco para userId=${userId}`)
          await db.delete(profiles).where(eq(profiles.id, userId))
        }
      } catch (deleteErr) {
        console.error(`Falha no cleanup para userId=${userId}:`, deleteErr)
      }
    }

    return { error: `Erro ao configurar sua conta. Detalhe: ${(err as Error).message}` }
  }

  // Signup já criou o salão na transação acima
  // Redireciona para página de expiração que terá os botões de checkout Stripe
  const salonResult = await getOwnerSalonId()
  if (!isSalonOwnerError(salonResult)) {
    redirect(`/${salonResult.salonId}/expired`)
  }

  // Fallback: se por algum motivo o salão não foi encontrado, vai para onboarding
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
