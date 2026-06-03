import { createClient } from "@/lib/supabase/server"
import { db, profiles, eq } from "@repo/db"

export interface AdminContext {
    id: string
    email: string
}

/**
 * Garante que a requisição vem de um admin autenticado.
 * Retorna o contexto do admin ({ id, email }) ou um erro padronizado.
 * Centraliza a checagem que antes era repetida em cada server action.
 */
export async function requireAdmin(): Promise<{ admin: AdminContext } | { error: string }> {
    const supabase = await createClient()
    const {
        data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
        return { error: "Não autenticado" }
    }

    const profile = await db.query.profiles.findFirst({
        where: eq(profiles.id, user.id),
        columns: { systemRole: true, email: true },
    })

    if (profile?.systemRole !== "admin") {
        return { error: "Acesso negado" }
    }

    return { admin: { id: user.id, email: profile.email ?? user.email ?? "" } }
}
