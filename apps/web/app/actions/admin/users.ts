"use server"

import { createClient, createAdminClient } from "@/lib/supabase/server"
import { db, profiles, customers, salons, eq, desc, ilike, or, sql } from "@repo/db"
import { revalidatePath } from "next/cache"
import { z } from "zod"

export async function getUsersList(page = 1, limit = 10, search = "") {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()

        if (!user) throw new Error("Unauthorized")

        // Verify admin role
        const adminProfile = await db.query.profiles.findFirst({
            where: eq(profiles.id, user.id),
            columns: { systemRole: true }
        })

        if (adminProfile?.systemRole !== "admin") {
            throw new Error("Forbidden")
        }

        const offset = (page - 1) * limit

        const whereClause = search
            ? or(
                ilike(profiles.fullName, `%${search}%`),
                ilike(profiles.email, `%${search}%`),
                ilike(profiles.phone, `%${search}%`)
            )
            : undefined

        const users = await db.query.profiles.findMany({
            where: whereClause,
            limit,
            offset,
            orderBy: [desc(profiles.createdAt)],
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
                limit
            }
        }

    } catch (error) {
        console.error("Error fetching users:", error)
        return { error: "Erro ao buscar usuários" }
    }
}

const createUserSchema = z.object({
    email: z.string().email(),
    password: z.string().min(6),
    fullName: z.string().min(3),
    phone: z.string().min(10).optional(),
    role: z.enum(["admin", "user"]).default("user"),
    plan: z.enum(["SOLO", "PRO", "ENTERPRISE"]).default("SOLO"),
})

export async function adminCreateUser(data: z.infer<typeof createUserSchema>) {
    const supabaseAdmin = createAdminClient()

    if (!supabaseAdmin) {
        return { error: "Admin client not configured" }
    }

    try {
        const validation = createUserSchema.safeParse(data)
        if (!validation.success) {
            return { error: "Dados inválidos" }
        }

        const { email, password, fullName, phone, role, plan } = validation.data

        // 1. Create user in Supabase Auth
        const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
            email,
            password,
            email_confirm: true,
            user_metadata: { full_name: fullName }
        })

        if (authError) {
            return { error: authError.message }
        }

        if (!authUser.user) {
            return { error: "Erro ao criar usuário" }
        }

        // 2. Update/Create profile in DB (Trigger usually handles creation, but we update extra fields)
        // Wait a bit for trigger or insert manually if trigger not reliable?
        // Assuming trigger exists, we update. If not, we insert.
        // Ideally we should check if profile exists.

        // For now, let's assume we can upsert or update.
        // Let's use db update as the trigger creates the basic profile.

        await db.update(profiles)
            .set({
                fullName,
                phone,
                systemRole: role as "admin" | "user",
                tier: plan,
                onboardingCompleted: true // Admin created users usually skip onboarding?
            })
            .where(eq(profiles.id, authUser.user.id))

        revalidatePath("/z_admin_minhaagendaai/users")
        return { success: true }

    } catch (error: any) {
        console.error("Error creating user:", error)
        return { error: error.message || "Erro interno ao criar usuário" }
    }
}

export async function getUserDetails(userId: string) {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()

        if (!user) throw new Error("Unauthorized")

        // Verify admin role
        const adminProfile = await db.query.profiles.findFirst({
            where: eq(profiles.id, user.id),
            columns: { systemRole: true }
        })

        if (adminProfile?.systemRole !== "admin") {
            throw new Error("Forbidden")
        }

        const userProfile = await db.query.profiles.findFirst({
            where: eq(profiles.id, userId),
            with: {
                payments: {
                    orderBy: (payments, { desc }) => [desc(payments.createdAt)],
                    limit: 10
                },
                ownedSalons: {
                    limit: 1
                }
            }
        })

        if (!userProfile) {
            return { error: "Usuário não encontrado" }
        }

        return { user: userProfile }

    } catch (error) {
        console.error("Error fetching user details:", error)
        return { error: "Erro ao buscar detalhes do usuário" }
    }
}

const updateUserSchema = z.object({
    id: z.string(),
    fullName: z.string().min(3),
    phone: z.string().optional(),
    role: z.enum(["admin", "user"]),
    plan: z.enum(["SOLO", "PRO", "ENTERPRISE"]),
})

export async function updateUserDetails(data: z.infer<typeof updateUserSchema>) {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()

        if (!user) throw new Error("Unauthorized")

        // Verify admin role
        const adminProfile = await db.query.profiles.findFirst({
            where: eq(profiles.id, user.id),
            columns: { systemRole: true }
        })

        if (adminProfile?.systemRole !== "admin") {
            throw new Error("Forbidden")
        }

        const validation = updateUserSchema.safeParse(data)
        if (!validation.success) {
            return { error: "Dados inválidos" }
        }

        const { id, fullName, phone, role, plan } = validation.data

        await db.update(profiles)
            .set({
                fullName,
                phone,
                systemRole: role as "admin" | "user",
                tier: plan,
                updatedAt: new Date()
            })
            .where(eq(profiles.id, id))

        revalidatePath(`/z_admin_minhaagendaai/users/${id}`)
        revalidatePath("/z_admin_minhaagendaai/users")

        return { success: true }
    } catch (error: any) {
        return { error: error.message || "Erro ao atualizar usuário" }
    }
}

export async function adminResetPassword(userId: string, newPassword: string) {
    const supabaseAdmin = createAdminClient()

    if (!supabaseAdmin) {
        return { error: "Admin client not configured" }
    }

    try {
        const { error } = await supabaseAdmin.auth.admin.updateUserById(
            userId,
            { password: newPassword }
        )

        if (error) throw error

        return { success: true }
    } catch (error: any) {
        return { error: error.message || "Erro ao resetar senha" }
    }
}

const updateCreditsSchema = z.object({
    salonId: z.string(),
    limit: z.number().nullable(),
})

export async function updateSalonCreditsLimit(salonId: string, limit: number | null) {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()

        if (!user) throw new Error("Unauthorized")

        // Verify admin role
        const adminProfile = await db.query.profiles.findFirst({
            where: eq(profiles.id, user.id),
            columns: { systemRole: true }
        })

        if (adminProfile?.systemRole !== "admin") {
            throw new Error("Forbidden")
        }

        // Get current settings
        const salon = await db.query.salons.findFirst({
            where: eq(salons.id, salonId),
            columns: { settings: true, ownerId: true }
        })

        if (!salon) {
            return { error: "Salão não encontrado" }
        }

        const currentSettings = (salon.settings as Record<string, any>) || {}

        // Update or remove custom_monthly_limit
        const newSettings = { ...currentSettings }

        if (limit === null) {
            delete newSettings.custom_monthly_limit
        } else {
            newSettings.custom_monthly_limit = limit
        }

        await db.update(salons)
            .set({ settings: newSettings })
            .where(eq(salons.id, salonId))

        revalidatePath(`/z_admin_minhaagendaai/users/${salon.ownerId}`)

        return { success: true }
    } catch (error: any) {
        console.error("Error updating credits limit:", error)
        return { error: error.message || "Erro ao atualizar limite de créditos" }
    }
}
