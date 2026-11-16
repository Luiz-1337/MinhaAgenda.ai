import { cache } from "react"
import {
  db,
  salons,
  professionals,
  accessProfiles,
  eq,
  and,
  resolvePermissions,
  type PermissionKey,
} from "@repo/db"

/**
 * Nível de acesso de um usuário a um salão.
 *
 * - `manage` — dono do salão, ou profissional MANAGER/OWNER. Pode tudo que a tela
 *   oferece (o que era, historicamente, o único nível existente).
 * - `read`   — profissional STAFF ativo. Lê a ficha e a lista de contatos, não
 *   edita nem exclui. Quem atende no balcão precisa saber quem é o cliente; até
 *   aqui a tela de contatos aparecia vazia justamente para essa pessoa, enquanto
 *   o agente de IA recebia o "Cliente 360" completo no prompt.
 * - `none`   — sem vínculo com o salão (ou salão inexistente).
 */
export type SalonAccessLevel = 'none' | 'read' | 'manage'

/**
 * A regra, isolada de I/O para poder ser testada sem banco.
 *
 * Recebe TODAS as linhas de `professionals` daquele par (salão, usuário), não uma
 * só: a mesma pessoa pode ter mais de um vínculo no mesmo salão, e nesse caso
 * vale o MAIOR privilégio. A versão anterior filtrava o papel dentro do
 * `findFirst`, o que escondia esse caso; trocar por "busca a linha e classifica"
 * sem olhar todas rebaixaria um MANAGER que também tem uma linha de STAFF.
 */
export function classifySalonAccess(
  isOwner: boolean,
  professionalRows: { role: 'OWNER' | 'MANAGER' | 'STAFF'; isActive: boolean }[]
): SalonAccessLevel {
  if (isOwner) return 'manage'

  const active = professionalRows.filter((row) => row.isActive)
  if (active.some((row) => row.role === 'MANAGER' || row.role === 'OWNER')) return 'manage'
  if (active.some((row) => row.role === 'STAFF')) return 'read'

  // Vínculo inativo não dá acesso: desativar um profissional é o jeito de tirar
  // o acesso dele sem apagar o histórico de agendamentos.
  return 'none'
}

/**
 * Resolve o nível de acesso do usuário ao salão.
 *
 * Memoizada por request (React.cache): checagens repetidas do mesmo
 * (salonId, userId) dentro de um request custam uma única ida ao banco — o que
 * importa porque o pedágio de auth+permissão roda em toda action e o banco está
 * longe (us-west-2).
 */
export const getSalonAccess = cache(
  async (salonId: string, userId: string): Promise<SalonAccessLevel> => {
    if (!salonId || !userId) return 'none'

    const salon = await db.query.salons.findFirst({
      where: eq(salons.id, salonId),
      columns: { id: true, ownerId: true }
    })

    if (!salon) return 'none'
    if (salon.ownerId === userId) return 'manage'

    const rows = await db.query.professionals.findMany({
      where: and(
        eq(professionals.salonId, salonId),
        eq(professionals.userId, userId)
      ),
      columns: { role: true, isActive: true }
    })

    return classifySalonAccess(false, rows)
  }
)

/**
 * Verifica se o usuário tem permissão de GERENCIAMENTO no salão.
 * Permite acesso para:
 * 1. Dono do salão (salon.ownerId)
 * 2. Profissionais com cargo de MANAGER ou OWNER
 *
 * Assinatura e semântica preservadas: é o guard usado pelos ~35 chamadores
 * existentes e por toda mutação. STAFF continua negado aqui de propósito.
 */
export const hasSalonPermission = async (
  salonId: string,
  userId: string
): Promise<boolean> => (await getSalonAccess(salonId, userId)) === 'manage'

/**
 * Verifica se o usuário pode LER dados de CRM do salão (lista de contatos, ficha
 * do cliente, tags). Inclui STAFF ativo, além de quem já tinha `manage`.
 *
 * Use este guard só em LEITURA. Criar, editar e excluir contato continuam em
 * `hasSalonPermission`.
 */
export const canReadCrm = async (
  salonId: string,
  userId: string
): Promise<boolean> => (await getSalonAccess(salonId, userId)) !== 'none'

// ============================================================================
// Permissão por recurso × ação (docs/ROADMAP.md, fase 0)
// ============================================================================

/**
 * Permissões efetivas do usuário no salão — o conjunto de chaves `recurso.acao`.
 *
 * A regra (dono, OWNER, personalizado, perfil, papel) é `resolvePermissions`, em
 * `@repo/db`, pura e testada sem banco. Aqui só mora o I/O.
 *
 * Memoizada por request, como `getSalonAccess`: várias checagens `can()` na mesma
 * action custam uma ida ao banco.
 *
 * Convive com `getSalonAccess`/`hasSalonPermission`, não os substitui: os
 * chamadores antigos continuam no nível grosso (manage/read/none) e migram para
 * `can()` quando a área for tocada. Módulo NOVO usa só `can()`.
 */
export const getSalonPermissions = cache(
  async (salonId: string, userId: string): Promise<ReadonlySet<PermissionKey>> => {
    if (!salonId || !userId) return new Set()

    const salon = await db.query.salons.findFirst({
      where: eq(salons.id, salonId),
      columns: { id: true, ownerId: true }
    })

    if (!salon) return new Set()
    if (salon.ownerId === userId) return resolvePermissions(true, [])

    // O join exige o MESMO salão no perfil. A FK não garante isso (um
    // access_profile_id de outro salão é fisicamente gravável), então sem esta
    // condição um perfil alheio daria permissão aqui.
    const rows = await db
      .select({
        role: professionals.role,
        isActive: professionals.isActive,
        customPermissions: professionals.customPermissions,
        accessProfileId: professionals.accessProfileId,
        profilePermissions: accessProfiles.permissions,
      })
      .from(professionals)
      .leftJoin(
        accessProfiles,
        and(
          eq(accessProfiles.id, professionals.accessProfileId),
          eq(accessProfiles.salonId, professionals.salonId)
        )
      )
      .where(and(eq(professionals.salonId, salonId), eq(professionals.userId, userId)))

    return resolvePermissions(
      false,
      rows.map((row) => ({
        role: row.role,
        isActive: row.isActive,
        customPermissions: row.customPermissions,
        // Perfil vinculado mas não encontrado pelo join (de outro salão) vale como
        // perfil VAZIO, não como "sem perfil" — senão cairia no papel, e um MANAGER
        // com vínculo quebrado voltaria a poder tudo.
        profilePermissions: row.accessProfileId ? (row.profilePermissions ?? []) : null,
      }))
    )
  }
)

/**
 * O usuário pode fazer `recurso.acao` neste salão?
 *
 * Use no SERVIDOR, no começo da action/service. Esconder o botão na tela é
 * cortesia; a trava é esta.
 */
export const can = async (
  salonId: string,
  userId: string,
  permission: PermissionKey
): Promise<boolean> => (await getSalonPermissions(salonId, userId)).has(permission)
