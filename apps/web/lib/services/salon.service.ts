/**
 * Serviço para operações relacionadas a salões
 * Centraliza a lógica de obtenção do contexto do dono do salão
 */

import { createClient } from "@/lib/supabase/server"
import { db, salons, professionals, profiles } from "@repo/db"
import { and, asc, eq } from "drizzle-orm"
import type { SalonOwnerResult } from "@/lib/types/salon"
import type { CreateSalonSchema } from "@/lib/schemas"
import { headers } from "next/headers"
import { normalizeString } from "@/lib/services/validation.service"

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function parseSalonIdFromPathname(pathname: string | null | undefined): string | null {
  if (!pathname) return null
  const parts = pathname.split("?")[0].split("#")[0].split("/").filter(Boolean)
  if (parts.length === 0) return null
  const candidate = parts[0]
  return UUID_RE.test(candidate) ? candidate : null
}

async function inferSalonIdFromRequest(): Promise<string | null> {
  const h = await headers()
  const referer = h.get("referer")
  if (!referer) return null

  try {
    const url = new URL(referer)
    return parseSalonIdFromPathname(url.pathname)
  } catch {
    // Em alguns cenários o referer pode vir como pathname relativo
    return parseSalonIdFromPathname(referer)
  }
}

/**
 * Obtém o ID do salão do usuário autenticado
 * Retorna erro se o usuário não estiver autenticado ou não tiver salão
 */
export async function getOwnerSalonId(salonId?: string): Promise<SalonOwnerResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: "Não autenticado" }
  }

  // Prioridade: salonId explícito (quando o callsite tem) > salonId inferido do request (URL atual)
  const activeSalonId = salonId ?? (await inferSalonIdFromRequest())

  if (activeSalonId) {
    const activeSalon = await db.query.salons.findFirst({
      where: and(eq(salons.id, activeSalonId), eq(salons.ownerId, user.id)),
      columns: { id: true },
    })

    if (activeSalon) {
      return { salonId: activeSalon.id, userId: user.id }
    }
  }

  // Fallback: primeiro salão do dono (ex.: pós-login, quando não há URL ativa)
  const salon = await db.query.salons.findFirst({
    where: eq(salons.ownerId, user.id),
    columns: { id: true },
    orderBy: asc(salons.createdAt),
  })

  if (!salon) {
    return { error: "Salão não encontrado" }
  }

  return {
    salonId: salon.id,
    userId: user.id,
  }
}

/**
 * Verifica se o resultado é um erro
 */
export function isSalonOwnerError(
  result: SalonOwnerResult
): result is Extract<SalonOwnerResult, { error: string }> {
  return "error" in result
}

/**
 * Sanitiza o número de WhatsApp removendo espaços, traços, parênteses e prefixos
 * @param whatsapp - Número de WhatsApp a ser sanitizado
 * @returns Número sanitizado apenas com dígitos e sinal de + (se presente no início)
 */
function sanitizeWhatsApp(whatsapp: string): string {
  return whatsapp
    .trim()
    .replace(/^whatsapp:/i, "") // Remove prefixo "whatsapp:" (case-insensitive)
    .replace(/\s/g, "") // Remove todos os espaços
    .replace(/-/g, "") // Remove todos os traços
    .replace(/\(/g, "") // Remove parênteses de abertura
    .replace(/\)/g, "") // Remove parênteses de fechamento
}

/**
 * Busca o ID do salão baseado no número de WhatsApp
 * @param whatsapp - Número de WhatsApp do salão (pode conter espaços, traços, parênteses)
 * @returns O ID do salão (UUID) ou null se não encontrado
 * @throws {Error} Se ocorrer um erro na consulta ao banco de dados
 */
export async function getSalonIdByWhatsapp(
  whatsapp: string
): Promise<string | null> {
  // Sanitiza o número de WhatsApp para garantir o match
  const sanitizedWhatsapp = sanitizeWhatsApp(whatsapp)

  // Valida se o número sanitizado não está vazio
  if (!sanitizedWhatsapp) {
    return null
  }

  try {
    // Busca o salão pelo número de WhatsApp sanitizado
    const salon = await db.query.salons.findFirst({
      where: eq(salons.whatsapp, sanitizedWhatsapp),
      columns: { id: true },
    })

    // Retorna o ID se encontrado, caso contrário retorna null
    return salon?.id ?? null
  } catch (error) {
    // Re-lança o erro com contexto adicional
    throw new Error(
      `Erro ao buscar salão por WhatsApp: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

/**
 * Cria um novo salão e automaticamente registra o dono como profissional (OWNER)
 * Garante atomicidade da operação via transação
 */
export async function createSalonWithOwner(userId: string, data: CreateSalonSchema) {
  console.log("Iniciando createSalonWithOwner para user:", userId)
  return await db.transaction(async (tx) => {
    try {
    // 1. Cria o salão
    console.log("Tentando criar salão:", data.name)
    const [newSalon] = await tx
      .insert(salons)
      .values({
        ownerId: userId,
        name: data.name,
        slug: data.slug,
        whatsapp: data.whatsapp || null,
        address: data.address || null,
        phone: data.phone || null,
        description: data.description || null,
        workHours: data.workHours || null,
        settings: data.settings || null,
        subscriptionStatus: 'TRIAL',
      })
      .returning()

    if (!newSalon) {
      throw new Error("Falha ao criar salão")
    }

    // 2. Busca dados do usuário para criar o profissional
    const userProfile = await tx.query.profiles.findFirst({
      where: eq(profiles.id, userId),
      columns: {
        fullName: true,
        email: true,
        phone: true,
      },
    })

    const ownerName = userProfile?.fullName || data.name // Fallback para nome do salão se não tiver nome
    const ownerEmail = userProfile?.email || "" // Deve ter email, mas typescript reclama

    // 3. Cria o profissional dono
    await tx.insert(professionals).values({
      salonId: newSalon.id,
      userId: userId,
      name: normalizeString(ownerName),
      email: ownerEmail, // Email do profissional = email do user
      phone: userProfile?.phone || null,
      role: 'MANAGER', // Dono é criado como MANAGER
      isActive: true,
      commissionRate: '0',
    })

    // 4. Atualiza role do usuário (se necessário, ex: primeira vez criando salão)
    await tx
      .update(profiles)
      .set({ systemRole: "admin" })
      .where(eq(profiles.id, userId))

    console.log("Salão criado com sucesso:", newSalon.id)
    return newSalon
    } catch (e) {
      console.error("Erro na transação de createSalonWithOwner:", e)
      throw e
    }
  })
}
