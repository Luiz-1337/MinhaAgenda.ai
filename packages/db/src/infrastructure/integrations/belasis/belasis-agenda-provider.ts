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
 * - COR de lead de tráfego: `schedule_color_id` no corpo da criação, com o id que
 *   `GET /schedule_colors` devolve para a cor configurada. É enfeite: recusada,
 *   não achada ou não configurada, o agendamento sai sem cor. O token é o do
 *   salão — a doc não tem credencial separada para cor.
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
  BELASIS_FALLBACK_CLIENT_NAME,
  BELASIS_TIME_ZONE,
  belasisObservation,
  belasisPhoneSearchTerms,
  belasisReferenceMarker,
  freeTimesToBusyIntervals,
  fromBelasisWallClock,
  localDatesBetween,
  parseBelasisReferenceMarker,
  phonesMatch,
  toBelasisClientName,
  toBelasisPhone,
  toBelasisWallClock,
  type TimeRange,
} from './belasis-mapping'
import type { BelasisCalendar, BelasisClientRecord, BelasisFreeTime, BelasisScheduleGroup } from './belasis-types'

/** Grade de horários reaproveitada por alguns segundos: a cota é de 30/min. */
const FREE_TIMES_TTL_MS = 45_000
const FREE_TIMES_CACHE_MAX = 1_000

const freeTimesCache = new Map<string, { expiresAt: number; slots: BelasisFreeTime[] }>()

/** 422 de cadastro de cliente que diz que o telefone já existe lá ("Celular já está em uso"). */
const PHONE_TAKEN = /em uso|j[aá] (est[aá] )?cadastrad/i

/** 422 de cadastro de cliente que recusa o nome ("Nome possui carácter inválido."). */
const NAME_REJECTED = /^\s*(nome|nickname|apelido)\b|car[aá]ctere?s? inv[aá]lid/i

/** 422 que fala da cor ("Cor de agendamento não encontrada"). `\b` para não casar com "corte". */
const COLOR_REJECTED = /\bcor(es)?\b|\bcolor/i

/**
 * A cor de tráfego já resolvida, por chave de API. A cota é de 30/min e a cor de
 * uma conta quase nunca muda: uma consulta a cada poucas horas basta.
 */
const TRAFFIC_COLOR_TTL_MS = 6 * 60 * 60_000
/**
 * Não achou a cor, a listagem falhou ou a Belasis recusou o id: fica sem cor por
 * alguns minutos e tenta de novo — assim a cor passa a valer logo depois de o
 * salão cadastrá-la, sem gastar uma chamada (ou um POST recusado) por agendamento.
 */
const TRAFFIC_COLOR_MISS_TTL_MS = 10 * 60_000
const trafficColorCache = new Map<string, { expiresAt: number; colorId: number | null }>()

/**
 * Telefones que a busca acabou de NÃO achar lá. A consulta "o que esta cliente já
 * tem marcado?" roda antes de agendar e procura o cadastro pelo telefone; sem
 * esta lembrança, uma cliente nova pagaria a mesma busca (até 7 chamadas) três
 * vezes — na primeira tentativa de agendar, na segunda (depois de informar o
 * nome) e de novo na hora de cadastrar. Com a sincronização do salão rodando
 * junto, isso estoura a cota de 30/min e o agendamento falha.
 *
 * Dez minutos cobrem o tempo de a cliente responder o nome. Se alguém cadastrar
 * a cliente lá nesse intervalo, a Belasis recusa o celular repetido e a busca é
 * refeita (ver `resolveClientId`).
 */
const PHONE_MISS_TTL_MS = 10 * 60_000
const PHONE_MISS_CACHE_MAX = 2_000
const phoneMissCache = new Map<string, number>()

/** Para testes. */
export function clearBelasisFreeTimesCache(): void {
  freeTimesCache.clear()
}

/** Para testes. */
export function clearBelasisLookupCaches(): void {
  trafficColorCache.clear()
  phoneMissCache.clear()
}

/** "Marrom", " marrom " e "MARROM" são a mesma cor; "Café" e "cafe" também. */
export function normalizeColorName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
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
  /**
   * A cor que marca, lá, o agendamento de lead de tráfego pago: o NOME da cor
   * como está cadastrada na conta ("Marrom") ou o id numérico dela. Vazio = o
   * recurso fica desligado e nenhum agendamento leva cor. Vem da variável de
   * ambiente BELASIS_TRAFFIC_COLOR (ver agenda-provider-registry.service.ts).
   *
   * Prefira o nome: os ids são de cada conta, e uma variável de ambiente vale
   * para todos os salões.
   */
  trafficColor?: string | null
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
   * guardado só com dígitos, sem DDI ou formatado ("(11) 99999-8888") — então
   * busca do termo mais específico ao mais amplo (`belasisPhoneSearchTerms`), uma
   * página cada, e compara normalizado. Só sem nada nos específicos cai nos 4
   * últimos dígitos, até 5 páginas; se o cliente não estiver nelas, é "não achei"
   * (quem chama cadastra; a Belasis recusa celular repetido), nunca "fora do ar".
   *
   * `broad: false` pula os 4 dígitos.
   */
  private async findClientByPhone(
    phone: string,
    options: { broad?: boolean } = {}
  ): Promise<BelasisClientRecord | null> {
    const terms = belasisPhoneSearchTerms(phone)
    const searches = [
      ...terms.specific.map((term) => ({ term, maxPages: 1 })),
      ...(options.broad === false ? [] : [{ term: terms.broad, maxPages: 5 }]),
    ]
    for (const { term, maxPages } of searches) {
      const { clients } = await this.client.searchClients(term, { maxPages })
      const matches = clients.filter((c) => phonesMatch(c.cellphone, phone) || phonesMatch(c.phone, phone))
      const found = matches.find((c) => c.active !== false) ?? matches[0]
      if (found) return found
    }
    return null
  }

  /**
   * Cadastra o cliente lá. Se a Belasis recusar o nome mesmo limpo (422 sobre o
   * nome ou o apelido, que ela tira do nome), tenta uma vez com o nome padrão:
   * melhor "Cliente WhatsApp" com o telefone certo do que o cliente sem horário.
   */
  private async createClient(name: string, phone: string): Promise<BelasisClientRecord> {
    try {
      return await this.client.createClient({ name, phone, cellphone: phone })
    } catch (error) {
      const nameRejected =
        name !== BELASIS_FALLBACK_CLIENT_NAME &&
        isBelasisApiError(error) &&
        error.httpStatus === 422 &&
        error.messages.some((m) => NAME_REJECTED.test(m))
      if (!nameRejected) throw error
      return this.client.createClient({ name: BELASIS_FALLBACK_CLIENT_NAME, phone, cellphone: phone })
    }
  }

  private phoneMissKey(phone: string): string {
    return `${this.client.fingerprint}:${phone}`
  }

  private rememberPhoneMiss(phone: string): void {
    phoneMissCache.set(this.phoneMissKey(phone), this.now() + PHONE_MISS_TTL_MS)
    while (phoneMissCache.size > PHONE_MISS_CACHE_MAX) {
      const oldest = phoneMissCache.keys().next().value
      if (oldest === undefined) break
      phoneMissCache.delete(oldest)
    }
  }

  private recentlyMissed(phone: string): boolean {
    const key = this.phoneMissKey(phone)
    const expiresAt = phoneMissCache.get(key)
    if (expiresAt === undefined) return false
    if (expiresAt > this.now()) return true
    phoneMissCache.delete(key)
    return false
  }

  /**
   * O cadastro de lá com este telefone, sem cadastrar ninguém. É a busca que a
   * consulta "o que esta cliente já tem marcado?" usa antes de agendar.
   */
  async findCustomerByPhone(phone: string): Promise<{ externalId: string; name: string } | null> {
    const normalized = toBelasisPhone(phone)
    if (!normalized) return null
    if (this.recentlyMissed(normalized)) return null
    const found = await this.findClientByPhone(normalized)
    if (!found) {
      this.rememberPhoneMiss(normalized)
      return null
    }
    return { externalId: String(found.id), name: found.name }
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

    // Acabou de ser procurado e não está lá: não repete a busca, cadastra.
    const existing = this.recentlyMissed(phone) ? null : await this.findClientByPhone(phone)
    if (existing) return existing.id

    try {
      const created = await this.createClient(toBelasisClientName(customer.name), phone)
      return created.id
    } catch (error) {
      // "Celular já está em uso": o cliente existe. Se foi cadastrado agora por
      // outro caminho, os termos específicos o acham; os 4 dígitos já foram lidos
      // e repetir daria o mesmo resultado.
      if (isBelasisApiError(error) && error.httpStatus === 422) {
        const again = await this.findClientByPhone(phone, { broad: false })
        if (again) return again.id
        if (error.messages.some((m) => PHONE_TAKEN.test(m))) {
          // Tentar de novo não muda nada: o cadastro lá tem o telefone num
          // formato que a busca não pega (ou está perdido numa base grande).
          throw new BelasisApiError(
            'A Belasis diz que o celular do cliente já está cadastrado, mas a busca por telefone não achou o cadastro (telefone guardado lá num formato diferente?). Confira o cadastro do cliente na Belasis',
            'rejected',
            error.detail
          )
        }
      }
      throw error
    }
  }

  // ==========================================================================
  // Agendamento
  // ==========================================================================

  private trafficColorKey(wanted: string): string {
    return `${this.client.fingerprint}:${normalizeColorName(wanted)}`
  }

  /**
   * O id da cor que marca lead de tráfego nesta conta, ou null (recurso desligado,
   * cor não cadastrada, listagem fora do ar). NUNCA lança: a cor é enfeite e não
   * pode impedir um agendamento.
   */
  private async trafficColorId(): Promise<number | null> {
    const wanted = this.options.trafficColor?.trim()
    if (!wanted) return null

    const key = this.trafficColorKey(wanted)
    const cached = trafficColorCache.get(key)
    if (cached && cached.expiresAt > this.now()) return cached.colorId

    // Id numérico configurado direto: não há o que procurar.
    if (/^\d+$/.test(wanted)) {
      const colorId = Number(wanted)
      trafficColorCache.set(key, { expiresAt: this.now() + TRAFFIC_COLOR_TTL_MS, colorId })
      return colorId
    }

    let colorId: number | null = null
    try {
      const colors = await this.client.listScheduleColors()
      const target = normalizeColorName(wanted)
      colorId = colors.find((color) => normalizeColorName(color.name ?? '') === target)?.id ?? null
    } catch {
      colorId = null
    }
    trafficColorCache.set(key, {
      expiresAt: this.now() + (colorId === null ? TRAFFIC_COLOR_MISS_TTL_MS : TRAFFIC_COLOR_TTL_MS),
      colorId,
    })
    return colorId
  }

  /** A Belasis recusou a cor: fica sem cor por alguns minutos, em vez de repetir o POST recusado. */
  private giveUpTrafficColor(): void {
    const wanted = this.options.trafficColor?.trim()
    if (!wanted) return
    trafficColorCache.set(this.trafficColorKey(wanted), {
      expiresAt: this.now() + TRAFFIC_COLOR_MISS_TTL_MS,
      colorId: null,
    })
  }

  async createAppointment(input: AgendaAppointmentInput): Promise<AgendaCreatedAppointment> {
    const employeeId = toBelasisId(input.externalProfessionalId, 'profissional')
    const serviceId = toBelasisId(input.externalServiceId, 'serviço')
    const when = toBelasisWallClock(input.start, input.end, this.timeZone)

    const cachedClientId = input.customer.externalId
      ? toBelasisId(input.customer.externalId, 'cliente')
      : null
    let clientId = cachedClientId ?? (await this.resolveClientId(input.customer))
    // Lead de tráfego pago leva a cor configurada. Sem configuração, sem cor.
    let colorId = input.leadSource === 'paid_traffic' ? await this.trafficColorId() : null

    const body = {
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

    // 422/404 não gravam nada, então dá para tentar de novo tirando o que pode ter
    // sido recusado. São duas coisas, e cada uma sai no máximo uma vez:
    //  - a COR: é enfeite. Recusada (ou na dúvida, quando não há mais o que
    //    trocar), o agendamento sai sem ela;
    //  - o id de CLIENTE guardado: pode ter envelhecido (cliente removido lá) —
    //    acha de novo pelo telefone.
    // Se a mensagem fala da cor, ela sai primeiro; senão troca o cliente primeiro,
    // para não perder a cor por um erro que não era dela.
    let clientRetried = false
    let group: BelasisScheduleGroup
    for (;;) {
      try {
        group = await this.client.createScheduleGroup({
          client_id: clientId,
          ...body,
          ...(colorId !== null ? { schedule_color_id: colorId } : {}),
        })
        break
      } catch (error) {
        if (!isBelasisApiError(error) || (error.kind !== 'rejected' && error.kind !== 'not_found')) throw error

        const canRetryClient = cachedClientId !== null && !clientRetried
        const aboutColor = error.messages.some((message) => COLOR_REJECTED.test(message))
        if (colorId !== null && (aboutColor || !canRetryClient)) {
          this.giveUpTrafficColor()
          colorId = null
          continue
        }
        if (canRetryClient) {
          clientRetried = true
          clientId = await this.resolveClientId(input.customer)
          continue
        }
        throw error
      }
    }

    this.forget(employeeId, when.date)
    return { externalId: String(group.id), externalCustomerId: String(clientId) }
  }

  /**
   * Tira um item de um agendamento de vários serviços (os outros continuam lá);
   * se ele era o único, remove o agendamento inteiro. Remove em vez de cancelar:
   * lá o cancelado continua ocupando o horário (decisão do dono, 03/nov).
   */
  private async removeItem(group: BelasisScheduleGroup, calendarId: number | undefined): Promise<void> {
    const calendars = group.calendars ?? []
    if (calendarId !== undefined && calendars.length > 1) {
      await this.client.updateScheduleGroup(group.id, {
        calendars_attributes: [{ id: calendarId, _destroy: true }],
      })
    } else {
      await this.removeGroup(group.id)
    }
    for (const c of calendars) this.forget(c.employee_id, group.date)
  }

  /** Remove lá; se a Belasis não deixar remover (422), ao menos cancela. */
  private async removeGroup(groupId: number): Promise<void> {
    try {
      await this.client.deleteScheduleGroup(groupId)
    } catch (error) {
      if (!isBelasisApiError(error) || error.kind !== 'rejected') throw error
      await this.client.cancelScheduleGroup(groupId)
    }
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
      // Serviço e profissional vão iguais aos do item: sem eles a Belasis recusa (ver o tipo).
      await this.client.updateScheduleGroup(group.id, {
        calendars_attributes: [
          {
            id: item!.id!,
            inventory_product_id: serviceId,
            employee_id: employeeId,
            start_hour: when.startHour,
            end_hour: when.endHour,
          },
        ],
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

  /** 404 sobe como not_found: a orquestração trata como "já não existe lá". */
  async cancelAppointment(externalId: string): Promise<void> {
    const ref = parseScheduleRef(externalId)
    const group = await this.client.getScheduleGroup(ref.groupId)
    // Já cancelado lá (pela recepção, por exemplo): o registro fica como está.
    if (group.status === 'disconfirm') return
    await this.removeItem(group, ref.calendarId)
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
    return this.toRemoteAppointments(groups).filter((appointment) => overlaps(appointment, range))
  }

  /**
   * Os agendamentos de UM cliente lá no período — o filtro `client_id` da
   * listagem. Uma chamada (um cliente raramente passa de uma página), contra as
   * várias da agenda do salão inteiro.
   *
   * O dono de cada item é conferido AQUI também, e não só pelo filtro: quem chama
   * dá tudo o que vier à cliente da conversa. Se a API ignorasse `client_id`, a
   * listagem voltaria com a agenda do salão inteiro, e os horários de outras
   * pessoas passariam a ser "dela". (O filtro vem da doc da Belasis; o
   * comportamento real ainda não foi conferido com a chave de um salão.)
   */
  async listCustomerAppointments(
    externalCustomerId: string,
    range: { start: Date; end: Date }
  ): Promise<AgendaRemoteAppointment[]> {
    const clientId = toBelasisId(externalCustomerId, 'cliente')
    const startDate = formatInTimeZone(range.start, this.timeZone, 'yyyy-MM-dd')
    const endDate = formatInTimeZone(range.end, this.timeZone, 'yyyy-MM-dd')
    const groups = await this.client.listScheduleGroups({ clientId, startDate, endDate })
    const owner = String(clientId)
    return this.toRemoteAppointments(groups).filter(
      (appointment) => appointment.externalCustomerId === owner && overlaps(appointment, range)
    )
  }

  /** Agendamentos da Belasis no formato da sincronização: um por serviço. */
  private toRemoteAppointments(groups: BelasisScheduleGroup[]): AgendaRemoteAppointment[] {
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
    return result
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
 *
 * `trafficColor`: a cor que marca agendamento de lead de tráfego pago (nome da cor
 * na conta, ou o id). Vazio = nenhum agendamento leva cor.
 */
export function createBelasisAgendaProvider(
  token: string,
  options: { background?: boolean; trafficColor?: string | null } = {}
): BelasisAgendaProvider {
  return new BelasisAgendaProvider(
    new BelasisClient({ apiKey: token, ...(options.background ? belasisBackgroundOptions() : {}) }),
    { trafficColor: options.trafficColor }
  )
}
