import { describe, it, expect, vi } from "vitest"

// O setup global troca @repo/db por mocks (sql = vi.fn()). Aqui precisamos do `sql`
// de verdade do Drizzle para renderizar a expressão.
vi.mock("@repo/db", async () => {
  const { sql } = await vi.importActual<typeof import("drizzle-orm")>("drizzle-orm")
  return { sql }
})

import { sql } from "drizzle-orm"
import { PgDialect } from "drizzle-orm/pg-core"
import { weightedCreditsSql } from "@/lib/utils/credits-sql"

/**
 * weightedCreditsSql é a versão SQL de calculateCredits, usada pelo cron stats-sync,
 * que SOBRESCREVE o saldo de créditos do salão. Se as duas contas divergirem, o
 * cron muda o saldo sem ninguém ter gastado nada.
 */

const render = (expr: ReturnType<typeof weightedCreditsSql>) => new PgDialect().sqlToQuery(expr).sql

describe("weightedCreditsSql", () => {
  it("com cache: trava o cache em [0, tokens] e conta em décimos, como o JS", () => {
    const q = render(weightedCreditsSql(sql`m.total_tokens`, sql`m.model`, sql`m.cached_tokens`))

    expect(q).toContain("LEAST(GREATEST(COALESCE(m.cached_tokens, 0), 0), m.total_tokens)")
    expect(q).toContain("* 10 +")
  })

  it("divide só depois do cast para numeric — inteiro / inteiro trunca no Postgres", () => {
    const q = render(weightedCreditsSql(sql`m.total_tokens`, sql`m.model`, sql`m.cached_tokens`))

    expect(q).toMatch(/::numeric \/ 10\)/)
    expect(q).not.toMatch(/\+ LEAST\(GREATEST\(COALESCE\(m\.cached_tokens, 0\), 0\), m\.total_tokens\)\) \/ 10/)
  })

  it("sem coluna de cache, o cache vale 0", () => {
    const q = render(weightedCreditsSql(sql`m.total_tokens`, sql`m.model`))

    expect(q).not.toContain("cached_tokens")
    expect(q).toContain("((m.total_tokens - 0) * 10 + 0)")
  })
})
