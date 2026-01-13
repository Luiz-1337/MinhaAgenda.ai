"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { createClient } from "@/lib/supabase/server"
import { db, salons, professionalServices, appointments, profiles, professionals } from "@repo/db"
import { eq, and } from "drizzle-orm"
import { formatZodError } from "@/lib/services/validation.service"
import { normalizeEmail, normalizeString, emptyStringToNull } from "@/lib/services/validation.service"
import type { ProfessionalRow, UpsertProfessionalInput } from "@/lib/types/professional"
import type { ActionResult } from "@/lib/types/common"

import { ProfessionalService } from "@/lib/services/professional.service"

const upsertProfessionalSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(2),
  email: z.string().email(),
  phone: z.string().optional().or(z.literal("")),
  role: z.enum(["MANAGER", "STAFF"]).optional(),
  commissionRate: z.number().optional(),
  isActive: z.boolean().default(true),
})

export type { UpsertProfessionalInput }

import { hasSalonPermission } from "@/lib/services/permissions.service"

/**
 * Obtém todos os profissionais de um salão
 */
export async function getProfessionals(salonId: string): Promise<ProfessionalRow[] | { error: string }> {
  if (!salonId) {
    return { error: "salonId é obrigatório" }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: "Não autenticado" }
  }

  const hasAccess = await hasSalonPermission(salonId, user.id)

  if (!hasAccess) {
    // Se não for Manager/Owner, verifica se é o próprio profissional (para ver seu perfil/agenda)
    // Mas para a lista "Team", geralmente apenas managers veem tudo. 
    // STAFF vê apenas a si mesmo? O prompt diz "STAFF: Ocultar Equipe".
    // Então aqui deve bloquear mesmo.
    return { error: "Acesso negado a este salão" }
  }

  const result = await supabase
    .from("professionals")
    .select("id,salon_id,user_id,role,name,email,phone,is_active,created_at,commission_rate")
    .eq("salon_id", salonId)
    .order("name", { ascending: true })

  if (result.error) {
    return { error: result.error.message }
  }

  const rawList = (result.data || []) as any[]
  const proList = rawList.map(p => ({
    ...p,
    role: (p.role === 'OWNER' || p.role === 'MANAGER') ? 'MANAGER' : 'STAFF'
  })) as ProfessionalRow[]

  if (proList.length === 0) {
    return proList
  }

  // Busca todos os dias trabalhados de uma vez
  const professionalIds = proList.map((p) => p.id)
  const availabilityResult = await supabase
    .from("availability")
    .select("professional_id,day_of_week")
    .in("professional_id", professionalIds)
    .eq("is_break", false)

  // Agrupa os dias por profissional
  const daysByProfessional = new Map<string, Set<number>>()
  
  if (!availabilityResult.error && availabilityResult.data) {
    for (const item of availabilityResult.data as Array<{ professional_id: string; day_of_week: number }>) {
      if (!daysByProfessional.has(item.professional_id)) {
        daysByProfessional.set(item.professional_id, new Set())
      }
      daysByProfessional.get(item.professional_id)!.add(item.day_of_week)
    }
  }

  // Atribui os dias a cada profissional
  for (const professional of proList) {
    const daysSet = daysByProfessional.get(professional.id)
    if (daysSet) {
      professional.working_days = Array.from(daysSet).sort((a, b) => a - b)
    } else {
      professional.working_days = []
    }
  }

  return proList
}

/**
 * Cria ou atualiza um profissional
 */
export async function upsertProfessional(
  input: UpsertProfessionalInput & { salonId: string }
): Promise<ActionResult> {
  const supabase = await createClient()

  // Validação
  const parsed = upsertProfessionalSchema.safeParse(input)
  if (!parsed.success) {
    return { error: formatZodError(parsed.error) }
  }

  if (!input.salonId) {
    return { error: "salonId é obrigatório" }
  }

  // Verifica autenticação
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: "Não autenticado" }
  }

  // Verifica permissão (Owner ou Manager)
  const hasAccess = await hasSalonPermission(input.salonId, user.id)

  if (!hasAccess) {
    return { error: "Acesso negado. Apenas Gerentes e Proprietários podem gerenciar a equipe." }
  }

  // Verifica se o salão é SOLO e bloqueia criação/edição de profissionais extras
  if (!parsed.data.id) {
    // Apenas para criação (não edição)
    const salonInfo = await db
      .select({
        ownerId: salons.ownerId,
        ownerTier: profiles.tier,
      })
      .from(salons)
      .innerJoin(profiles, eq(profiles.id, salons.ownerId))
      .where(eq(salons.id, input.salonId))
      .limit(1)

    if (salonInfo.length > 0 && salonInfo[0].ownerTier === 'SOLO') {
      // Verifica se está tentando criar um profissional diferente do owner
      const existingUser = await db.query.profiles.findFirst({
        where: eq(profiles.email, normalizeEmail(parsed.data.email))
      })
      
      if (existingUser && existingUser.id !== salonInfo[0].ownerId) {
        return { error: "O plano SOLO permite apenas você como profissional. Não é possível adicionar outros usuários ao salão. Faça upgrade para adicionar membros à equipe." }
      }
    }
  }

  // Busca userId pelo email, se existir
  let userIdToLink: string | undefined = undefined
  const existingUser = await db.query.profiles.findFirst({
    where: eq(profiles.email, normalizeEmail(parsed.data.email))
  })
  if (existingUser) {
    userIdToLink = existingUser.id
  }

  // Preparar dados com userId
  const dataWithUserId = {
    ...parsed.data,
    userId: userIdToLink
  }

  try {
    if (parsed.data.id) {
      // Se for edição, mantém o userId existente se não encontramos um novo (ou atualiza se mudou email e achou user)
      // A lógica do ProfessionalService.updateProfessional usa userId se fornecido.
      await ProfessionalService.updateProfessional(parsed.data.id, input.salonId, dataWithUserId)
    } else {
      await ProfessionalService.createProfessional(input.salonId, dataWithUserId)
    }

    revalidatePath("/dashboard/team")
    return { success: true }
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Erro ao salvar profissional" }
  }
}

/**
 * Remove um profissional definitivamente (hard delete)
 */
export async function deleteProfessional(id: string, salonId: string): Promise<ActionResult> {
  if (!salonId) {
    return { error: "salonId é obrigatório" }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: "Não autenticado" }
  }

  const hasAccess = await hasSalonPermission(salonId, user.id)

  if (!hasAccess) {
    return { error: "Acesso negado" }
  }

  // Verifica se é salão SOLO e bloqueia remoção do profissional do owner
  const salonInfo = await db
    .select({
      ownerId: salons.ownerId,
      ownerTier: profiles.tier,
    })
    .from(salons)
    .innerJoin(profiles, eq(profiles.id, salons.ownerId))
    .where(eq(salons.id, salonId))
    .limit(1)

  if (salonInfo.length > 0 && salonInfo[0].ownerTier === 'SOLO') {
    // Busca o profissional para verificar se é o owner
    const professional = await db.query.professionals.findFirst({
      where: eq(professionals.id, id),
      columns: { userId: true }
    })

    if (professional?.userId === salonInfo[0].ownerId) {
      return { error: "Não é possível remover o profissional do owner em um salão SOLO." }
    }
  }

  try {
    // Remove primeiro os agendamentos relacionados
    await db.delete(appointments).where(eq(appointments.professionalId, id))
    
    // Remove as associações com serviços
    await db.delete(professionalServices).where(eq(professionalServices.professionalId, id))
    
    // Remove a disponibilidade do profissional
    const deleteAvailabilityResult = await supabase
      .from("availability")
      .delete()
      .eq("professional_id", id)

    if (deleteAvailabilityResult.error) {
      return { error: deleteAvailabilityResult.error.message }
    }

    // Remove os schedule overrides (se houver)
    const deleteOverridesResult = await supabase
      .from("schedule_overrides")
      .delete()
      .eq("professional_id", id)

    if (deleteOverridesResult.error) {
      return { error: deleteOverridesResult.error.message }
    }

    // Remove o profissional definitivamente
    const deleteResult = await supabase
      .from("professionals")
      .delete()
      .eq("id", id)
      .eq("salon_id", salonId)

    if (deleteResult.error) {
      return { error: deleteResult.error.message }
    }
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Erro ao remover profissional" }
  }

  revalidatePath("/dashboard/team")
  return { success: true }
}
