/**
 * Catálogo de permissões e de módulos — fonte única (docs/ROADMAP.md, fase 0).
 *
 * Vive em código, não em banco: a lista de recursos e ações muda junto com as
 * telas, e uma chave que só existe no banco não protege nada. O banco guarda
 * apenas QUAIS chaves cada perfil/profissional tem (arrays jsonb).
 *
 * Tudo aqui é puro (sem I/O), de propósito: é o que permite testar a regra sem
 * banco e usar o mesmo catálogo no servidor e na tela.
 *
 * Para adicionar um recurso: uma linha em PERMISSION_CATALOG. O tipo
 * PermissionKey, a lista ALL_PERMISSION_KEYS e a validação se atualizam sozinhos.
 * O rótulo em português fica em apps/web/lib/constants/permissions.constants.ts.
 */
export const PERMISSION_CATALOG = {
  schedule: ['access', 'create', 'edit', 'delete', 'view_all'],
  customers: ['access', 'create', 'edit', 'delete', 'view_phones', 'notes'],
  services: ['access', 'create', 'edit', 'delete'],
  products: ['access', 'create', 'edit', 'delete'],
  team: ['access', 'create', 'edit', 'delete'],
  chat: ['access'],
  marketing: ['access'],
  reports: ['access'],
  settings: ['access'],
  // Quem gerencia perfis define o que os outros podem — por isso é uma chave
  // própria, e não um efeito colateral de `settings.access`.
  access_profiles: ['manage'],
  // Comandas (fase 1). Sem `view_all` a pessoa vê só comandas com item dela; sem
  // `view_invoiced` não vê as já faturadas.
  sales: ['access', 'create', 'edit', 'delete', 'view_invoiced', 'invoice', 'edit_invoiced', 'view_all'],
  payment_methods: ['access', 'manage'],
  // Financeiro (fase 2). `settle` = dar baixa e estornar; `settings` = contas e
  // plano de categorias.
  finance: ['access', 'create', 'delete', 'settle', 'settings'],
  // Caixa (fase 2). `operate` = abrir, suprimento, sangria e fechar. Sem
  // `view_all` a pessoa vê só o histórico dos caixas que ela abriu.
  cash: ['access', 'operate', 'view_all'],
} as const satisfies Record<string, readonly string[]>

export type PermissionResource = keyof typeof PERMISSION_CATALOG

export type PermissionKey = {
  [R in PermissionResource]: `${R}.${(typeof PERMISSION_CATALOG)[R][number]}`
}[PermissionResource]

export const ALL_PERMISSION_KEYS: readonly PermissionKey[] = (
  Object.entries(PERMISSION_CATALOG) as [PermissionResource, readonly string[]][]
).flatMap(([resource, actions]) => actions.map((action) => `${resource}.${action}` as PermissionKey))

const PERMISSION_KEY_SET: ReadonlySet<string> = new Set(ALL_PERMISSION_KEYS)

export function isPermissionKey(value: unknown): value is PermissionKey {
  return typeof value === 'string' && PERMISSION_KEY_SET.has(value)
}

/**
 * Lê uma lista de permissões vinda do banco ou do cliente.
 *
 * Aceita qualquer coisa e devolve só chaves do catálogo, sem repetição. Chave
 * desconhecida é IGNORADA (e não um erro): uma chave removida do catálogo não pode
 * derrubar o login de quem ainda a tem gravada — e ignorar só tira acesso, nunca dá.
 */
export function sanitizePermissionKeys(value: unknown): PermissionKey[] {
  if (!Array.isArray(value)) return []
  return Array.from(new Set(value.filter(isPermissionKey)))
}

/**
 * O que um STAFF sem perfil pode hoje — espelho do menu que ele sempre viu
 * (agenda, conversas e leitura de contatos). É a compatibilidade: enquanto o salão
 * não configurar perfis, nada muda.
 */
export const LEGACY_STAFF_PERMISSIONS: readonly PermissionKey[] = [
  'schedule.access',
  'chat.access',
  'customers.access',
  'customers.view_phones',
]

export type ProfessionalPermissionSource = {
  role: 'OWNER' | 'MANAGER' | 'STAFF'
  isActive: boolean
  /** `professionals.custom_permissions` cru (jsonb). NULL = não é personalizado. */
  customPermissions: unknown
  /** `access_profiles.permissions` cru do perfil vinculado. NULL = sem perfil. */
  profilePermissions: unknown
}

/**
 * Permissões efetivas de um usuário num salão.
 *
 * Ordem, por vínculo ativo:
 *   1. papel OWNER → tudo (a chave "Administrador/Proprietário");
 *   2. personalizado, se houver;
 *   3. perfil vinculado, se houver;
 *   4. senão o papel, como sempre foi: MANAGER tudo, STAFF o conjunto legado.
 *
 * A mesma pessoa pode ter mais de um vínculo no mesmo salão; vale a UNIÃO — o
 * mesmo critério de "maior privilégio" de classifySalonAccess.
 *
 * Vínculo inativo não dá nada: desativar o profissional é como se tira o acesso.
 */
export function resolvePermissions(
  isSalonOwner: boolean,
  rows: readonly ProfessionalPermissionSource[]
): Set<PermissionKey> {
  if (isSalonOwner) return new Set(ALL_PERMISSION_KEYS)

  const granted = new Set<PermissionKey>()

  for (const row of rows) {
    if (!row.isActive) continue

    if (row.role === 'OWNER') return new Set(ALL_PERMISSION_KEYS)

    let keys: readonly PermissionKey[]
    if (row.customPermissions !== null && row.customPermissions !== undefined) {
      keys = sanitizePermissionKeys(row.customPermissions)
    } else if (row.profilePermissions !== null && row.profilePermissions !== undefined) {
      keys = sanitizePermissionKeys(row.profilePermissions)
    } else {
      keys = row.role === 'MANAGER' ? ALL_PERMISSION_KEYS : LEGACY_STAFF_PERMISSIONS
    }

    for (const key of keys) granted.add(key)
  }

  return granted
}

// ============================================================================
// Módulos por salão
// ============================================================================

/**
 * Módulos que se ligam salão a salão, em `salons.settings.modules` (array).
 *
 * É a chave de piloto: um módulo novo entra desligado para todos e é ligado só no
 * salão que vai testá-lo. Liberação comercial por PLANO é outra camada
 * (apps/web/lib/services/plan-features.service.ts).
 */
export const SALON_MODULES = ['access_profiles', 'sales', 'finance'] as const

export type SalonModule = (typeof SALON_MODULES)[number]

const SALON_MODULE_SET: ReadonlySet<string> = new Set(SALON_MODULES)

export function isSalonModule(value: unknown): value is SalonModule {
  return typeof value === 'string' && SALON_MODULE_SET.has(value)
}

/** Lê os módulos ligados a partir de `salons.settings` cru. Nunca lança. */
export function parseSalonModules(settings: unknown): SalonModule[] {
  if (!settings || typeof settings !== 'object') return []
  const modules = (settings as Record<string, unknown>).modules
  if (!Array.isArray(modules)) return []
  return Array.from(new Set(modules.filter(isSalonModule)))
}
