/**
 * Tipos da tela de perfis de acesso (docs/ROADMAP.md, fase 0).
 *
 * O tipo da chave de permissão vem de `@repo/db` — fonte única do catálogo.
 */
import type { PermissionKey } from "@repo/db"

export interface AccessProfileDTO {
  id: string
  name: string
  permissions: PermissionKey[]
  /** Profissionais vinculados a este perfil. */
  memberCount: number
}

/**
 * De onde vêm as permissões de um profissional:
 * - `role`    — nada configurado; segue o cargo, como sempre foi.
 * - `profile` — perfil reutilizável.
 * - `custom`  — lista própria.
 */
export type ProfessionalAccessMode = "role" | "profile" | "custom"

export interface ProfessionalAccessDTO {
  id: string
  name: string
  role: "MANAGER" | "STAFF"
  isActive: boolean
  /** Dono do salão ou cargo OWNER: pode tudo, e nenhuma configuração muda isso. */
  hasFullAccess: boolean
  mode: ProfessionalAccessMode
  accessProfileId: string | null
  customPermissions: PermissionKey[] | null
}

export interface AccessProfilesOverview {
  profiles: AccessProfileDTO[]
  professionals: ProfessionalAccessDTO[]
}

export interface SaveAccessProfileInput {
  salonId: string
  id?: string
  name: string
  permissions: string[]
}

export type SetProfessionalAccessInput =
  | { salonId: string; professionalId: string; mode: "role" }
  | { salonId: string; professionalId: string; mode: "profile"; accessProfileId: string }
  | { salonId: string; professionalId: string; mode: "custom"; permissions: string[] }
