import { describe, expect, it } from 'vitest'

/** O serviço importa o barrel (para o banco); aqui só as funções puras são exercitadas. */
process.env.DATABASE_URL ||= 'postgres://test:test@localhost:5432/test'

const { canonicalCustomerPhone, pickCustomerByPhone } = await import('../../src/services/customer-phone.service')

/**
 * Um cliente por telefone, em qualquer formato.
 *
 * Os formatos abaixo são os que estavam no banco em 12/nov/2026 (Spettacolo
 * Salone): o contato do painel sem o DDI — às vezes sem o 9 — e o do WhatsApp
 * com DDI. Eram a mesma pessoa em dois cadastros: o do painel com o agendamento,
 * o do WhatsApp com a conversa, e a IA sem enxergar o agendamento. Os números
 * em si são fictícios.
 */

const at = (iso: string) => new Date(iso)

describe('canonicalCustomerPhone — o telefone como deve ser gravado', () => {
  it.each([
    ['11900002222', '5511900002222'], // painel, sem DDI
    ['(11) 90000-2222', '5511900002222'], // painel, formatado
    ['+55 11 90000-2222', '5511900002222'],
    ['5511900002222', '5511900002222'], // já como o WhatsApp entrega
    ['3190003344', '553190003344'], // sem DDI e sem o 9
    ['553190003344', '553190003344'],
  ])('%s → %s', (raw, expected) => {
    expect(canonicalCustomerPhone(raw)).toBe(expected)
  })

  it('o que não é telefone brasileiro reconhecível fica só com os dígitos', () => {
    expect(canonicalCustomerPhone('100000000000001')).toBe('100000000000001') // id interno do WhatsApp
    expect(canonicalCustomerPhone('web-abc')).toBe('')
    expect(canonicalCustomerPhone('12345')).toBe('12345')
  })
})

describe('pickCustomerByPhone — o cadastro que é deste telefone', () => {
  const painel = { id: 'painel', phone: '11900002222', createdAt: at('2026-10-29T14:00:40Z') }
  const whatsapp = { id: 'whatsapp', phone: '5511900002222', createdAt: at('2026-11-06T17:57:14Z') }

  it('caso real: contato do painel sem o 55 é a mesma pessoa que escreve pelo WhatsApp', () => {
    expect(pickCustomerByPhone([painel], '5511900002222')?.id).toBe('painel')
  })

  it('caso real: sem o DDI e sem o 9 no painel, com DDI e sem o 9 no WhatsApp', () => {
    const semNove = { id: 'sem-nove', phone: '3190003344', createdAt: at('2026-10-29T13:59:25Z') }

    expect(pickCustomerByPhone([semNove], '553190003344')?.id).toBe('sem-nove')
    // O WhatsApp às vezes entrega com o 9: continua a mesma pessoa.
    expect(pickCustomerByPhone([semNove], '5531990003344')?.id).toBe('sem-nove')
  })

  it('formatado no banco ("(11) 90000-2222") também casa', () => {
    const formatado = { id: 'formatado', phone: '(11) 90000-2222' }

    expect(pickCustomerByPhone([formatado], '5511900002222')?.id).toBe('formatado')
  })

  it('o caminho inverso: o painel cadastrando quem já escreveu pelo WhatsApp', () => {
    expect(pickCustomerByPhone([whatsapp], '(11) 90000-2222')?.id).toBe('whatsapp')
  })

  it('mesmo final, outro DDD → é outra pessoa', () => {
    const outroDdd = { id: 'outro', phone: '5521900002222' }

    expect(pickCustomerByPhone([outroDdd], '5511900002222')).toBeNull()
  })

  it('mesmos 8 últimos dígitos só de passagem (número diferente) → não casa', () => {
    const vizinho = { id: 'vizinho', phone: '5511900002223' }

    expect(pickCustomerByPhone([vizinho], '5511900002222')).toBeNull()
  })

  it('duplicados que já existem: fica o que tem o número idêntico', () => {
    expect(pickCustomerByPhone([painel, whatsapp], '5511900002222')?.id).toBe('whatsapp')
    expect(pickCustomerByPhone([whatsapp, painel], '11900002222')?.id).toBe('painel')
  })

  it('nenhum idêntico: prefere o que já está no formato do WhatsApp, depois o mais antigo', () => {
    const comNove = { id: 'com-nove', phone: '5531990003344', createdAt: at('2026-11-06T13:41:24Z') }
    const semDdi = { id: 'sem-ddi', phone: '3190003344', createdAt: at('2026-10-29T13:59:25Z') }
    const semDdiNovo = { id: 'sem-ddi-novo', phone: '(31) 9000-3344', createdAt: at('2026-11-10T10:00:00Z') }

    expect(pickCustomerByPhone([semDdi, comNove], '553190003344')?.id).toBe('com-nove')
    expect(pickCustomerByPhone([semDdiNovo, semDdi], '553190003344')?.id).toBe('sem-ddi')
  })

  it('id interno do WhatsApp (não é telefone): só casa com o texto idêntico', () => {
    const lid = { id: 'lid', phone: '100000000000001' }

    expect(pickCustomerByPhone([lid], '100000000000001')?.id).toBe('lid')
    expect(pickCustomerByPhone([lid], '100000000000002')).toBeNull()
  })

  it('ninguém com esse telefone → null', () => {
    expect(pickCustomerByPhone([], '5511900002222')).toBeNull()
    expect(pickCustomerByPhone([{ id: 'x', phone: '5511911112222' }], '5511900002222')).toBeNull()
  })
})
