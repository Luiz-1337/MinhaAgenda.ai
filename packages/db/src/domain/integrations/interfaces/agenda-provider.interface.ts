/**
 * Agenda externa que é a AGENDA OFICIAL do salão (primeiro caso: Belasis).
 *
 * Não confundir com o Google Calendar, que é ESPELHO: o agendamento nasce aqui e
 * é copiado depois, em segundo plano, e se a cópia falhar o agendamento continua
 * valendo. Aqui é o contrário — a recepção agenda direto no sistema externo, então
 * ele é quem sabe o que está ocupado, e um agendamento só vale se ele aceitar.
 *
 * Por isso o contrato é SÍNCRONO e toda falha sai como `AgendaProviderError` com
 * um `kind`: quem chama precisa distinguir "o horário foi recusado" (desfaz a
 * reserva local) de "não sei se gravou" (a reserva pode existir do lado de lá).
 *
 * IDs externos são sempre string: cada sistema usa o seu formato (int, uuid...) e
 * a tabela `integration_external_refs` guarda o de-para.
 */

/** Provedores que podem ser agenda oficial. Um por salão, no máximo. */
export type AgendaProviderId = 'belasis'

export const AGENDA_PROVIDER_LABELS: Record<AgendaProviderId, string> = {
  belasis: 'Belasis',
}

/**
 * O que a credencial enxerga — mostrado ao dono na hora de conectar. Opcional:
 * nem toda API tem um endpoint de "quem sou eu" (a Belasis não tem).
 */
export interface AgendaAccountInfo {
  accountId?: string
  accountName?: string
}

/** Profissional ou serviço do catálogo externo, para o de-para na conexão. */
export interface AgendaCatalogItem {
  externalId: string
  name: string
  durationMinutes?: number
}

/** Período ocupado na agenda externa. */
export interface AgendaBusyInterval {
  start: Date
  end: Date
  /**
   * Agendamento externo que ocupa o período, quando a API informa. Permite que o
   * reagendamento ignore o próprio horário atual ao checar conflito.
   */
  externalAppointmentId?: string
}

export interface AgendaAppointmentInput {
  /**
   * `appointments.id` local. O provedor manda como chave de idempotência se a API
   * aceitar; se não, grava nas observações — é o que permite achar o agendamento
   * depois de uma escrita incerta (timeout após enviar).
   */
  idempotencyKey: string
  externalProfessionalId: string
  externalServiceId: string
  /** Instantes absolutos (UTC). Converter para o fuso que a API exigir é do provedor. */
  start: Date
  end: Date
  customer: {
    name: string
    phone: string
    /** Id do cliente no sistema externo, se já conhecido (evita buscar por telefone). */
    externalId?: string
  }
  notes?: string
}

export interface AgendaCreatedAppointment {
  externalId: string
  /** Id do cliente no sistema externo, se o provedor criou ou achou um. */
  externalCustomerId?: string
}

/** O estado atual de um agendamento lá — conferência antes do lembrete e sincronização. */
export interface AgendaAppointmentSnapshot {
  status: 'active' | 'cancelled'
  start: Date
  end: Date
  externalProfessionalId?: string
  externalServiceId?: string
  /** O sistema externo vai mandar o lembrete deste agendamento ao cliente. */
  remindedByProvider?: boolean
}

/** Um agendamento como está lá, para trazer para cá (sincronização de volta). */
export interface AgendaRemoteAppointment extends AgendaAppointmentSnapshot {
  externalId: string
  externalProfessionalId: string
  externalServiceId: string
  externalCustomerId: string
  /** Confirmado pelo cliente/salão lá (vira `confirmed` aqui; senão `pending`). */
  confirmed: boolean
  remindedByProvider: boolean
  /** `appointments.id` local, quando foi o MinhaAgenda que criou (referência na observação). */
  createdByUsId: string | null
  notes?: string
}

export interface AgendaRemoteCustomer {
  name: string
  /** Como está lá; quem usa normaliza. */
  phone: string | null
}

export interface AgendaRescheduledAppointment extends AgendaCreatedAppointment {
  /**
   * O agendamento antigo, quando a remarcação virou "cria o novo e cancela o
   * antigo" e o cancelamento do antigo falhou: ele continua ocupando o horário lá.
   */
  staleExternalId?: string
}

export interface AgendaProvider {
  readonly id: AgendaProviderId

  /** Valida a credencial. Lança `AgendaProviderError` kind 'auth' se não servir. */
  testConnection(): Promise<AgendaAccountInfo>

  listProfessionals(): Promise<AgendaCatalogItem[]>
  listServices(): Promise<AgendaCatalogItem[]>

  getBusyIntervals(input: {
    externalProfessionalId: string
    start: Date
    end: Date
    /**
     * Agendamento cujo horário NÃO conta como ocupado — o que está sendo
     * remarcado, que na agenda externa ainda ocupa o horário atual.
     */
    excludeExternalAppointmentId?: string
    /**
     * Ignora qualquer cache do provedor. A checagem final antes de gravar usa;
     * a lista de horários sugeridos pode aceitar um dado de alguns segundos.
     */
    fresh?: boolean
  }): Promise<AgendaBusyInterval[]>

  createAppointment(input: AgendaAppointmentInput): Promise<AgendaCreatedAppointment>
  /**
   * Devolve o id externo DEPOIS da remarcação: pode ser outro, quando a API não
   * move o agendamento (ex.: de dia) e a remarcação vira criar + cancelar.
   */
  rescheduleAppointment(
    externalId: string,
    input: AgendaAppointmentInput
  ): Promise<AgendaRescheduledAppointment>
  cancelAppointment(externalId: string, input: { reason?: string }): Promise<void>

  /**
   * Opcional: o estado ATUAL de um agendamento lá (null = não existe mais). Serve
   * para APIs sem webhook (a Belasis não tem): antes de mandar o lembrete, confere
   * se a recepção não cancelou ou mudou o horário na agenda oficial.
   */
  getAppointment?(externalId: string): Promise<AgendaAppointmentSnapshot | null>

  /**
   * Opcional: os agendamentos lá num período (incluindo os que a recepção marcou).
   * É o que o botão "Sincronizar" usa para trazer a agenda oficial para cá.
   */
  listAppointments?(range: { start: Date; end: Date }): Promise<AgendaRemoteAppointment[]>

  /** Opcional: nome e telefone de um cliente de lá (null = não existe). */
  getCustomer?(externalId: string): Promise<AgendaRemoteCustomer | null>

  /**
   * Opcional: acha um agendamento pela chave de idempotência. Só é chamado depois
   * de uma escrita incerta. Sem ele, a escrita incerta é tratada como falha (e um
   * alerta pede para a equipe conferir a agenda externa).
   */
  findAppointmentByIdempotencyKey?(
    key: string,
    hint: { externalProfessionalId: string; start: Date }
  ): Promise<{ externalId: string } | null>
}
