/**
 * Organização (multiunidade) — regra pura, sem I/O (docs/ROADMAP.md, fase 9,
 * fatia 9g, caminho A).
 *
 * "A organização é o dono": as unidades são os salões de UMA pessoa. Aqui se
 * põem as unidades lado a lado e se junta a equipe de todas numa lista só. Cada
 * salão continua isolado; quem soma é só esta tela, e só para o dono.
 */

/** Os números de UMA unidade no período, como o serviço os lê. */
export type OrganizationUnitInput = {
  salonId: string
  name: string
  /** Comandas faturadas no período. */
  sales: number
  revenueCents: number
  /** Clientes diferentes com comanda faturada no período. */
  buyers: number
  /** Agendamentos não cancelados no período. */
  appointments: number
  /** Clientes cadastrados na unidade (hoje). */
  customers: number
  /** Profissionais ativos (hoje). */
  professionals: number
}

export type OrganizationUnitRow = OrganizationUnitInput & {
  /** Faturamento ÷ comandas. NULL sem comanda. */
  averageTicketCents: number | null
  /** Parte do faturamento da organização, em %. NULL quando o total é zero. */
  sharePercent: number | null
}

export type OrganizationTotals = Omit<OrganizationUnitRow, 'salonId' | 'name' | 'sharePercent'>

export type OrganizationUnits = { rows: OrganizationUnitRow[]; totals: OrganizationTotals }

/**
 * As unidades lado a lado, a que mais faturou primeiro, e a soma.
 *
 * Os totais são soma simples: cliente e profissional são cadastros de cada
 * salão, então a mesma pessoa em duas unidades conta duas vezes.
 */
export function buildOrganizationUnits(units: readonly OrganizationUnitInput[]): OrganizationUnits {
  const totals = { sales: 0, revenueCents: 0, buyers: 0, appointments: 0, customers: 0, professionals: 0 }
  for (const unit of units) {
    totals.sales += unit.sales
    totals.revenueCents += unit.revenueCents
    totals.buyers += unit.buyers
    totals.appointments += unit.appointments
    totals.customers += unit.customers
    totals.professionals += unit.professionals
  }

  const ticket = (revenueCents: number, sales: number) => (sales > 0 ? Math.round(revenueCents / sales) : null)

  const rows = units
    .map((unit) => ({
      ...unit,
      averageTicketCents: ticket(unit.revenueCents, unit.sales),
      sharePercent: totals.revenueCents > 0 ? Math.round((unit.revenueCents / totals.revenueCents) * 1000) / 10 : null,
    }))
    .sort((a, b) => b.revenueCents - a.revenueCents || a.name.localeCompare(b.name, 'pt-BR'))

  return { rows, totals: { ...totals, averageTicketCents: ticket(totals.revenueCents, totals.sales) } }
}

export const ORGANIZATION_ROLE_LABELS: Record<string, string> = {
  OWNER: 'Proprietário',
  MANAGER: 'Gerente',
  STAFF: 'Profissional',
}

/** Um vínculo de profissional, de qualquer unidade da organização. */
export type OrganizationProfessional = {
  id: string
  salonId: string
  salonName: string
  name: string
  email: string
  role: string
  isActive: boolean
  userId: string | null
  personKey: string | null
}

export type OrganizationMember = {
  /** A chave que juntou os vínculos: a conta, a pessoa ou o e-mail. */
  key: string
  name: string
  email: string
  hasLogin: boolean
  units: { salonId: string; salonName: string; professionalId: string; role: string; isActive: boolean }[]
}

/**
 * A equipe de todas as unidades, uma linha por PESSOA.
 *
 * Dois vínculos são da mesma pessoa quando têm a mesma conta (login), a mesma
 * chave de pessoa (a que a agenda usa entre salões) ou o mesmo e-mail — nesta
 * ordem. Quem está em mais unidades vem primeiro; depois, por nome.
 */
export function groupOrganizationMembers(professionals: readonly OrganizationProfessional[]): OrganizationMember[] {
  const members = new Map<string, OrganizationMember>()
  // Um mesmo profissional pode casar por mais de uma chave: todas apontam para o mesmo membro.
  const alias = new Map<string, string>()

  for (const professional of professionals) {
    const email = professional.email.trim().toLowerCase()
    const keys = [
      professional.userId ? `user:${professional.userId}` : null,
      professional.personKey ? `person:${professional.personKey}` : null,
      email ? `email:${email}` : null,
    ].filter((key): key is string => key !== null)

    const known = keys.map((key) => alias.get(key)).find((key): key is string => key !== undefined)
    const memberKey = known ?? keys[0] ?? `professional:${professional.id}`
    for (const key of keys) if (!alias.has(key)) alias.set(key, memberKey)

    let member = members.get(memberKey)
    if (!member) {
      member = { key: memberKey, name: professional.name, email, hasLogin: false, units: [] }
      members.set(memberKey, member)
    }
    if (professional.userId) member.hasLogin = true
    member.units.push({
      salonId: professional.salonId,
      salonName: professional.salonName,
      professionalId: professional.id,
      role: professional.role,
      isActive: professional.isActive,
    })
  }

  const list = [...members.values()]
  for (const member of list) member.units.sort((a, b) => a.salonName.localeCompare(b.salonName, 'pt-BR'))
  return list.sort(
    (a, b) =>
      new Set(b.units.map((unit) => unit.salonId)).size - new Set(a.units.map((unit) => unit.salonId)).size ||
      a.name.localeCompare(b.name, 'pt-BR')
  )
}
