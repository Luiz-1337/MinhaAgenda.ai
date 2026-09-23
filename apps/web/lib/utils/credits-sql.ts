import { sql } from "@repo/db"
import type { SQL } from "drizzle-orm"
import type { AnyPgColumn } from "drizzle-orm/pg-core"
import { CACHED_TOKEN_DIVISOR, MODEL_WEIGHTS } from "./credits"

type SqlRef = SQL | AnyPgColumn

/**
 * Reproduz calculateCredits(tokens, model, cachedTokens) POR LINHA em SQL, para
 * agregar no banco sem mudar os números exibidos:
 *
 *   cache    = LEAST(GREATEST(COALESCE(cached, 0), 0), tokens)
 *   decimos  = (tokens - cache) * 10 + cache
 *   ROUND((decimos * peso)::numeric / 10)
 *
 * O cast ::numeric é obrigatório — ROUND(numeric) arredonda "half away from
 * zero" (= Math.round para positivos); ROUND(float8) usa half-to-even e
 * divergiria em todo .5. E a divisão só depois do cast: inteiro / inteiro no
 * Postgres trunca. lower(btrim(COALESCE(model,''))) espelha o trim().toLowerCase()
 * de getModelWeight, com NULL caindo no ELSE (peso 1.0). Sem `cachedTokens`, o
 * cache vale 0 e a conta volta a ser ROUND(tokens * peso).
 */
export function weightedCreditsSql(tokens: SqlRef, model: SqlRef, cachedTokens?: SqlRef): SQL<number> {
  const cached = cachedTokens ? sql`LEAST(GREATEST(COALESCE(${cachedTokens}, 0), 0), ${tokens})` : sql`0`
  // sql.raw no divisor e no peso é seguro: constantes de código, nunca entrada do usuário.
  const divisor = sql.raw(String(CACHED_TOKEN_DIVISOR))
  const billableTenths = sql`((${tokens} - ${cached}) * ${divisor} + ${cached})`
  const branches = Object.entries(MODEL_WEIGHTS).map(
    ([name, weight]) =>
      sql` WHEN ${name} THEN ROUND((${billableTenths} * ${sql.raw(String(weight))})::numeric / ${divisor})`
  )
  return sql`(CASE lower(btrim(COALESCE(${model}, '')))${sql.join(branches, sql``)} ELSE ROUND((${billableTenths})::numeric / ${divisor}) END)`
}
