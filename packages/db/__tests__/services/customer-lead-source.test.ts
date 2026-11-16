import { describe, expect, it } from 'vitest'
import { PgDialect } from 'drizzle-orm/pg-core'

/** O serviço importa o barrel (para o banco); aqui só a condição do UPDATE é exercitada. */
process.env.DATABASE_URL ||= 'postgres://test:test@localhost:5432/test'

const { leadSourceMayBecome } = await import('../../src/services/customer-lead-source.service')

/**
 * Origem do lead no cliente (customers.lead_source): tráfego pago × orgânico.
 *
 * A marca só SOBE. Toda mensagem depois da primeira chega sem o dado do anúncio
 * — se "sem anúncio" pudesse regravar, a cliente que veio de tráfego viraria
 * orgânica na segunda mensagem, e o agendamento sairia sem a marca.
 */
const render = (source: 'paid_traffic' | 'organic') => new PgDialect().sqlToQuery(leadSourceMayBecome(source))

describe('leadSourceMayBecome — em que linhas a marca pode mudar', () => {
  it('para orgânico: só quem ainda não tem marca (tráfego NUNCA volta a orgânico)', () => {
    const { sql, params } = render('organic')

    expect(sql).toBe('"customers"."lead_source" is null')
    expect(params).toEqual([])
  })

  it('para tráfego pago: quem está sem marca ou é orgânico (clicou num anúncio depois)', () => {
    const { sql } = render('paid_traffic')

    expect(sql).toBe(`("customers"."lead_source" is null or "customers"."lead_source" <> 'paid_traffic')`)
  })

  it('quem já é tráfego não é regravado a cada mensagem', () => {
    // A condição exclui a linha que já tem o valor: o UPDATE não encontra o que mudar.
    expect(render('paid_traffic').sql).toContain(`<> 'paid_traffic'`)
  })
})
