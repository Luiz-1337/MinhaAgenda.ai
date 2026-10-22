/**
 * A Belasis como agenda oficial do salão (contrato `AgendaProvider`).
 *
 * Decisões que vêm da documentação da API, não de gosto:
 * - OCUPADO vem de `free_times` (a grade de horários que a própria Belasis
 *   calcula: expediente, folgas, bloqueios e agendamentos). Só o que ela marca
 *   como livre está livre — ver `freeTimesToBusyIntervals`.
 * - REMARCAR: o PATCH só muda a hora de um item; não muda data, profissional nem
 *   serviço. Fora disso, remarcar é criar o novo e cancelar o antigo (o que a doc
 *   indica no status `disconfirm`), e o id externo muda.
 * - CANCELAR usa `/cancel` (status `disconfirm`), não DELETE: o salão mantém o
 *   histórico.
 * - Não há chave de idempotência: a referência do agendamento local vai na
 *   observação, e `findAppointmentByIdempotencyKey` procura por ela.
 * - `reminder: false`: o MinhaAgenda já manda lembrete de todo agendamento
 *   pendente (reminders.service); com o da Belasis o cliente receberia dois.
 */
import { formatInTimeZone } from 'date-fns-tz'

import type {
  AgendaAccountInfo,
  AgendaAppointmentInput,
  AgendaAppointmentSnapshot,
  AgendaBusyInterval,
  AgendaCatalogItem,
  AgendaCreatedAppointment,
  AgendaProvider,
  AgendaRemoteAppointment,
  AgendaRemoteCustomer,
  AgendaRescheduledAppointment,
} from '../../../domain/integrations/interfaces/agenda-provider.interface'
import { BelasisClient, belasisBackgroundOptions } from './belasis-client'
import { BelasisApiError, isBelasisApiError } from './belasis-errors'
import {
  BELASIS_TIME_ZONE,
  belasisObservation,
  belasisReferenceMarker,
  freeTimesToBusyIntervals,
  fromBelasisWallClock,
  localDatesBetween,
  parseBelasisReferenceMarker,
  phonesMatch,
  toBelasisPhone,
  toBelasisWallClock,
  type TimeRange,
} from './belasis-mapping'
import type { BelasisCalendar, BelasisClientRecord, BelasisFreeTime, BelasisScheduleGroup } from './belasis-types'

/** Grade de horários reaproveitada por alguns segundos: a cota é de 30/min. */
const FREE_TIMES_TTL_MS = 45_000
const FREE_TIMES_CACHE_MAX = 1_000

const freeTimesCache = new Map<string, { expiresAt: number; slots: BelasisFreeTime[] }>()

/** Para testes. */
export function clearBelasisFreeTimesCache(): void {
  freeTimesCache.clear()
}

function overlaps(a: TimeRange, b: TimeRange): boolean {
  return a.start.getTime() < b.end.getTime() && a.end.getTime() > b.start.getTime()
}

/** IDs da Belasis são inteiros; o de-para guarda string. */
function toBelasisId(externalId: string, what: string): number {
  const id = Number(externalId)
  if (!Number.isSafeInteger(id) || id <= 0) {
    throw new BelasisApiError(`Vínculo de ${what} inválido para a Belasis: "${externalId}"`, 'rejected', {
      method: 'LOCAL',
      path: 'external-id',
    })
  }
  return id
}

/**
 * Referência de um agendamento lá. Com um serviço só, é o id do agendamento
 * ("501"). Com vários serviços na mesma visita (corte com a Ana + escova com a
 * Bia), cada serviço vira um agendamento aqui, e a referência aponta o item:
 * "501:9001".
 */
function parseScheduleRef(externalId: string): { groupId: number; calendarId?: number } {
  const [group, calendar] = externalId.split(':')
  return {
    groupId: toBelasisId(group, 'agendamento'),
    ...(calendar !== undefined ? { calendarId: toBelasisId(calendar, 'item de agendamento') } : {}),
  }
}

/** Os itens que a referência aponta: o item exato, ou todos (agendamento de um serviço). */
function itemsOf(group: BelasisScheduleGroup, calendarId: number | undefined): BelasisCalendar[] {
  const calendars = group.calendars ?? []
  return calendarId === undefined ? calendars : calendars.filter((c) => c.id === calendarId)
}

export interface BelasisAgendaProviderOptions {
  timeZone?: string
  now?: () => number
}

export class BelasisAgendaProvider implements AgendaProvider {
  readonly id = 'belasis' as const

  constructor(
    private readonly client: BelasisClient,
    private readonly options: BelasisAgendaProviderOptions = {}
  ) {}

  private get timeZone(): string {
    return this.options.timeZone ?? BELASIS_TIME_ZONE
  }

  private now(): number {
    return (this.options.now ?? Date.now)()
  }

  // ==========================================================================
  // Conexão e catálogo
  // ==========================================================================

  /** A API não tem "quem sou eu": validar é conseguir listar. */
  async testConnection(): Promise<AgendaAccountInfo> {
    await this.client.ping()
    return {}
  }

  async listProfessionals(): Promise<AgendaCatalogItem[]> {
    const employees = await this.client.listEmployees({ active: true })
    return employees.map((employee) => ({ externalId: String(employee.id), name: employee.name }))
  }

  async listServices(): Promise<AgendaCatalogItem[]> {
    const services = await this.client.listServices({ active: true })
    return services.map((service) => ({
      externalId: String(service.id),
      name: service.description,
      ...(typeof service.duration === 'number' ? { durationMinutes: service.duration } : {}),
    }))
  }

  // ==========================================================================
  // Ocupado
  // ==========================================================================

  private cacheKey(employeeId: number, date: string): string {
    return `${this.client.fingerprint}:${employeeId}:${date}`
  }

  /** Esquece a grade de um dia depois de uma escrita nossa nele. */
  private forget(employeeId: number | undefined, date: string | undefined): void {
    if (employeeId !== undefined && date) freeTimesCache.delete(this.cacheKey(employeeId, date))
  }

  private async freeTimes(employeeId: number, date: string, fresh: boolean): Promise<BelasisFreeTime[]> {
    const key = this.cacheKey(employeeId, date)
    const cached = freeTimesCache.get(key)
    if (!fresh && cached && cached.expiresAt > this.now()) return cached.slots

    const response = await this.client.getEmployeeFreeTimes(employeeId, date)
    const slots = Array.isArray(response) ? response : []
    freeTimesCache.delete(key)
    freeTimesCache.set(key, { expiresAt: this.now() + FREE_TIMES_TTL_MS, slots })
    while (freeTimesCache.size > FREE_TIMES_CACHE_MAX) {
      const oldest = freeTimesCache.keys().next().value
      if (oldest === undefined) break
      freeTimesCache.delete(oldest)
    }
    return slots
  }

  /** O horário que o agendamento sendo remarcado ocupa hoje, deste profissional. */
  private async ownRanges(externalId: string, employeeId: number): Promise<Array<{ date: string; range: TimeRange }>> {
    try {
      const ref = parseScheduleRef(externalId)
      const group = await this.client.getScheduleGroup(ref.groupId)
      if (group.status === 'disconfirm') return [] // cancelado: já não ocupa nada lá
      return itemsOf(group, ref.calendarId)
        .filter((c) => c.employee_id === employeeId && c.start_hour && c.end_hour)
        .map((c) => ({
          date: group.date,
          range: {
            start: fromBelasisWallClock(group.date, c.start_hour!, this.timeZone),
            end: fromBelasisWallClock(group.date, c.end_hour!, this.timeZone),
          },
        }))
    } catch (error) {
      if (isBelasisApiError(error) && error.kind === 'not_found') return []
      throw error
    }
  }

  async getBusyIntervals(input: {
    externalProfessionalId: string
    start: Date
    end: Date
    excludeExternalAppointmentId?: string
    fresh?: boolean
  }): Promise<AgendaBusyInterval[]> {
    const employeeId = toBelasisId(input.externalProfessionalId, 'profissional')
    const own = input.excludeExternalAppointmentId
      ? await this.ownRanges(input.excludeExternalAppointmentId, employeeId)
      : []

    const busy: AgendaBusyInterval[] = []
    for (const date of localDatesBetween(input.start, input.end, this.timeZone)) {
      const slots = await this.freeTimes(employeeId, date, input.fresh === true)
      busy.push(
        ...freeTimesToBusyIntervals(slots, date, this.timeZone, {
          alsoFree: own.filter((o) => o.date === date).map((o) => o.range),
        })
      )
    }
    return busy.filter((interval) => overlaps(interval, input))
  }

  // ==========================================================================
  // Cliente
  // ==========================================================================

  /**
   * Acha o cliente pelo telefone. A busca da API é parcial e o telefone pode estar
   * guardado formatado ("(11) 99999-8888") ou sem DDI — então busca pelos 4
   * últimos dígitos (contíguos em qualquer formato) e compara normalizado.
   */
  private async findClientByPhone(phone: string): Promise<BelasisClientRecord | null> {
    const candidates = await this.client.searchClients(phone.slice(-4))
    const matches = candidates.filter((c) => phonesMatch(c.cellphone, phone) || phonesMatch(c.phone, phone))
    return matches.find((c) => c.active !== false) ?? matches[0] ?? null
  }

  private async resolveClientId(customer: AgendaAppointmentInput['customer']): Promise<number> {
    const phone = toBelasisPhone(customer.phone)
    if (!phone) {
      throw new BelasisApiError(
        'O telefone do cliente não está num formato que a Belasis aceite (DDI + DDD + número)',
        'rejected',
        { method: 'LOCAL', path: 'phone' }
      )
    }

    const existing = await this.findClientByPhone(phone)
    if (existing) return existing.id

    try {
      const created = await this.client.createClient({
        name: customer.name.trim() || 'Cliente',
        phone,
        cellphone: phone,
      })
      return created.id
    } catch (error) {
      // "Celular já está em uso": o cliente existe (criado agora por outro
      // caminho, ou guardado num formato que a busca não pegou). Mais uma busca.
      if (isBelasisApiError(error) && error.httpStatus === 422) {
        const again = await this.findClientByPhone(phone)
        if (again) return again.id
      }
      throw error
    }
  }

  // ==========================================================================
  // Agendamento
  // ==========================================================================

  async createAppointment(input: AgendaAppointmentInput): Promise<AgendaCreatedAppointment> {
    const employeeId = toBelasisId(input.externalProfessionalId, 'profissional')
    const serviceId = toBelasisId(input.externalServiceId, 'serviço')
    const when = toBelasisWallClock(input.start, input.end, this.timeZone)

    const cachedClientId = input.customer.externalId
      ? toBelasisId(input.customer.externalId, 'cliente')
      : null
    let clientId = cachedClientId ?? (await this.resolveClientId(input.customer))

    const body = {
      client_id: clientId,
      date: when.date,
      status: 'unconfirmed' as const,
      observation: belasisObservation(input.notes, input.idempotencyKey),
      calendars_attributes: [
        {
          inventory_product_id: serviceId,
          employee_id: employeeId,
          start_hour: when.startHour,
          end_hour: when.endHour,
          reminder: false,
        },
      ],
    }

    let group
    try {
      group = await this.client.createScheduleGroup(body)
    } catch (error) {
      // O id de cliente guardado pode ter envelhecido (cliente removido lá). 422/404
      // não gravam nada, então dá para tentar de novo achando pelo telefone.
      const staleClient =
        cachedClientId !== null && isBelasisApiError(error) && (error.kind === 'rejected' || error.kind === 'not_found')
      if (!staleClient) throw error
      clientId = await this.resolveClientId(input.customer)
      group = await this.client.createScheduleGroup({ ...body, client_id: clientId })
    }

    this.forget(employeeId, when.date)
    return { externalId: String(group.id), externalCustomerId: String(clientId) }
  }

  /**
   * Tira um item de um agendamento de vários serviços (os outros continuam lá);
   * se ele era o único, cancela o agendamento inteiro.
   */
  private async removeItem(group: BelasisScheduleGroup, calendarId: number | undefined): Promise<void> {
    const calendars = group.calendars ?? []
    if (calendarId !== undefined && calendars.length > 1) {
      await this.client.updateScheduleGroup(group.id, {
        calendars_attributes: [{ id: calendarId, _destroy: true }],
      })
    } else {
      await this.client.cancelScheduleGroup(group.id)
    }
    for (const c of calendars) this.forget(c.employee_id, group.date)
  }

  async rescheduleAppointment(
    externalId: string,
    input: AgendaAppointmentInput
  ): Promise<AgendaRescheduledAppointment> {
    const ref = parseScheduleRef(externalId)
    const employeeId = toBelasisId(input.externalProfessionalId, 'profissional')
    const serviceId = toBelasisId(input.externalServiceId, 'serviço')
    const when = toBelasisWallClock(input.start, input.end, this.timeZone)

    // 404 sobe como not_found: a orquestração recria o agendamento.
    const group = await this.client.getScheduleGroup(ref.groupId)
    const calendars = group.calendars ?? []
    const item =
      ref.calendarId !== undefined
        ? calendars.find((c) => c.id === ref.calendarId)
        : calendars.length === 1
          ? calendars[0]
          : calendars.find((c) => c.employee_id === employeeId && c.inventory_product_id === serviceId)

    const movableInPlace =
      group.status !== 'disconfirm' &&
      item?.id !== undefined &&
      group.date === when.date &&
      item.employee_id === employeeId &&
      item.inventory_product_id === serviceId

    if (movableInPlace) {
      await this.client.updateScheduleGroup(group.id, {
        calendars_attributes: [{ id: item!.id!, start_hour: when.startHour, end_hour: when.endHour }],
      })
      this.forget(employeeId, when.date)
      return { externalId }
    }

    // Outro dia, outro profissional ou outro serviço: cria o novo e tira o antigo.
    const created = await this.createAppointment(input)
    if (group.status === 'disconfirm') return created // o antigo já estava cancelado lá

    try {
      await this.removeItem(group, ref.calendarId)
      return created
    } catch {
      // O cliente já tem o horário novo; o antigo fica ocupando lá até alguém
      // cancelar — a orquestração abre o alerta.
      return { ...created, staleExternalId: externalId }
    }
  }

  /** Estado atual lá. Com vários itens: o primeiro início e o último fim. */
  async getAppointment(externalId: string): Promise<AgendaAppointmentSnapshot | null> {
    const ref = parseScheduleRef(externalId)
    let group
    try {
      group = await this.client.getScheduleGroup(ref.groupId)
    } catch (error) {
      if (isBelasisApiError(error) && error.kind === 'not_found') return null
      throw error
    }
    const items = itemsOf(group, ref.calendarId).filter((c) => c.start_hour && c.end_hour)
    if (items.length === 0) return null // o item saiu do agendamento lá
    const starts = items.map((c) => fromBelasisWallClock(group.date, c.start_hour!, this.timeZone).getTime())
    const ends = items.map((c) => fromBelasisWallClock(group.date, c.end_hour!, this.timeZone).getTime())
    const single = items.length === 1 ? items[0] : undefined
    return {
      status: group.status === 'disconfirm' ? 'cancelled' : 'active',
      start: new Date(Math.min(...starts)),
      end: new Date(Math.max(...ends)),
      ...(single?.employee_id !== undefined ? { externalProfessionalId: String(single.employee_id) } : {}),
      ...(single?.inventory_product_id !== undefined ? { externalServiceId: String(single.inventory_product_id) } : {}),
      remindedByProvider: items.some((c) => c.reminder === true),
    }
  }

  async cancelAppointment(externalId: string): Promise<void> {
    const ref = parseScheduleRef(externalId)
    if (ref.calendarId === undefined) {
      const group = await this.client.cancelScheduleGroup(ref.groupId)
      for (const c of group?.calendars ?? []) this.forget(c.employee_id, group.date)
      return
    }
    await this.removeItem(await this.client.getScheduleGroup(ref.groupId), ref.calendarId)
  }

  // ==========================================================================
  // Sincronização de volta (Belasis → MinhaAgenda)
  // ==========================================================================

  /**
   * Os agendamentos lá no período, um por serviço. Agendamento de vários
   * serviços vira vários itens, com a referência "grupo:item".
   */
  async listAppointments(range: { start: Date; end: Date }): Promise<AgendaRemoteAppointment[]> {
    const startDate = formatInTimeZone(range.start, this.timeZone, 'yyyy-MM-dd')
    const endDate = formatInTimeZone(range.end, this.timeZone, 'yyyy-MM-dd')
    const groups = await this.client.listScheduleGroups({ startDate, endDate })

    const result: AgendaRemoteAppointment[] = []
    for (const group of groups) {
      const items = group.calendars ?? []
      const createdByUsId = parseBelasisReferenceMarker(group.observation)
      for (const item of items) {
        if (!item.start_hour || !item.end_hour || item.employee_id === undefined) continue
        if (item.inventory_product_id === undefined) continue
        if (items.length > 1 && item.id === undefined) continue // sem como referenciar o item
        let start: Date
        let end: Date
        try {
          start = fromBelasisWallClock(group.date, item.start_hour, this.timeZone)
          end = fromBelasisWallClock(group.date, item.end_hour, this.timeZone)
        } catch {
          continue
        }
        result.push({
          externalId: items.length === 1 ? String(group.id) : `${group.id}:${item.id}`,
          status: group.status === 'disconfirm' ? 'cancelled' : 'active',
          confirmed: group.status === 'confirmed' || group.status === 'waiting',
          start,
          end,
          externalProfessionalId: String(item.employee_id),
          externalServiceId: String(item.inventory_product_id),
          externalCustomerId: String(item.client_id ?? group.client_id),
          remindedByProvider: item.reminder === true,
          createdByUsId,
          ...(!createdByUsId && group.observation?.trim() ? { notes: group.observation.trim().slice(0, 1000) } : {}),
        })
      }
    }
    return result.filter((appointment) => overlaps(appointment, range))
  }

  async getCustomer(externalId: string): Promise<AgendaRemoteCustomer | null> {
    try {
      const client = await this.client.getClient(toBelasisId(externalId, 'cliente'))
      return { name: client.name, phone: client.cellphone || client.phone || null }
    } catch (error) {
      if (isBelasisApiError(error) && error.kind === 'not_found') return null
      throw error
    }
  }

  async findAppointmentByIdempotencyKey(
    key: string,
    hint: { externalProfessionalId: string; start: Date }
  ): Promise<{ externalId: string } | null> {
    const employeeId = toBelasisId(hint.externalProfessionalId, 'profissional')
    const when = toBelasisWallClock(hint.start, hint.start, this.timeZone)
    const marker = belasisReferenceMarker(key)

    // A referência pode estar em dois agendamentos (remarcação que criou um novo
    // e não conseguiu cancelar o antigo) — data, hora e profissional desempatam.
    const groups = await this.client.listScheduleGroups({ startDate: when.date, endDate: when.date })
    const found = groups.find(
      (g) =>
        g.status !== 'disconfirm' &&
        g.date === when.date &&
        (g.observation ?? '').includes(marker) &&
        (g.calendars ?? []).some((c) => c.employee_id === employeeId && c.start_hour === when.startHour)
    )
    return found ? { externalId: String(found.id) } : null
  }
}

/**
 * `background`: trabalho sem pressa (sincronização) — ritmo de 15 chamadas/min e
 * espera longa por vaga, para deixar metade da cota para a IA ao vivo.
 */
export function createBelasisAgendaProvider(
  token: string,
  options: { background?: boolean } = {}
): BelasisAgendaProvider {
  return new BelasisAgendaProvider(
    new BelasisClient({ apiKey: token, ...(options.background ? belasisBackgroundOptions() : {}) })
  )
}
