import { db, professionals, salons, profiles } from "@repo/db"
import { eq, count, and } from "drizzle-orm"
import { canAddProfessional } from "@/lib/utils/permissions"
import type { UpsertProfessionalInput } from "@/lib/types/professional"
import type { PlanTier } from "@/lib/types/salon"
import { normalizeString, normalizeEmail, emptyStringToNull } from "@/lib/services/validation.service"

export class ProfessionalService {
  /**
   * Conta o número de profissionais ativos em um salão
   */
  static async countActiveProfessionals(salonId: string): Promise<number> {
    const [result] = await db
      .select({ count: count() })
      .from(professionals)
      .where(and(eq(professionals.salonId, salonId), eq(professionals.isActive, true)))

    return result?.count ?? 0
  }

  /**
   * Obtém o profissional vinculado ao usuário (owner) em um salão
   * Útil para plano SOLO onde o usuário é o único profissional
   */
  static async getUserProfessional(salonId: string, userId: string) {
    // Busca o profissional que é owner do salão (vinculado ao userId)
    const salon = await db.query.salons.findFirst({
      where: eq(salons.id, salonId),
      columns: { ownerId: true },
    })

    if (!salon || salon.ownerId !== userId) {
      return null
    }

    // Busca o profissional vinculado ao usuário
    const professional = await db.query.professionals.findFirst({
      where: and(
        eq(professionals.salonId, salonId),
        eq(professionals.userId, userId)
      ),
    })

    return professional
  }

  /**
   * Cria um novo profissional com verificação de plano (Feature Gating)
   */
  static async createProfessional(salonId: string, data: UpsertProfessionalInput) {
    // 1. Busca informações do salão e tier do owner
    const result = await db
      .select({
        salonId: salons.id,
        ownerTier: profiles.tier,
      })
      .from(salons)
      .innerJoin(profiles, eq(profiles.id, salons.ownerId))
      .where(eq(salons.id, salonId))
      .limit(1)

    if (!result.length) {
      throw new Error("Salão não encontrado")
    }

    // 2. Verifica limites do plano
    const currentCount = await this.countActiveProfessionals(salonId)
    const tier = result[0].ownerTier as PlanTier

    if (!canAddProfessional(tier, currentCount)) {
      if (tier === 'SOLO') {
        throw new Error("O plano SOLO permite apenas 1 profissional (você). Faça upgrade para o plano BUSINESS para adicionar equipe.")
      }
      throw new Error(`Limite de profissionais atingido para o plano ${tier}.`)
    }

    // 3. Prepara dados
    const payload = {
      salonId,
      userId: data.userId || null,
      name: normalizeString(data.name),
      email: normalizeEmail(data.email),
      phone: emptyStringToNull(data.phone),
      role: data.role || 'STAFF',
      commissionRate: data.commissionRate?.toString() || '0',
      isActive: data.isActive ?? true,
    }

    // 4. Insere no banco
    const [newProfessional] = await db
      .insert(professionals)
      .values(payload)
      .returning()

    return newProfessional
  }

  /**
   * Atualiza um profissional existente (sem verificação de limite de quantidade, pois já existe)
   */
  static async updateProfessional(id: string, salonId: string, data: UpsertProfessionalInput) {
     const payload = {
      name: normalizeString(data.name),
      email: normalizeEmail(data.email),
      phone: emptyStringToNull(data.phone),
      role: data.role, // Pode ser undefined se não for atualizar
      commissionRate: data.commissionRate?.toString(),
      isActive: data.isActive,
      userId: data.userId, // Caso queira vincular/desvincular usuário
    }

    // Filtra undefined
    const cleanPayload = Object.fromEntries(
      Object.entries(payload).filter(([_, v]) => v !== undefined)
    )

    const [updated] = await db
      .update(professionals)
      .set(cleanPayload)
      .where(and(eq(professionals.id, id), eq(professionals.salonId, salonId)))
      .returning()
    
    return updated
  }

  /**
   * Garante que um salão SOLO tenha um profissional vinculado ao owner
   * Cria automaticamente se não existir, usando dados do perfil do owner
   * @param salonId ID do salão
   * @returns O profissional existente ou recém-criado
   */
  static async ensureSoloProfessional(salonId: string) {
    // 1. Busca informações do salão e tier do owner
    const salonInfo = await db
      .select({
        salonId: salons.id,
        ownerId: salons.ownerId,
        ownerTier: profiles.tier,
      })
      .from(salons)
      .innerJoin(profiles, eq(profiles.id, salons.ownerId))
      .where(eq(salons.id, salonId))
      .limit(1)

    if (!salonInfo.length) {
      throw new Error("Salão não encontrado")
    }

    const { ownerId, ownerTier } = salonInfo[0]

    // 2. Verifica se é plano SOLO
    if (ownerTier !== 'SOLO') {
      // Não é SOLO, não precisa criar automaticamente
      return null
    }

    // 3. Verifica se já existe profissional vinculado ao owner
    const existingProfessional = await db.query.professionals.findFirst({
      where: and(
        eq(professionals.salonId, salonId),
        eq(professionals.userId, ownerId)
      ),
    })

    if (existingProfessional) {
      // Já existe, retorna o existente
      return existingProfessional
    }

    // 4. Busca dados do perfil do owner para criar o profissional
    const ownerProfile = await db.query.profiles.findFirst({
      where: eq(profiles.id, ownerId),
      columns: {
        fullName: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
      },
    })

    if (!ownerProfile) {
      throw new Error("Perfil do owner não encontrado")
    }

    // 5. Prepara nome do profissional (fullName ou firstName + lastName)
    const professionalName = ownerProfile.fullName || 
      (ownerProfile.firstName && ownerProfile.lastName 
        ? `${ownerProfile.firstName} ${ownerProfile.lastName}`.trim()
        : ownerProfile.firstName || ownerProfile.lastName || 'Profissional')

    // 6. Cria o profissional automaticamente
    const [newProfessional] = await db
      .insert(professionals)
      .values({
        salonId,
        userId: ownerId,
        name: normalizeString(professionalName),
        email: normalizeEmail(ownerProfile.email),
        phone: emptyStringToNull(ownerProfile.phone),
        role: 'MANAGER', // Owner sempre é MANAGER
        isActive: true,
        commissionRate: '0',
      })
      .returning()

    return newProfessional
  }
}








