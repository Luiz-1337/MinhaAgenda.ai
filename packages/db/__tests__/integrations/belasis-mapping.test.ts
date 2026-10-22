import { describe, expect, it } from 'vitest'

import {
  belasisObservation,
  belasisReferenceMarker,
  freeTimesToBusyIntervals,
  fromBelasisWallClock,
  inferSlotMinutes,
  localDatesBetween,
  phoneMatchKey,
  phonesMatch,
  toBelasisPhone,
  toBelasisWallClock,
} from '../../src/infrastructure/integrations/belasis/belasis-mapping'
import type { BelasisFreeTime } from '../../src/infrastructure/integrations/belasis/belasis-types'

const iso = (d: Date) => d.toISOString()

describe('hora de parede (a API não manda fuso; tratamos como Brasília, UTC-3)', () => {
  it('instante UTC → data e HH:MM de Brasília', () => {
    expect(
      toBelasisWallClock(new Date('2026-11-10T13:00:00.000Z'), new Date('2026-11-10T14:30:00.000Z'))
    ).toEqual({ date: '2026-11-10', startHour: '10:00', endHour: '11:30' })
  })

  it('a data é a de Brasília, não a de UTC (01:30Z ainda é o dia anterior aqui)', () => {
    expect(
      toBelasisWallClock(new Date('2026-11-11T01:30:00.000Z'), new Date('2026-11-11T02:00:00.000Z'))
    ).toEqual({ date: '2026-11-10', startHour: '22:30', endHour: '23:00' })
  })

  it('atravessar a meia-noite é recusado (a API só tem uma data por agendamento)', () => {
    expect(() =>
      toBelasisWallClock(new Date('2026-11-11T02:30:00.000Z'), new Date('2026-11-11T03:30:00.000Z'))
    ).toThrow(/meia-noite/)
  })

  it('volta: data + HH:MM → instante UTC', () => {
    expect(iso(fromBelasisWallClock('2026-11-10', '10:00'))).toBe('2026-11-10T13:00:00.000Z')
  })

  it('formato fora do documentado → erro, não um horário inventado', () => {
    expect(() => fromBelasisWallClock('10/11/2026', '10:00')).toThrow()
    expect(() => fromBelasisWallClock('2026-11-10', '10h')).toThrow()
  })

  it('datas locais tocadas por um dia de Brasília inteiro = uma só', () => {
    expect(
      localDatesBetween(new Date('2026-11-10T03:00:00.000Z'), new Date('2026-11-11T02:59:59.999Z'))
    ).toEqual(['2026-11-10'])
  })

  it('intervalo que passa da meia-noite local toca dois dias', () => {
    expect(
      localDatesBetween(new Date('2026-11-10T20:00:00.000Z'), new Date('2026-11-11T05:00:00.000Z'))
    ).toEqual(['2026-11-10', '2026-11-11'])
  })
})

describe('free_times → ocupado (só o que a Belasis marca como livre está livre)', () => {
  const grid = (entries: Array<[string, 'available' | 'unavailable']>): BelasisFreeTime[] =>
    entries.map(([hour, label]) => ({ hour, label }))

  it('infere o passo da grade pelo intervalo mais comum', () => {
    expect(inferSlotMinutes(grid([['08:00', 'available'], ['08:30', 'available'], ['09:00', 'available']]))).toBe(30)
    expect(inferSlotMinutes(grid([['08:00', 'available'], ['08:15', 'available'], ['08:30', 'available']]))).toBe(15)
    expect(inferSlotMinutes(grid([['08:00', 'available']]))).toBe(30)
  })

  it('antes do primeiro horário, os indisponíveis e depois do último → ocupados', () => {
    const busy = freeTimesToBusyIntervals(
      grid([
        ['09:00', 'available'],
        ['09:30', 'unavailable'],
        ['10:00', 'available'],
        ['10:30', 'available'],
      ]),
      '2026-11-10'
    )

    expect(busy.map((b) => [iso(b.start), iso(b.end)])).toEqual([
      // meia-noite → 09:00 (fora do expediente que ela listou)
      ['2026-11-10T03:00:00.000Z', '2026-11-10T12:00:00.000Z'],
      // 09:30 indisponível
      ['2026-11-10T12:30:00.000Z', '2026-11-10T13:00:00.000Z'],
      // depois de 10:30 + 30min → fim do dia
      ['2026-11-10T14:00:00.000Z', '2026-11-11T03:00:00.000Z'],
    ])
  })

  it('buraco na grade (horário que nem aparece, ex.: almoço) também é ocupado', () => {
    const busy = freeTimesToBusyIntervals(
      grid([
        ['11:00', 'available'],
        ['11:30', 'available'],
        ['13:00', 'available'],
        ['13:30', 'available'],
      ]),
      '2026-11-10'
    )

    expect(busy.some((b) => iso(b.start) === '2026-11-10T15:00:00.000Z' && iso(b.end) === '2026-11-10T16:00:00.000Z')).toBe(true)
  })

  it('dia sem nenhum horário (folga) → o dia inteiro ocupado', () => {
    const busy = freeTimesToBusyIntervals([], '2026-11-10')

    expect(busy.map((b) => [iso(b.start), iso(b.end)])).toEqual([
      ['2026-11-10T03:00:00.000Z', '2026-11-11T03:00:00.000Z'],
    ])
  })

  it('alsoFree: o horário do próprio agendamento sendo remarcado conta como livre', () => {
    const busy = freeTimesToBusyIntervals(
      grid([
        ['09:00', 'available'],
        ['09:30', 'unavailable'],
        ['10:00', 'unavailable'],
        ['10:30', 'available'],
      ]),
      '2026-11-10',
      undefined,
      { alsoFree: [{ start: new Date('2026-11-10T12:30:00.000Z'), end: new Date('2026-11-10T13:30:00.000Z') }] }
    )

    // 09:30–10:30 eram do próprio agendamento: o meio do dia fica todo livre.
    expect(busy.map((b) => [iso(b.start), iso(b.end)])).toEqual([
      ['2026-11-10T03:00:00.000Z', '2026-11-10T12:00:00.000Z'],
      ['2026-11-10T14:00:00.000Z', '2026-11-11T03:00:00.000Z'],
    ])
  })

  it('rótulo desconhecido conta como ocupado', () => {
    const busy = freeTimesToBusyIntervals(
      [{ hour: '09:00', label: 'talvez' as unknown as 'available' }],
      '2026-11-10'
    )
    expect(busy).toHaveLength(1)
  })
})

describe('telefone', () => {
  it.each([
    ['5547991054646', '5547991054646'], // já no formato
    ['+55 (47) 99105-4646', '5547991054646'], // formatado
    ['47991054646', '5547991054646'], // sem DDI → 55
    ['4733445566', '554733445566'], // fixo sem DDI
    ['554791054646', '554791054646'], // WhatsApp sem o 9
    ['351912345678', '351912345678'], // estrangeiro com DDI
  ])('toBelasisPhone(%j) → %j', (raw, expected) => {
    expect(toBelasisPhone(raw)).toBe(expected)
  })

  it.each([
    ['136784245694524'], // id interno do WhatsApp (LID), não é telefone
    ['12345'],
    [''],
  ])('toBelasisPhone(%j) → null (não cadastra lixo na Belasis)', (raw) => {
    expect(toBelasisPhone(raw)).toBeNull()
  })

  it('casa o mesmo número em formatos diferentes, inclusive sem o 9 e sem DDI', () => {
    expect(phonesMatch('5547991054646', '(47) 99105-4646')).toBe(true)
    expect(phonesMatch('5547991054646', '47991054646')).toBe(true)
    expect(phonesMatch('554791054646', '5547991054646')).toBe(true)
  })

  it('DDD diferente com o mesmo final não casa', () => {
    expect(phonesMatch('5547991054646', '5511991054646')).toBe(false)
  })

  it('sem DDD não dá para casar', () => {
    expect(phoneMatchKey('91054646')).toBeNull()
    expect(phonesMatch('91054646', '91054646')).toBe(false)
  })
})

describe('referência do agendamento local na observação', () => {
  const key = '00000000-0000-4000-8000-0000000000d1'

  it('sem nota: só a assinatura com a referência', () => {
    expect(belasisObservation(undefined, key)).toBe(`Agendado pelo MinhaAgenda ${belasisReferenceMarker(key)}`)
  })

  it('com nota: a nota primeiro, a referência no fim', () => {
    const observation = belasisObservation('  Prefere secador frio ', key)
    expect(observation.startsWith('Prefere secador frio')).toBe(true)
    expect(observation).toContain(belasisReferenceMarker(key))
  })
})
