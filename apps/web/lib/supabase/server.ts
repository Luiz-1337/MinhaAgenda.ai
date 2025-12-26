import { createServerClient } from "@supabase/ssr"
import { createClient as createSupabaseClient } from "@supabase/supabase-js"
import { cookies } from "next/headers"

interface CookieToSet {
  name: string
  value: string
  options?: Record<string, unknown>
}

export async function createClient() {
  const cookieStore = await cookies()
  const supabaseKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    supabaseKey,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet: CookieToSet[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // O método `setAll` foi chamado de um Server Component.
            // Isso pode ser ignorado se você tiver um middleware atualizando
            // as sessões do usuário.
          }
        },
      },
    }
  )
}

/**
 * Cria um cliente Supabase Admin com service role key
 * Usado para operações administrativas como deletar usuários
 * ATENÇÃO: Use apenas em server actions, nunca exponha a service role key no cliente
 * Retorna null se a chave não estiver configurada (não lança erro)
 */
export function createAdminClient() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  
  if (!serviceRoleKey) {
    console.warn("SUPABASE_SERVICE_ROLE_KEY não configurada. Operações administrativas não estarão disponíveis.")
    return null
  }

  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceRoleKey,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    }
  )
}
