/**
 * Formatos da API Belasis, transcritos da documentação oficial
 * (https://belasis-api.readme.io — OpenAPI 3.0.1 "Belasis API v1", lida em
 * 15/out/2026). Nomes de campo exatamente como a API usa (snake_case).
 *
 * O que a doc NÃO diz, e por isso não está tipado como fato:
 * - não há parâmetro de estabelecimento: tudo é "associado ao token de API";
 * - não há chave de idempotência;
 * - não diz se criar agendamento em horário ocupado é recusado (nem com qual erro);
 * - o fuso de `date`/`start_hour` não é dito — são hora de parede, tratadas como
 *   horário de Brasília, igual ao resto do sistema.
 */

/** Envelope de toda listagem. `limit` máximo = 100. */
export interface BelasisPage<T> {
  data: T[]
  page: number
  limit: number
  total: number
}

/** `confirmed` | `unconfirmed` (padrão na criação) | `disconfirm` (cancelado) | `waiting`. */
export type BelasisScheduleStatus = 'confirmed' | 'unconfirmed' | 'disconfirm' | 'waiting'

/** GET /api/v1/employees — a listagem só traz id e nome. */
export interface BelasisEmployee {
  id: number
  name: string
}

/** GET /api/v1/employees/{id}/free_times?date=YYYY-MM-DD */
export interface BelasisFreeTime {
  /** "HH:MM" (hora de parede). */
  hour: string
  label: 'available' | 'unavailable'
}

/** GET /api/v1/inventory/services (e /employees/{id}/services). */
export interface BelasisService {
  id: number
  description: string
  price_cents: number
  duration?: number
  active?: boolean
  available_to_online_scheduling?: boolean
  group_id?: number
  commission?: number
  observation?: string
  favorite?: boolean
}

/**
 * GET /api/v1/clients. Na resposta, o telefone pode vir SEM o DDI (o exemplo da
 * doc é "1133334444"), embora o envio exija DDI — comparar sempre normalizado.
 */
export interface BelasisClientRecord {
  id: number
  name: string
  phone?: string
  cellphone?: string
  birthday?: string
  active?: boolean
  cpf?: string
  nickname?: string
  observation?: string
}

/** POST /api/v1/clients — `name` e `phone` obrigatórios; telefones só dígitos com DDI. */
export interface BelasisCreateClientBody {
  name: string
  phone: string
  cellphone?: string
  observation?: string
}

/** Um item ("calendário") de um agendamento: um serviço com um profissional. */
export interface BelasisCalendar {
  id?: number
  /** ID do serviço. */
  inventory_product_id?: number
  employee_id?: number
  /** "HH:MM" */
  start_hour?: string
  /** "HH:MM" */
  end_hour?: string
  reminder?: boolean
  observation?: string
  client_id?: number
}

/**
 * GET /api/v1/schedule_colors — as cores de agendamento "cadastradas pela
 * empresa", todas de uma vez (sem paginação), em ordem alfabética. Endpoint que
 * não existia na leitura de 15/out; lido em 12/nov/2026. Os ids são da conta:
 * o "Marrom" de um salão não é o de outro.
 */
export interface BelasisScheduleColor {
  id: number
  name: string
  /** Hexadecimal, um de 24 códigos fixos (ex.: "#3E2723"). */
  color: string
  /** Status de que esta é a cor padrão (`confirmed`, `unconfirmed`...), ou null. */
  default_for?: string | null
}

/** GET /api/v1/schedule_groups[/{id}] — o "agendamento" da Belasis. */
export interface BelasisScheduleGroup {
  id: number
  client_id: number
  /** Null = a cor padrão do status. */
  schedule_color_id?: number | null
  status?: BelasisScheduleStatus
  observation?: string
  /** "YYYY-MM-DD" */
  date: string
  calendars?: BelasisCalendar[]
}

/** POST /api/v1/schedule_groups */
export interface BelasisCreateScheduleGroupBody {
  client_id: number
  date: string
  status?: BelasisScheduleStatus
  /**
   * Cor do agendamento (id de `GET /schedule_colors`). Opcional: "Quando não
   * informado, é usada a cor padrão do status." Cor inexistente → 422 "Cor de
   * agendamento não encontrada" (texto do endpoint de trocar cor).
   */
  schedule_color_id?: number
  observation?: string
  calendars_attributes: Array<{
    inventory_product_id: number
    employee_id: number
    start_hour: string
    end_hour: string
    reminder?: boolean
  }>
}

/**
 * PATCH /api/v1/schedule_groups/{id}. Não aceita `date`, nem trocar profissional
 * ou serviço de um item: só a hora (e remover itens). Por isso remarcar para outro
 * dia/profissional é "criar o novo e cancelar o antigo" — o que a própria doc
 * indica no status `disconfirm`.
 *
 * Mudar a hora de um item exige mandar junto o serviço (e o profissional) que ele
 * já tem, embora a doc liste só `id`/hora: sem isso, 422 "Calendars calendar
 * products product é obrigatório(a)" (API real, 03/nov).
 */
export interface BelasisUpdateScheduleGroupBody {
  status?: BelasisScheduleStatus
  observation?: string
  calendars_attributes?: Array<{
    id: number
    /** Obrigatório na prática ao mudar a hora; o mesmo serviço que o item já tem. */
    inventory_product_id?: number
    employee_id?: number
    start_hour?: string
    end_hour?: string
    reminder?: boolean
    _destroy?: boolean
  }>
}
