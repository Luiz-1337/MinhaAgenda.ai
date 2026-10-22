import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  normalizePastedToken,
  openAgendaCredentials,
  sealAgendaCredentials,
} from '../../src/infrastructure/integrations/agenda/agenda-credentials'

const KEY_A = 'chave-de-teste-com-entropia-suficiente-A'
const KEY_B = 'chave-de-teste-com-entropia-suficiente-B'

describe('credencial da agenda oficial em repouso', () => {
  let previousKey: string | undefined

  beforeEach(() => {
    previousKey = process.env.ENCRYPTION_KEY
    process.env.ENCRYPTION_KEY = KEY_A
  })

  afterEach(() => {
    if (previousKey === undefined) delete process.env.ENCRYPTION_KEY
    else process.env.ENCRYPTION_KEY = previousKey
  })

  it('ida e volta preserva token, conta e nome', () => {
    const sealed = sealAgendaCredentials({ token: 'tok-123', accountId: '42', accountName: 'Studio Liz' })

    expect(openAgendaCredentials(sealed)).toEqual({ token: 'tok-123', accountId: '42', accountName: 'Studio Liz' })
  })

  it('o que vai para o banco não contém o token em claro', () => {
    const sealed = sealAgendaCredentials({ token: 'segredo-muito-especifico' })

    expect(sealed.startsWith('v1:')).toBe(true)
    expect(sealed).not.toContain('segredo-muito-especifico')
  })

  it('duas cifras do mesmo token são diferentes (IV aleatório)', () => {
    expect(sealAgendaCredentials({ token: 'tok' })).not.toBe(sealAgendaCredentials({ token: 'tok' }))
  })

  it('ENCRYPTION_KEY trocada → não abre (lança, não devolve lixo)', () => {
    const sealed = sealAgendaCredentials({ token: 'tok-123' })
    process.env.ENCRYPTION_KEY = KEY_B

    expect(() => openAgendaCredentials(sealed)).toThrow()
  })

  it('token vazio não é guardado', () => {
    expect(() => sealAgendaCredentials({ token: '' })).toThrow()
  })
})

describe('normalizePastedToken — colar errado não pode virar "token inválido"', () => {
  it.each([
    ['  abc123  ', 'abc123'],
    ['"abc123"', 'abc123'],
    ["'abc123'", 'abc123'],
    ['Bearer abc123', 'abc123'],
    ['bearer   abc123', 'abc123'],
    ['abc\n123', 'abc123'],
    ['abc123', 'abc123'],
  ])('%j → %j', (raw, expected) => {
    expect(normalizePastedToken(raw)).toBe(expected)
  })
})
