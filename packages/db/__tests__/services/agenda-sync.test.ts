import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * O núcleo de agenda-sync não toca no banco (tudo chega por AgendaSyncContext),
 * mas o módulo importa `db` do barrel, que lança sem DATABASE_URL. O `postgres()`
 * é preguiçoso — uma URL de fachada basta (mesmo truque do trinks-client.test).
 */
process.env.DATABASE_URL ||= 'postgres://test:test@localhost:5432/test'

const {
  checkAgendaSlot,
  createInAgenda,
  rescheduleInAgenda,
  cancelInAgenda,
  inspectAgendaAppointment,
  AGENDA_SYNC_MESSAGES,
} = await import('../../src/services/agenda-sync.service')
const { AgendaProviderError } = await import('../../src/domain/errors/agenda-provider-error')

import type {
  AgendaAlert,
  AgendaPushInput,
  AgendaSyncContext,
} from '../../src/services/agenda-sync.service'
import type {
  AgendaAppointmentInput,
  AgendaBusyInterval,
  AgendaProvider,
} from '../../src/domain/integrations/interfaces/agenda-provider.interface'
import type { ExternalRefEntity } from '../../src/infrastructure/repositories/integration-external-refs.repository'

const SALON = '00000000-0000-4000-8000-000000000001'
const PRO = '00000000-0000-4000-8000-0000000000a1'
const SERVICE = '00000000-0000-4000-8000-0000000000b1'
const CUSTOMER = '00000000-0000-4000-8000-0000000000c1'
const APPOINTMENT = '00000000-0000-4000-8000-0000000000d1'

const at = (hhmm: string) => new Date(`2026-11-10T${hhmm}:00.000Z`)

/** Provedor falso: cada método é um vi.fn que o teste programa. */
function fakeProvider(overrides: Partial<AgendaProvider> = {}) {
  return {
    id: 'belasis' as const,
    testConnection: vi.fn(async () => ({ accountId: '1', accountName: 'Salão Teste' })),
    listProfessionals: vi.fn(async () => []),
    listServices: vi.fn(async () => []),
    getBusyIntervals: vi.fn(async (): Promise<AgendaBusyInterval[]> => []),
    createAppointment: vi.fn(async () => ({ externalId: 'ext-appt-1' })),
    rescheduleAppointment: vi.fn(
      async (): Promise<{ externalId: string; externalCustomerId?: string; staleExternalId?: string }> => ({
        externalId: 'ext-appt-1',
      })
    ),
    cancelAppointment: vi.fn(async () => undefined),
    ...overrides,
  }
}

/** De-para em memória, com a mesma chave (entidade + id interno) da tabela. */
function memoryRefs(initial: Partial<Record<ExternalRefEntity, Record<string, string>>> = {}) {
  const store = new Map<string, string>()
  for (const [entity, pairs] of Object.entries(initial)) {
    for (const [internalId, externalId] of Object.entries(pairs ?? {})) {
      store.set(`${entity}:${internalId}`, externalId)
    }
  }
  return {
    store,
    getExternalId: vi.fn(async (entity: ExternalRefEntity, internalId: string) =>
      store.get(`${entity}:${internalId}`) ?? null
    ),
    getInternalId: vi.fn(async (entity: ExternalRefEntity, externalId: string) => {
      for (const [key, value] of store) {
        if (value === externalId && key.startsWith(`${entity}:`)) return key.slice(entity.length + 1)
      }
      return null
    }),
    setExternalId: vi.fn(async (entity: ExternalRefEntity, internalId: string, externalId: string) => {
      store.set(`${entity}:${internalId}`, externalId)
    }),
  }
}

const LINKED = { professional: { [PRO]: 'ext-pro-1' }, service: { [SERVICE]: 'ext-svc-1' } }

function makeCtx(provider: ReturnType<typeof fakeProvider>, refs = memoryRefs(LINKED)) {
  const alerts: AgendaAlert[] = []
  const ctx: AgendaSyncContext = {
    agenda: { providerId: 'belasis', salonId: SALON, integrationId: 'int-1', provider },
    refs,
    alert: async (alert) => {
      alerts.push(alert)
    },
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  }
  return { ctx, alerts, refs }
}

const push: AgendaPushInput = {
  appointmentId: APPOINTMENT,
  professionalId: PRO,
  serviceId: SERVICE,
  start: at('13:00'),
  end: at('14:00'),
  customer: { id: CUSTOMER, name: 'Maria Souza', phone: '5547999990000' },
  notes: 'Cliente prefere secador frio',
}

const uncertain = () => new AgendaProviderError('timeout após enviar', 'belasis', 'uncertain')

describe('checkAgendaSlot — o horário está livre na agenda oficial?', () => {
  it('livre → ok, perguntando pelo profissional EXTERNO, pela janela pedida e sem cache', async () => {
    const provider = fakeProvider()
    const { ctx } = makeCtx(provider)

    const result = await checkAgendaSlot(ctx, { professionalId: PRO, start: at('13:00'), end: at('14:00') })

    expect(result).toEqual({ ok: true })
    expect(provider.getBusyIntervals).toHaveBeenCalledWith({
      externalProfessionalId: 'ext-pro-1',
      start: at('13:00'),
      end: at('14:00'),
      fresh: true,
    })
  })

  it('período ocupado que sobrepõe → conflito', async () => {
    const provider = fakeProvider({
      getBusyIntervals: vi.fn(async () => [{ start: at('13:30'), end: at('14:30') }]),
    })
    const { ctx } = makeCtx(provider)

    const result = await checkAgendaSlot(ctx, { professionalId: PRO, start: at('13:00'), end: at('14:00') })

    expect(result).toEqual({
      ok: false,
      code: 'EXTERNAL_AGENDA_CONFLICT',
      error: AGENDA_SYNC_MESSAGES.conflict,
    })
  })

  it('período que só encosta (termina quando o pedido começa) → não é conflito', async () => {
    const provider = fakeProvider({
      getBusyIntervals: vi.fn(async () => [{ start: at('12:00'), end: at('13:00') }]),
    })
    const { ctx } = makeCtx(provider)

    const result = await checkAgendaSlot(ctx, { professionalId: PRO, start: at('13:00'), end: at('14:00') })

    expect(result.ok).toBe(true)
  })

  it('profissional sem vínculo → recusa sem chamar a API e alerta o salão', async () => {
    const provider = fakeProvider()
    const { ctx, alerts } = makeCtx(provider, memoryRefs())

    const result = await checkAgendaSlot(ctx, { professionalId: PRO, start: at('13:00'), end: at('14:00') })

    expect(result).toMatchObject({ ok: false, code: 'EXTERNAL_AGENDA_NOT_LINKED' })
    expect(provider.getBusyIntervals).not.toHaveBeenCalled()
    expect(alerts.map((a) => a.type)).toEqual(['agenda_not_linked'])
  })

  it('agenda sem resposta → TRAVA (fail-closed), ao contrário do Google', async () => {
    const provider = fakeProvider({
      getBusyIntervals: vi.fn(async () => {
        throw new AgendaProviderError('ECONNREFUSED', 'belasis', 'unavailable')
      }),
    })
    const { ctx } = makeCtx(provider)

    const result = await checkAgendaSlot(ctx, { professionalId: PRO, start: at('13:00'), end: at('14:00') })

    expect(result).toEqual({
      ok: false,
      code: 'EXTERNAL_AGENDA_UNAVAILABLE',
      error: AGENDA_SYNC_MESSAGES.unavailable,
    })
  })

  it('erro cru (não traduzido pelo provedor) também trava', async () => {
    const provider = fakeProvider({
      getBusyIntervals: vi.fn(async () => {
        throw new TypeError('fetch failed')
      }),
    })
    const { ctx } = makeCtx(provider)

    const result = await checkAgendaSlot(ctx, { professionalId: PRO, start: at('13:00'), end: at('14:00') })

    expect(result).toMatchObject({ ok: false, code: 'EXTERNAL_AGENDA_UNAVAILABLE' })
  })

  it('credencial recusada → trava e abre alerta CRÍTICO de reconexão', async () => {
    const provider = fakeProvider({
      getBusyIntervals: vi.fn(async () => {
        throw new AgendaProviderError('401', 'belasis', 'auth')
      }),
    })
    const { ctx, alerts } = makeCtx(provider)

    const result = await checkAgendaSlot(ctx, { professionalId: PRO, start: at('13:00'), end: at('14:00') })

    expect(result).toMatchObject({ ok: false, code: 'EXTERNAL_AGENDA_UNAVAILABLE' })
    expect(alerts).toEqual([expect.objectContaining({ type: 'agenda_auth_failed', severity: 'critical' })])
  })

  describe('remarcação (current = o próprio agendamento)', () => {
    it('já existe lá → pede ao provedor para descontar o horário dele', async () => {
      const provider = fakeProvider()
      const refs = memoryRefs({ ...LINKED, appointment: { [APPOINTMENT]: 'ext-appt-1' } })
      const { ctx } = makeCtx(provider, refs)

      const result = await checkAgendaSlot(ctx, {
        professionalId: PRO,
        start: at('13:00'),
        end: at('14:00'),
        current: { appointmentId: APPOINTMENT },
      })

      expect(result.ok).toBe(true)
      expect(provider.getBusyIntervals).toHaveBeenCalledWith(
        expect.objectContaining({ excludeExternalAppointmentId: 'ext-appt-1', fresh: true })
      )
    })

    it('período marcado como do próprio agendamento não conflita consigo', async () => {
      const provider = fakeProvider({
        getBusyIntervals: vi.fn(async () => [
          { start: at('12:30'), end: at('13:30'), externalAppointmentId: 'ext-appt-1' },
        ]),
      })
      const refs = memoryRefs({ ...LINKED, appointment: { [APPOINTMENT]: 'ext-appt-1' } })
      const { ctx } = makeCtx(provider, refs)

      const result = await checkAgendaSlot(ctx, {
        professionalId: PRO,
        start: at('13:00'),
        end: at('14:00'),
        current: { appointmentId: APPOINTMENT },
      })

      expect(result.ok).toBe(true)
    })

    it('OUTRO período sobreposto continua sendo conflito', async () => {
      const provider = fakeProvider({
        getBusyIntervals: vi.fn(async () => [{ start: at('13:30'), end: at('14:30') }]),
      })
      const refs = memoryRefs({ ...LINKED, appointment: { [APPOINTMENT]: 'ext-appt-1' } })
      const { ctx } = makeCtx(provider, refs)

      const result = await checkAgendaSlot(ctx, {
        professionalId: PRO,
        start: at('13:00'),
        end: at('14:00'),
        current: { appointmentId: APPOINTMENT },
      })

      expect(result).toMatchObject({ ok: false, code: 'EXTERNAL_AGENDA_CONFLICT' })
    })

    it('ainda não existe lá → nada a descontar (e nenhum período é presumido "dele")', async () => {
      const provider = fakeProvider({
        getBusyIntervals: vi.fn(async () => [{ start: at('12:30'), end: at('13:30') }]),
      })
      const { ctx } = makeCtx(provider)

      const result = await checkAgendaSlot(ctx, {
        professionalId: PRO,
        start: at('13:00'),
        end: at('14:00'),
        current: { appointmentId: APPOINTMENT },
      })

      expect(result).toMatchObject({ ok: false, code: 'EXTERNAL_AGENDA_CONFLICT' })
      expect(provider.getBusyIntervals.mock.calls[0][0]).not.toHaveProperty('excludeExternalAppointmentId')
    })
  })
})

describe('createInAgenda — grava lá o que acabou de ser reservado aqui', () => {
  it('sucesso: manda os IDs EXTERNOS + a chave de idempotência e guarda os vínculos', async () => {
    const provider = fakeProvider({
      createAppointment: vi.fn(async () => ({ externalId: 'ext-appt-9', externalCustomerId: 'ext-cli-7' })),
    })
    const { ctx, refs } = makeCtx(provider)

    const result = await createInAgenda(ctx, push)

    expect(result).toEqual({ ok: true, externalId: 'ext-appt-9' })
    const sent = provider.createAppointment.mock.calls[0][0] as AgendaAppointmentInput
    expect(sent).toEqual({
      idempotencyKey: APPOINTMENT,
      externalProfessionalId: 'ext-pro-1',
      externalServiceId: 'ext-svc-1',
      start: at('13:00'),
      end: at('14:00'),
      customer: { name: 'Maria Souza', phone: '5547999990000' },
      notes: 'Cliente prefere secador frio',
    })
    expect(refs.store.get(`appointment:${APPOINTMENT}`)).toBe('ext-appt-9')
    expect(refs.store.get(`customer:${CUSTOMER}`)).toBe('ext-cli-7')
  })

  it('cliente já vinculado → manda o id externo dele (sem busca por telefone lá)', async () => {
    const provider = fakeProvider()
    const refs = memoryRefs({ ...LINKED, customer: { [CUSTOMER]: 'ext-cli-7' } })
    const { ctx } = makeCtx(provider, refs)

    await createInAgenda(ctx, push)

    const sent = provider.createAppointment.mock.calls[0][0] as AgendaAppointmentInput
    expect(sent.customer).toEqual({ name: 'Maria Souza', phone: '5547999990000', externalId: 'ext-cli-7' })
  })

  it('serviço sem vínculo → recusa sem chamar a API', async () => {
    const provider = fakeProvider()
    const { ctx } = makeCtx(provider, memoryRefs({ professional: LINKED.professional }))

    const result = await createInAgenda(ctx, push)

    expect(result).toEqual({
      ok: false,
      code: 'EXTERNAL_AGENDA_NOT_LINKED',
      error: AGENDA_SYNC_MESSAGES.notLinkedService,
    })
    expect(provider.createAppointment).not.toHaveBeenCalled()
  })

  it('agenda recusa o horário → conflito, nenhum vínculo gravado', async () => {
    const provider = fakeProvider({
      createAppointment: vi.fn(async () => {
        throw new AgendaProviderError('horário ocupado', 'belasis', 'slot_unavailable')
      }),
    })
    const { ctx, refs } = makeCtx(provider)

    const result = await createInAgenda(ctx, push)

    expect(result).toMatchObject({ ok: false, code: 'EXTERNAL_AGENDA_CONFLICT' })
    expect(refs.setExternalId).not.toHaveBeenCalled()
  })

  it('agenda recusa por regra de negócio → rejeitado + alerta para revisar vínculos', async () => {
    const provider = fakeProvider({
      createAppointment: vi.fn(async () => {
        throw new AgendaProviderError('serviço inativo', 'belasis', 'rejected')
      }),
    })
    const { ctx, alerts } = makeCtx(provider)

    const result = await createInAgenda(ctx, push)

    expect(result).toEqual({ ok: false, code: 'EXTERNAL_AGENDA_REJECTED', error: AGENDA_SYNC_MESSAGES.rejected })
    expect(alerts.map((a) => a.type)).toEqual(['agenda_rejected'])
  })

  describe('escrita incerta (enviou e a resposta não veio)', () => {
    it('provedor acha pela chave de idempotência → era sucesso', async () => {
      const provider = fakeProvider({
        createAppointment: vi.fn(async () => {
          throw uncertain()
        }),
        findAppointmentByIdempotencyKey: vi.fn(async () => ({ externalId: 'ext-achado' })),
      })
      const { ctx, refs, alerts } = makeCtx(provider)

      const result = await createInAgenda(ctx, push)

      expect(result).toEqual({ ok: true, externalId: 'ext-achado' })
      expect(provider.findAppointmentByIdempotencyKey).toHaveBeenCalledWith(APPOINTMENT, {
        externalProfessionalId: 'ext-pro-1',
        start: at('13:00'),
      })
      expect(refs.store.get(`appointment:${APPOINTMENT}`)).toBe('ext-achado')
      expect(alerts).toEqual([])
    })

    it('provedor confere e NÃO acha → falha comum, sem alerta', async () => {
      const provider = fakeProvider({
        createAppointment: vi.fn(async () => {
          throw uncertain()
        }),
        findAppointmentByIdempotencyKey: vi.fn(async () => null),
      })
      const { ctx, alerts } = makeCtx(provider)

      const result = await createInAgenda(ctx, push)

      expect(result).toMatchObject({ ok: false, code: 'EXTERNAL_AGENDA_UNAVAILABLE' })
      expect(alerts).toEqual([])
    })

    it('provedor sem como conferir → falha + alerta para a equipe olhar a agenda', async () => {
      const provider = fakeProvider({
        createAppointment: vi.fn(async () => {
          throw uncertain()
        }),
      })
      const { ctx, alerts } = makeCtx(provider)

      const result = await createInAgenda(ctx, push)

      expect(result).toMatchObject({ ok: false, code: 'EXTERNAL_AGENDA_UNAVAILABLE' })
      expect(alerts).toEqual([
        expect.objectContaining({
          type: 'agenda_write_uncertain',
          detail: expect.objectContaining({ appointmentId: APPOINTMENT, customerName: 'Maria Souza' }),
        }),
      ])
    })

    it('a própria conferência falha → também alerta', async () => {
      const provider = fakeProvider({
        createAppointment: vi.fn(async () => {
          throw uncertain()
        }),
        findAppointmentByIdempotencyKey: vi.fn(async () => {
          throw new Error('timeout de novo')
        }),
      })
      const { ctx, alerts } = makeCtx(provider)

      const result = await createInAgenda(ctx, push)

      expect(result.ok).toBe(false)
      expect(alerts.map((a) => a.type)).toEqual(['agenda_write_uncertain'])
    })
  })

  it('aceito lá mas o vínculo não salvou → continua SUCESSO (desfazer seria pior) e alerta', async () => {
    const provider = fakeProvider()
    const refs = memoryRefs(LINKED)
    refs.setExternalId.mockRejectedValueOnce(new Error('db caiu'))
    const { ctx, alerts } = makeCtx(provider, refs)

    const result = await createInAgenda(ctx, push)

    expect(result).toEqual({ ok: true, externalId: 'ext-appt-1' })
    expect(alerts.map((a) => a.type)).toEqual(['agenda_ref_not_saved'])
  })
})

describe('rescheduleInAgenda — remarcação', () => {
  it('já existe lá → remarca pelo id externo', async () => {
    const provider = fakeProvider()
    const refs = memoryRefs({ ...LINKED, appointment: { [APPOINTMENT]: 'ext-appt-1' } })
    const { ctx } = makeCtx(provider, refs)

    const result = await rescheduleInAgenda(ctx, push)

    expect(result).toEqual({ ok: true, externalId: 'ext-appt-1' })
    expect(provider.rescheduleAppointment).toHaveBeenCalledWith(
      'ext-appt-1',
      expect.objectContaining({ start: at('13:00'), externalProfessionalId: 'ext-pro-1' })
    )
    expect(provider.createAppointment).not.toHaveBeenCalled()
  })

  it('a remarcação virou OUTRO agendamento lá (criar + cancelar) → guarda o id novo', async () => {
    const provider = fakeProvider({
      rescheduleAppointment: vi.fn(async () => ({ externalId: 'ext-novo', externalCustomerId: 'ext-cli-7' })),
    })
    const refs = memoryRefs({ ...LINKED, appointment: { [APPOINTMENT]: 'ext-appt-1' } })
    const { ctx, alerts } = makeCtx(provider, refs)

    const result = await rescheduleInAgenda(ctx, push)

    expect(result).toEqual({ ok: true, externalId: 'ext-novo' })
    expect(refs.store.get(`appointment:${APPOINTMENT}`)).toBe('ext-novo')
    expect(refs.store.get(`customer:${CUSTOMER}`)).toBe('ext-cli-7')
    expect(alerts).toEqual([])
  })

  it('o antigo não foi cancelado lá → segue OK (o cliente tem o horário novo) e alerta', async () => {
    const provider = fakeProvider({
      rescheduleAppointment: vi.fn(async () => ({ externalId: 'ext-novo', staleExternalId: 'ext-appt-1' })),
    })
    const refs = memoryRefs({ ...LINKED, appointment: { [APPOINTMENT]: 'ext-appt-1' } })
    const { ctx, alerts } = makeCtx(provider, refs)

    const result = await rescheduleInAgenda(ctx, push)

    expect(result).toEqual({ ok: true, externalId: 'ext-novo' })
    expect(alerts).toEqual([
      expect.objectContaining({ type: 'agenda_cancel_failed', detail: expect.objectContaining({ staleExternalId: 'ext-appt-1' }) }),
    ])
  })

  it('não existe lá (criado antes da conexão) → passa a existir', async () => {
    const provider = fakeProvider()
    const { ctx, refs } = makeCtx(provider)

    const result = await rescheduleInAgenda(ctx, push)

    expect(result).toEqual({ ok: true, externalId: 'ext-appt-1' })
    expect(provider.rescheduleAppointment).not.toHaveBeenCalled()
    expect(refs.store.get(`appointment:${APPOINTMENT}`)).toBe('ext-appt-1')
  })

  it('apagaram lá (not_found) → recria no horário novo', async () => {
    const provider = fakeProvider({
      rescheduleAppointment: vi.fn(async () => {
        throw new AgendaProviderError('404', 'belasis', 'not_found')
      }),
      createAppointment: vi.fn(async () => ({ externalId: 'ext-recriado' })),
    })
    const refs = memoryRefs({ ...LINKED, appointment: { [APPOINTMENT]: 'ext-appt-1' } })
    const { ctx } = makeCtx(provider, refs)

    const result = await rescheduleInAgenda(ctx, push)

    expect(result).toEqual({ ok: true, externalId: 'ext-recriado' })
    expect(refs.store.get(`appointment:${APPOINTMENT}`)).toBe('ext-recriado')
  })

  it('horário recusado lá → conflito (quem chama volta a linha local)', async () => {
    const provider = fakeProvider({
      rescheduleAppointment: vi.fn(async () => {
        throw new AgendaProviderError('ocupado', 'belasis', 'slot_unavailable')
      }),
    })
    const refs = memoryRefs({ ...LINKED, appointment: { [APPOINTMENT]: 'ext-appt-1' } })
    const { ctx } = makeCtx(provider, refs)

    const result = await rescheduleInAgenda(ctx, push)

    expect(result).toMatchObject({ ok: false, code: 'EXTERNAL_AGENDA_CONFLICT' })
  })

  it('remarcação incerta → falha + alerta', async () => {
    const provider = fakeProvider({
      rescheduleAppointment: vi.fn(async () => {
        throw uncertain()
      }),
    })
    const refs = memoryRefs({ ...LINKED, appointment: { [APPOINTMENT]: 'ext-appt-1' } })
    const { ctx, alerts } = makeCtx(provider, refs)

    const result = await rescheduleInAgenda(ctx, push)

    expect(result).toMatchObject({ ok: false, code: 'EXTERNAL_AGENDA_UNAVAILABLE' })
    expect(alerts.map((a) => a.type)).toEqual(['agenda_write_uncertain'])
  })
})

describe('cancelInAgenda — cancelamento', () => {
  it('nunca foi para lá → nada a fazer', async () => {
    const provider = fakeProvider()
    const { ctx } = makeCtx(provider)

    const result = await cancelInAgenda(ctx, { appointmentId: APPOINTMENT })

    expect(result).toEqual({ ok: true })
    expect(provider.cancelAppointment).not.toHaveBeenCalled()
  })

  it('existe lá → cancela pelo id externo, com o motivo', async () => {
    const provider = fakeProvider()
    const refs = memoryRefs({ ...LINKED, appointment: { [APPOINTMENT]: 'ext-appt-1' } })
    const { ctx } = makeCtx(provider, refs)

    const result = await cancelInAgenda(ctx, { appointmentId: APPOINTMENT, reason: 'cliente desistiu' })

    expect(result).toEqual({ ok: true, externalId: 'ext-appt-1' })
    expect(provider.cancelAppointment).toHaveBeenCalledWith('ext-appt-1', { reason: 'cliente desistiu' })
  })

  it('já não existe lá → ok', async () => {
    const provider = fakeProvider({
      cancelAppointment: vi.fn(async () => {
        throw new AgendaProviderError('404', 'belasis', 'not_found')
      }),
    })
    const refs = memoryRefs({ ...LINKED, appointment: { [APPOINTMENT]: 'ext-appt-1' } })
    const { ctx, alerts } = makeCtx(provider, refs)

    const result = await cancelInAgenda(ctx, { appointmentId: APPOINTMENT })

    expect(result.ok).toBe(true)
    expect(alerts).toEqual([])
  })

  it('não chegou lá → falha + alerta de horário ainda ocupado na agenda externa', async () => {
    const provider = fakeProvider({
      cancelAppointment: vi.fn(async () => {
        throw new AgendaProviderError('503', 'belasis', 'unavailable')
      }),
    })
    const refs = memoryRefs({ ...LINKED, appointment: { [APPOINTMENT]: 'ext-appt-1' } })
    const { ctx, alerts } = makeCtx(provider, refs)

    const result = await cancelInAgenda(ctx, { appointmentId: APPOINTMENT })

    expect(result).toMatchObject({ ok: false, code: 'EXTERNAL_AGENDA_UNAVAILABLE' })
    expect(alerts.map((a) => a.type)).toEqual(['agenda_cancel_failed'])
  })
})

describe('inspectAgendaAppointment — a recepção mexeu lá? (a Belasis não tem webhook)', () => {
  const local = { appointmentId: APPOINTMENT, start: at('13:00'), end: at('14:00') }
  const linked = () => memoryRefs({ ...LINKED, appointment: { [APPOINTMENT]: 'ext-appt-1' } })

  it('não existe lá (anterior à conexão) → not_linked, sem chamar a API', async () => {
    const getAppointment = vi.fn()
    const { ctx } = makeCtx(fakeProvider({ getAppointment }))

    await expect(inspectAgendaAppointment(ctx, local)).resolves.toEqual({ state: 'not_linked' })
    expect(getAppointment).not.toHaveBeenCalled()
  })

  it('igual lá → same', async () => {
    const provider = fakeProvider({
      getAppointment: vi.fn(async () => ({ status: 'active' as const, start: at('13:00'), end: at('14:00') })),
    })
    const { ctx } = makeCtx(provider, linked())

    await expect(inspectAgendaAppointment(ctx, local)).resolves.toEqual({ state: 'same', remindedByProvider: false })
  })

  it('a agenda oficial já vai lembrar o cliente → avisa (o lembrete daqui não sai)', async () => {
    const provider = fakeProvider({
      getAppointment: vi.fn(async () => ({
        status: 'active' as const,
        start: at('13:00'),
        end: at('14:00'),
        remindedByProvider: true,
      })),
    })
    const { ctx } = makeCtx(provider, linked())

    await expect(inspectAgendaAppointment(ctx, local)).resolves.toEqual({ state: 'same', remindedByProvider: true })
  })

  it('cancelado ou apagado lá → cancelled', async () => {
    for (const remote of [null, { status: 'cancelled' as const, start: at('13:00'), end: at('14:00') }]) {
      const { ctx } = makeCtx(fakeProvider({ getAppointment: vi.fn(async () => remote) }), linked())
      await expect(inspectAgendaAppointment(ctx, local)).resolves.toEqual({ state: 'cancelled' })
    }
  })

  it('horário mudou lá → moved, com o horário de lá', async () => {
    const provider = fakeProvider({
      getAppointment: vi.fn(async () => ({ status: 'active' as const, start: at('15:00'), end: at('16:00') })),
    })
    const { ctx } = makeCtx(provider, linked())

    await expect(inspectAgendaAppointment(ctx, local)).resolves.toEqual({
      state: 'moved',
      start: at('15:00'),
      end: at('16:00'),
      remindedByProvider: false,
    })
  })

  it('agenda não responde → unknown (o lembrete segue como antes)', async () => {
    const provider = fakeProvider({
      getAppointment: vi.fn(async () => {
        throw new AgendaProviderError('timeout', 'belasis', 'unavailable')
      }),
    })
    const { ctx } = makeCtx(provider, linked())

    await expect(inspectAgendaAppointment(ctx, local)).resolves.toEqual({ state: 'unknown' })
  })
})

beforeEach(() => {
  vi.clearAllMocks()
})
