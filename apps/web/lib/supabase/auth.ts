import { cache } from "react"
import type { JwtPayload } from "@supabase/supabase-js"
import { createClient } from "./server"

/**
 * Camada única de validação de sessão no servidor, memoizada por request
 * (React.cache): N chamadas no mesmo request = 1 ida à rede, não N.
 *
 * getSessionClaims/getSessionUserId usam getClaims(): com JWT Signing Keys
 * assimétricas no projeto Supabase a validação é LOCAL (JWKS cacheado, sem
 * HTTP à API de Auth); sem elas a lib cai no caminho servidor (= getUser).
 * Use em LEITURAS.
 *
 * getAuthUser mantém getUser() (sempre consulta a API de Auth — revogação
 * imediata). Use em mutações sensíveis/destrutivas.
 */
export const getSessionClaims = cache(async (): Promise<JwtPayload | null> => {
  const supabase = await createClient()
  const { data, error } = await supabase.auth.getClaims()
  if (error || !data?.claims?.sub) return null
  return data.claims
})

export const getSessionUserId = cache(async (): Promise<string | null> => {
  const claims = await getSessionClaims()
  return claims?.sub ?? null
})

export const getAuthUser = cache(async () => {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return user
})
