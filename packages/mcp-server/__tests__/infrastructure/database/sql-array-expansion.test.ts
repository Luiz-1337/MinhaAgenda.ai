import { describe, it, expect } from "vitest"
import { sql, inArray, and, isNull } from "drizzle-orm"
import { PgDialect } from "drizzle-orm/pg-core"
// Importa o schema pelo caminho do fonte, não pelo barrel `@repo/db`: o barrel é
// mockado globalmente em __tests__/setup/vitest.setup.ts (e exige DATABASE_URL para
// carregar de verdade). schema.ts é puro — só declarações pgTable.
import { customers } from "../../../../db/src/schema"

/**
 * Guarda de regressão do bug de opt-out (26/jul).
 *
 * O template `sql` do drizzle NÃO passa um array JS como um único parâmetro:
 * ele EXPANDE o array em `($1, $2, ...)`. Em Postgres isso é um row constructor,
 * então `= ANY(${ids}::uuid[])` gera `= ANY(($1, $2)::uuid[])` e explode com
 * "cannot cast type record to uuid[]" — exatamente quando existem duplicatas,
 * que é o caso que markOptOut() existe para tratar (mesmo humano em várias linhas
 * de customers com formatos de telefone diferentes).
 *
 * Estes testes fixam o comportamento do drizzle (não é opinião nossa) e provam
 * que a forma usada em DrizzleRetentionRepository.markOptOut é a segura.
 */
describe("drizzle sql template: expansão de array", () => {
  const dialect = new PgDialect()
  const ids = [
    "11111111-1111-1111-1111-111111111111",
    "22222222-2222-2222-2222-222222222222",
  ]

  it("expande array em row constructor — por isso `= ANY(${ids}::uuid[])` é inválido", () => {
    const query = dialect.sqlToQuery(sql`WHERE id = ANY(${ids}::uuid[])`)

    // O array virou DOIS placeholders entre parênteses, não um parâmetro só.
    expect(query.sql).toBe("WHERE id = ANY(($1, $2)::uuid[])")
    expect(query.params).toEqual(ids)
  })

  it("um único id esconde o bug: os parênteses ficam inócuos", () => {
    const query = dialect.sqlToQuery(sql`WHERE id = ANY(${[ids[0]]}::uuid[])`)

    expect(query.sql).toBe("WHERE id = ANY(($1)::uuid[])")
    expect(query.params).toEqual([ids[0]])
  })

  it("inArray gera `in ($1, $2)` — válido com qualquer quantidade de ids", () => {
    const query = dialect.sqlToQuery(inArray(customers.id, ids))

    expect(query.sql).toContain('"customers"."id" in ($1, $2)')
    expect(query.sql).not.toContain("::uuid[]")
    expect(query.params).toEqual(ids)
  })

  it("predicado do markOptOut: inArray + opted_out_at IS NULL", () => {
    const query = dialect.sqlToQuery(
      and(inArray(customers.id, ids), isNull(customers.optedOutAt))!
    )

    expect(query.sql).toContain('"customers"."id" in ($1, $2)')
    expect(query.sql).toContain('"customers"."opted_out_at" is null')
    expect(query.params).toEqual(ids)
  })
})
