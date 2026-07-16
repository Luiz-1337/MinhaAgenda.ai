import { sql } from "@repo/db"
import type { SQL } from "drizzle-orm"
import type { AnyPgColumn } from "drizzle-orm/pg-core"
import { MODEL_WEIGHTS } from "./credits"

type SqlRef = SQL | AnyPgColumn

/**
 * Reproduz calculateCredits(tokens, model) POR LINHA em SQL, para agregar no
 * banco sem mudar os números exibidos:
 *
 *   ROUND((tokens * peso)::numeric)
 *
 * O cast ::numeric é obrigatório — ROUND(numeric) arredonda "half away from
 * zero" (= Math.round para positivos); ROUND(float8) usa half-to-even e
 * divergiria em todo .5. lower(btrim(COALESCE(model,''))) espelha o
 * trim().toLowerCase() de getModelWeight, com NULL caindo no ELSE (peso 1.0).
 */
export function weightedCreditsSql(tokens: SqlRef, model: SqlRef): SQL<number> {
  const branches = Object.entries(MODEL_WEIGHTS).map(
    ([name, weight]) =>
      // sql.raw no peso é seguro: constante de código, nunca entrada do usuário.
      sql` WHEN ${name} THEN ROUND((${tokens} * ${sql.raw(String(weight))})::numeric)`
  )
  return sql`(CASE lower(btrim(COALESCE(${model}, '')))${sql.join(branches, sql``)} ELSE (${tokens})::numeric END)`
}
