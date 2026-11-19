/**
 * O guard do admin vive em `lib/services/admin-auth.service.ts` (fonte única,
 * compartilhada com as rotas em `app/api/admin/**`). Este arquivo só reexporta
 * para as Server Actions do admin continuarem importando de `./_guard`.
 */
export { requireAdmin } from "@/lib/services/admin-auth.service"
export type { AdminContext } from "@/lib/services/admin-auth.service"
