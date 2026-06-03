"use server"

import { createAdminClient } from "@/lib/supabase/server"
import {
    db,
    profiles,
    salons,
    professionals,
    aiUsageStats,
    eq,
    and,
    or,
    ilike,
    inArray,
    gte,
    lt,
    asc,
    desc,
    sql,
} from "@repo/db"
import { revalidatePath } from "next/cache"
import { z } from "zod"
import { requireAdmin } from "./_guard"
import { logAdminAction } from "@/lib/services/admin-audit.service"
import { getSalonRemainingCredits } from "@/lib/services/credits.service"

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

/** Converte string vazia/espaços em null; senão retorna o valor trimado. */
function nullableText(value?: string | null): string | null {
    if (value === undefined || value === null) return null
    const trimmed = value.trim()
    return trimmed === "" ? null : trimmed
}

/** Início (inclusive) e fim (exclusivo) do mês atual em ISO YYYY-MM-DD. */
function getCurrentMonthRange(): { start: string; end: string } {
    const now = new Date()
    const start = new Date(now.getFullYear(), now.getMonth(), 1)
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 1)
    const toIso = (d: Date) => d.toISOString().slice(0, 10)
    return { start: toIso(start), end: toIso(end) }
}

// ----------------------------------------------------------------------------
// Read
// ----------------------------------------------------------------------------

interface GetUsersListParams {
    page?: number
    limit?: number
    search?: string
    role?: "admin" | "user"
    plan?: "SOLO" | "PRO" | "ENTERPRISE"
    sortBy?: "createdAt" | "fullName" | "email"
    sortDir?: "asc" | "desc"
}

export async function getUsersList(params: GetUsersListParams = {}) {
    try {
        const auth = await requireAdmin()
        if ("error" in auth) return { error: auth.error }

        const {
            page = 1,
            limit = 10,
            search = "",
            role,
            plan,
            sortBy = "createdAt",
            sortDir = "desc",
        } = params

        const offset = (page - 1) * limit

        const conditions = []
        if (search) {
            conditions.push(
                or(
                    ilike(profiles.fullName, `%${search}%`),
                    ilike(profiles.email, `%${search}%`),
                    ilike(profiles.phone, `%${search}%`)
                )
            )
        }
        if (role) conditions.push(eq(profiles.systemRole, role))
        if (plan) conditions.push(eq(profiles.tier, plan))

        const whereClause = conditions.length > 0 ? and(...conditions) : undefined

        const sortColumn =
            sortBy === "fullName"
                ? profiles.fullName
                : sortBy === "email"
                  ? profiles.email
                  : profiles.createdAt
        const orderBy = sortDir === "asc" ? asc(sortColumn) : desc(sortColumn)

        const users = await db.query.profiles.findMany({
            where: whereClause,
            limit,
            offset,
            orderBy: [orderBy],
        })

        const totalCountResult = await db
            .select({ count: sql<number>`count(*)` })
            .from(profiles)
            .where(whereClause)

        const total = Number(totalCountResult[0]?.count || 0)

        return {
            users,
            pagination: {
                total,
                pages: Math.ceil(total / limit),
                page,
                limit,
            },
        }
    } catch (error) {
        console.error("Error fetching users:", error)
        return { error: "Erro ao buscar usuários" }
    }
}

export async function getUserDetails(userId: string) {
    try {
        const auth = await requireAdmin()
        if ("error" in auth) return { error: auth.error }

        const userProfile = await db.query.profiles.findFirst({
            where: eq(profiles.id, userId),
            with: {
                payments: {
                    orderBy: (payments, { desc }) => [desc(payments.createdAt)],
                    limit: 10,
                },
                ownedSalons: {
                    limit: 1,
                },
            },
        })

        if (!userProfile) {
            return { error: "Usuário não encontrado" }
        }

        // Saldo de créditos do mês corrente (usado/total/restante) do salão primário.
        const salon = userProfile.ownedSalons?.[0]
        let credits: { remaining: number; total: number; used: number } | null = null
        if (salon) {
            const result = await getSalonRemainingCredits(salon.id)
            if (!("error" in result)) credits = result
        }

        return { user: userProfile, credits }
    } catch (error) {
        console.error("Error fetching user details:", error)
        return { error: "Erro ao buscar detalhes do usuário" }
    }
}

// ----------------------------------------------------------------------------
// Create
// ----------------------------------------------------------------------------

const createUserSchema = z.object({
    email: z.string().email(),
    password: z.string().min(6),
    fullName: z.string().min(3),
    phone: z.string().min(10).optional(),
    role: z.enum(["admin", "user"]).default("user"),
    plan: z.enum(["SOLO", "PRO", "ENTERPRISE"]).default("SOLO"),
})

export async function adminCreateUser(data: z.infer<typeof createUserSchema>) {
    try {
        const auth = await requireAdmin()
        if ("error" in auth) {
            console.warn("[adminCreateUser] requireAdmin bloqueou:", auth.error)
            return { error: auth.error }
        }
        const { admin } = auth

        const supabaseAdmin = createAdminClient()
        if (!supabaseAdmin) {
            console.error("[adminCreateUser] SUPABASE_SERVICE_ROLE_KEY ausente no servidor — createAdminClient() retornou null. Preencha no .env e reinicie o pnpm dev.")
            return { error: "Admin client não configurado: defina SUPABASE_SERVICE_ROLE_KEY e reinicie o servidor." }
        }

        const validation = createUserSchema.safeParse(data)
        if (!validation.success) {
            console.warn("[adminCreateUser] dados inválidos:", JSON.stringify(validation.error.flatten().fieldErrors))
            return { error: "Dados inválidos" }
        }

        const { email, password, fullName, phone, role, plan } = validation.data

        // 1. Cria o usuário no Supabase Auth.
        const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
            email,
            password,
            email_confirm: true,
            user_metadata: { full_name: fullName },
        })

        if (authError) {
            console.error("[adminCreateUser] Supabase Auth createUser falhou:", authError.message)
            return { error: authError.message }
        }
        if (!authUser.user) {
            return { error: "Erro ao criar usuário" }
        }

        // 2. Garante o profile correto via UPSERT keyed em id. Um trigger no banco
        // pode já ter criado a linha; o upsert cobre tanto o caso "trigger criou"
        // quanto "trigger não rodou", evitando usuário criado pela metade.
        await db
            .insert(profiles)
            .values({
                id: authUser.user.id,
                email,
                fullName,
                phone: nullableText(phone),
                systemRole: role,
                tier: plan,
                onboardingCompleted: true,
            })
            .onConflictDoUpdate({
                target: profiles.id,
                set: {
                    fullName,
                    phone: nullableText(phone),
                    systemRole: role,
                    tier: plan,
                    onboardingCompleted: true,
                    updatedAt: new Date(),
                },
            })

        await logAdminAction({
            admin,
            action: "user.create",
            targetType: "user",
            targetId: authUser.user.id,
            targetLabel: email,
            details: { fullName, role, plan },
        })

        revalidatePath("/z_admin_minhaagendaai/users")
        return { success: true }
    } catch (error: any) {
        console.error("Error creating user:", error)
        return { error: error.message || "Erro interno ao criar usuário" }
    }
}

// ----------------------------------------------------------------------------
// Update (completo: dados principais, email/login, cobrança e documento)
// ----------------------------------------------------------------------------

const updateUserSchema = z.object({
    id: z.string().uuid(),
    fullName: z.string().min(3, "Nome deve ter no mínimo 3 caracteres"),
    firstName: z.string().optional(),
    lastName: z.string().optional(),
    phone: z.string().optional(),
    email: z.string().email("Email inválido"),
    role: z.enum(["admin", "user"]),
    plan: z.enum(["SOLO", "PRO", "ENTERPRISE"]),
    documentType: z.string().optional(),
    documentNumber: z.string().optional(),
    billingAddress: z.string().optional(),
    billingPostalCode: z.string().optional(),
    billingCity: z.string().optional(),
    billingState: z.string().optional(),
    billingCountry: z.string().optional(),
    billingAddressComplement: z.string().optional(),
})

export async function updateUserDetails(data: z.infer<typeof updateUserSchema>) {
    try {
        const auth = await requireAdmin()
        if ("error" in auth) return { error: auth.error }
        const { admin } = auth

        const validation = updateUserSchema.safeParse(data)
        if (!validation.success) {
            return { error: "Dados inválidos" }
        }
        const v = validation.data

        const current = await db.query.profiles.findFirst({
            where: eq(profiles.id, v.id),
            columns: { email: true },
        })
        if (!current) {
            return { error: "Usuário não encontrado" }
        }

        const newEmail = v.email.trim().toLowerCase()
        const emailChanged = current.email.toLowerCase() !== newEmail

        // Email é a credencial de login: precisa ser alterado também no Supabase Auth.
        if (emailChanged) {
            const supabaseAdmin = createAdminClient()
            if (!supabaseAdmin) {
                return { error: "Admin client não configurado — não é possível alterar o email." }
            }
            const { error: authErr } = await supabaseAdmin.auth.admin.updateUserById(v.id, {
                email: newEmail,
                email_confirm: true,
            })
            if (authErr) {
                return { error: `Falha ao alterar email: ${authErr.message}` }
            }
        }

        await db
            .update(profiles)
            .set({
                fullName: v.fullName,
                firstName: nullableText(v.firstName),
                lastName: nullableText(v.lastName),
                phone: nullableText(v.phone),
                email: newEmail,
                systemRole: v.role,
                tier: v.plan,
                documentType: nullableText(v.documentType),
                documentNumber: nullableText(v.documentNumber),
                billingAddress: nullableText(v.billingAddress),
                billingPostalCode: nullableText(v.billingPostalCode),
                billingCity: nullableText(v.billingCity),
                billingState: nullableText(v.billingState),
                billingCountry: nullableText(v.billingCountry),
                billingAddressComplement: nullableText(v.billingAddressComplement),
                updatedAt: new Date(),
            })
            .where(eq(profiles.id, v.id))

        await logAdminAction({
            admin,
            action: emailChanged ? "user.email_change" : "user.update",
            targetType: "user",
            targetId: v.id,
            targetLabel: newEmail,
            details: emailChanged
                ? { emailFrom: current.email, emailTo: newEmail, role: v.role, plan: v.plan }
                : { role: v.role, plan: v.plan },
        })

        revalidatePath(`/z_admin_minhaagendaai/users/${v.id}`)
        revalidatePath("/z_admin_minhaagendaai/users")
        return { success: true }
    } catch (error: any) {
        console.error("Error updating user:", error)
        return { error: error.message || "Erro ao atualizar usuário" }
    }
}

export async function adminResetPassword(userId: string, newPassword: string) {
    try {
        const auth = await requireAdmin()
        if ("error" in auth) return { error: auth.error }
        const { admin } = auth

        if (typeof newPassword !== "string" || newPassword.length < 6) {
            return { error: "A senha deve ter no mínimo 6 caracteres" }
        }

        const supabaseAdmin = createAdminClient()
        if (!supabaseAdmin) {
            return { error: "Admin client não configurado" }
        }

        const target = await db.query.profiles.findFirst({
            where: eq(profiles.id, userId),
            columns: { email: true },
        })

        const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, {
            password: newPassword,
        })
        if (error) throw error

        await logAdminAction({
            admin,
            action: "user.reset_password",
            targetType: "user",
            targetId: userId,
            targetLabel: target?.email ?? userId,
        })

        return { success: true }
    } catch (error: any) {
        console.error("Error resetting password:", error)
        return { error: error.message || "Erro ao resetar senha" }
    }
}

// ----------------------------------------------------------------------------
// Créditos / Tokens de IA (por salão)
// ----------------------------------------------------------------------------

export async function updateSalonCreditsLimit(salonId: string, limit: number | null) {
    try {
        const auth = await requireAdmin()
        if ("error" in auth) return { error: auth.error }
        const { admin } = auth

        const salon = await db.query.salons.findFirst({
            where: eq(salons.id, salonId),
            columns: { settings: true, ownerId: true, name: true },
        })
        if (!salon) {
            return { error: "Salão não encontrado" }
        }

        const currentSettings = (salon.settings as Record<string, any>) || {}
        const newSettings = { ...currentSettings }
        const previousLimit = currentSettings.custom_monthly_limit ?? null

        if (limit === null) {
            delete newSettings.custom_monthly_limit
        } else {
            newSettings.custom_monthly_limit = limit
        }

        await db.update(salons).set({ settings: newSettings }).where(eq(salons.id, salonId))

        await logAdminAction({
            admin,
            action: "credits.limit_update",
            targetType: "salon",
            targetId: salonId,
            targetLabel: salon.name,
            details: { from: previousLimit, to: limit },
        })

        revalidatePath(`/z_admin_minhaagendaai/users/${salon.ownerId}`)
        return { success: true }
    } catch (error: any) {
        console.error("Error updating credits limit:", error)
        return { error: error.message || "Erro ao atualizar limite de créditos" }
    }
}

const grantCreditsSchema = z.object({
    salonId: z.string().uuid(),
    delta: z.number().int(),
})

/** Concede (delta > 0) ou remove (delta < 0) créditos extras, com piso em 0. */
export async function grantSalonExtraCredits(salonId: string, delta: number) {
    try {
        const auth = await requireAdmin()
        if ("error" in auth) return { error: auth.error }
        const { admin } = auth

        const parsed = grantCreditsSchema.safeParse({ salonId, delta })
        if (!parsed.success) {
            return { error: "Valor inválido" }
        }
        if (parsed.data.delta === 0) {
            return { error: "Informe um valor diferente de zero" }
        }

        const salon = await db.query.salons.findFirst({
            where: eq(salons.id, salonId),
            columns: { ownerId: true, name: true, extraCredits: true },
        })
        if (!salon) {
            return { error: "Salão não encontrado" }
        }

        await db
            .update(salons)
            .set({
                extraCredits: sql`GREATEST(0, ${salons.extraCredits} + ${parsed.data.delta})`,
                updatedAt: new Date(),
            })
            .where(eq(salons.id, salonId))

        await logAdminAction({
            admin,
            action: "credits.grant",
            targetType: "salon",
            targetId: salonId,
            targetLabel: salon.name,
            details: { delta: parsed.data.delta, before: salon.extraCredits },
        })

        revalidatePath(`/z_admin_minhaagendaai/users/${salon.ownerId}`)
        return { success: true }
    } catch (error: any) {
        console.error("Error granting extra credits:", error)
        return { error: error.message || "Erro ao conceder créditos" }
    }
}

/** Zera o consumo de IA do mês corrente (apaga as linhas de ai_usage_stats do mês). */
export async function resetSalonMonthlyUsage(salonId: string) {
    try {
        const auth = await requireAdmin()
        if ("error" in auth) return { error: auth.error }
        const { admin } = auth

        const salon = await db.query.salons.findFirst({
            where: eq(salons.id, salonId),
            columns: { ownerId: true, name: true },
        })
        if (!salon) {
            return { error: "Salão não encontrado" }
        }

        const { start, end } = getCurrentMonthRange()
        const deleted = await db
            .delete(aiUsageStats)
            .where(
                and(
                    eq(aiUsageStats.salonId, salonId),
                    gte(aiUsageStats.date, start),
                    lt(aiUsageStats.date, end)
                )
            )
            .returning({ id: aiUsageStats.id })

        await logAdminAction({
            admin,
            action: "credits.reset_usage",
            targetType: "salon",
            targetId: salonId,
            targetLabel: salon.name,
            details: { month: start, rowsDeleted: deleted.length },
        })

        revalidatePath(`/z_admin_minhaagendaai/users/${salon.ownerId}`)
        return { success: true, rowsDeleted: deleted.length }
    } catch (error: any) {
        console.error("Error resetting monthly usage:", error)
        return { error: error.message || "Erro ao zerar consumo" }
    }
}

const updateAiRetentionSchema = z.object({
    salonId: z.string().uuid(),
    enabled: z.boolean(),
})

export async function updateSalonAiRetentionFlag(salonId: string, enabled: boolean) {
    try {
        const auth = await requireAdmin()
        if ("error" in auth) return { error: auth.error }
        const { admin } = auth

        const parsed = updateAiRetentionSchema.parse({ salonId, enabled })

        const salon = await db.query.salons.findFirst({
            where: eq(salons.id, parsed.salonId),
            columns: { ownerId: true, name: true },
        })
        if (!salon) {
            return { error: "Salão não encontrado" }
        }

        await db
            .update(salons)
            .set({ aiRetentionEnabled: parsed.enabled })
            .where(eq(salons.id, parsed.salonId))

        await logAdminAction({
            admin,
            action: "salon.ai_retention",
            targetType: "salon",
            targetId: parsed.salonId,
            targetLabel: salon.name,
            details: { enabled: parsed.enabled },
        })

        revalidatePath(`/z_admin_minhaagendaai/users/${salon.ownerId}`)
        return { success: true }
    } catch (error: any) {
        console.error("Error updating AI retention flag:", error)
        return { error: error.message || "Erro ao atualizar flag de retenção IA" }
    }
}

// ----------------------------------------------------------------------------
// Delete (individual e em massa)
// ----------------------------------------------------------------------------

/**
 * Remove o usuário do Auth e do banco (transação respeitando FKs sem cascade).
 * Pressupõe que o chamador já validou admin e a regra "não excluir a si mesmo".
 */
async function deleteUserInternal(
    userId: string,
    supabaseAdmin: NonNullable<ReturnType<typeof createAdminClient>>
): Promise<{ success: true } | { error: string }> {
    const target = await db.query.profiles.findFirst({
        where: eq(profiles.id, userId),
        columns: { id: true },
    })
    if (!target) {
        return { error: "Usuário não encontrado" }
    }

    // 1) Apaga o auth user primeiro. Se falhar aqui, o DB ainda está íntegro.
    const { error: authError } = await supabaseAdmin.auth.admin.deleteUser(userId)
    if (authError) {
        return { error: `Falha ao remover do Auth: ${authError.message}` }
    }

    // 2) Apaga o DB em transação, respeitando FKs sem cascade.
    await db.transaction(async (tx) => {
        await tx.update(professionals).set({ userId: null }).where(eq(professionals.userId, userId))
        await tx.delete(salons).where(eq(salons.ownerId, userId))
        await tx.delete(profiles).where(eq(profiles.id, userId))
    })

    return { success: true }
}

export async function adminDeleteUser(userId: string) {
    try {
        const auth = await requireAdmin()
        if ("error" in auth) return { error: auth.error }
        const { admin } = auth

        if (userId === admin.id) {
            return { error: "Você não pode excluir a si mesmo." }
        }

        const supabaseAdmin = createAdminClient()
        if (!supabaseAdmin) {
            return { error: "Admin client não configurado" }
        }

        const target = await db.query.profiles.findFirst({
            where: eq(profiles.id, userId),
            columns: { email: true },
        })

        const result = await deleteUserInternal(userId, supabaseAdmin)
        if ("error" in result) {
            return { error: result.error }
        }

        await logAdminAction({
            admin,
            action: "user.delete",
            targetType: "user",
            targetId: userId,
            targetLabel: target?.email ?? userId,
        })

        revalidatePath("/z_admin_minhaagendaai/users")
        revalidatePath("/z_admin_minhaagendaai")
        return { success: true }
    } catch (error: any) {
        console.error("Error deleting user:", error)
        return { error: error.message || "Erro ao excluir usuário" }
    }
}

const bulkIdsSchema = z.array(z.string().uuid()).min(1, "Selecione ao menos um usuário")

export async function adminBulkDeleteUsers(userIds: string[]) {
    try {
        const auth = await requireAdmin()
        if ("error" in auth) return { error: auth.error }
        const { admin } = auth

        const parsed = bulkIdsSchema.safeParse(userIds)
        if (!parsed.success) {
            return { error: "Seleção inválida" }
        }

        const supabaseAdmin = createAdminClient()
        if (!supabaseAdmin) {
            return { error: "Admin client não configurado" }
        }

        let deleted = 0
        let skipped = 0
        const errors: { id: string; error: string }[] = []

        for (const id of parsed.data) {
            if (id === admin.id) {
                skipped++
                continue
            }
            const result = await deleteUserInternal(id, supabaseAdmin)
            if ("error" in result) {
                errors.push({ id, error: result.error })
            } else {
                deleted++
            }
        }

        await logAdminAction({
            admin,
            action: "user.bulk_delete",
            targetType: "user",
            details: { requested: parsed.data.length, deleted, skipped, errors },
        })

        revalidatePath("/z_admin_minhaagendaai/users")
        revalidatePath("/z_admin_minhaagendaai")
        return { success: true, deleted, skipped, errors }
    } catch (error: any) {
        console.error("Error bulk deleting users:", error)
        return { error: error.message || "Erro ao excluir usuários" }
    }
}

const bulkPlanSchema = z.object({
    userIds: z.array(z.string().uuid()).min(1),
    plan: z.enum(["SOLO", "PRO", "ENTERPRISE"]),
})

export async function adminBulkUpdatePlan(
    userIds: string[],
    plan: "SOLO" | "PRO" | "ENTERPRISE"
) {
    try {
        const auth = await requireAdmin()
        if ("error" in auth) return { error: auth.error }
        const { admin } = auth

        const parsed = bulkPlanSchema.safeParse({ userIds, plan })
        if (!parsed.success) {
            return { error: "Dados inválidos" }
        }

        await db
            .update(profiles)
            .set({ tier: parsed.data.plan, updatedAt: new Date() })
            .where(inArray(profiles.id, parsed.data.userIds))

        await logAdminAction({
            admin,
            action: "user.bulk_plan_update",
            targetType: "user",
            details: { count: parsed.data.userIds.length, plan: parsed.data.plan },
        })

        revalidatePath("/z_admin_minhaagendaai/users")
        return { success: true, updated: parsed.data.userIds.length }
    } catch (error: any) {
        console.error("Error bulk updating plan:", error)
        return { error: error.message || "Erro ao atualizar planos" }
    }
}
