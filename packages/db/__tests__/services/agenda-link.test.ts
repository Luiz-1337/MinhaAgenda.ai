import { describe, expect, it } from 'vitest'

import { normalizeForMatch, suggestLinks } from '../../src/utils/agenda-link.utils'

const ext = (pairs: Array<[string, string]>) => pairs.map(([externalId, name]) => ({ externalId, name }))

describe('suggestLinks — sugestão de vínculo pelo nome', () => {
  it('normaliza acento, caixa e pontuação', () => {
    expect(normalizeForMatch('  Escova Progressiva (Longo) ')).toBe('escova progressiva longo')
    expect(normalizeForMatch('Manicure & Pedicure')).toBe('manicure pedicure')
    expect(normalizeForMatch('Coloração')).toBe('coloracao')
  })

  it('nome igual (sem acento/caixa) casa', () => {
    const result = suggestLinks([{ id: 'a', name: 'Coloração' }], ext([['10', 'COLORACAO'], ['11', 'Corte']]))
    expect(result.get('a')).toBe('10')
  })

  it('um único externo que contém o nome local casa', () => {
    const result = suggestLinks([{ id: 'a', name: 'Corte' }], ext([['10', 'Corte Feminino'], ['11', 'Escova']]))
    expect(result.get('a')).toBe('10')
  })

  it('ambíguo não vira sugestão', () => {
    const result = suggestLinks([{ id: 'a', name: 'Corte' }], ext([['10', 'Corte Feminino'], ['11', 'Corte Masculino']]))
    expect(result.has('a')).toBe(false)
  })

  it('o nome exato ganha da contenção, e o mesmo externo não é sugerido duas vezes', () => {
    const result = suggestLinks(
      [
        { id: 'a', name: 'Corte Feminino' },
        { id: 'b', name: 'Corte' },
      ],
      ext([['10', 'Corte Feminino']])
    )
    expect(result.get('a')).toBe('10')
    expect(result.has('b')).toBe(false)
  })

  it('pessoas: primeiro nome único casa (matchFirstName)', () => {
    const local = [{ id: 'a', name: 'Ana Paula' }]
    const external = ext([['7', 'Ana Souza'], ['8', 'Bruna']])
    expect(suggestLinks(local, external).has('a')).toBe(false)
    expect(suggestLinks(local, external, { matchFirstName: true }).get('a')).toBe('7')
  })

  it('externos já vinculados ficam de fora', () => {
    const result = suggestLinks([{ id: 'a', name: 'Escova' }], ext([['10', 'Escova']]), { taken: ['10'] })
    expect(result.has('a')).toBe(false)
  })
})
