/**
 * Utilitários de fuso horário (Brasília).
 *
 * Este arquivo era uma CÓPIA quase idêntica de
 * `packages/db/src/utils/timezone.utils.ts` — as 107 primeiras linhas eram byte a
 * byte as mesmas, mais quatro funções extras no fim. Duas fontes da verdade para
 * conversão de fuso, num sistema onde todo timestamp é gravado em UTC e exibido em
 * Brasília: corrigir um bug numa cópia e não na outra é questão de tempo.
 *
 * Agora reexporta a fonte única e mantém APENAS o que é exclusivo daqui.
 *
 * Deep path `@repo/db/src/utils/...` e não `@repo/db`: o barrel do @repo/db só
 * reexporta um subconjunto (faltam startOfDayBrazil, startOfMonthBrazil e as outras
 * funções de janela), e o deep path também resolve no grafo do worker, que roda via
 * tsx — precedente comprovado em `lib/services/ai/generate-response.service.ts`.
 */
export {
  BRAZIL_TIMEZONE,
  toBrazilTime,
  fromBrazilTime,
  getBrazilNow,
  formatBrazilTime,
  startOfDayBrazil,
  endOfDayBrazil,
  startOfWeekBrazil,
  endOfWeekBrazil,
  startOfMonthBrazil,
  endOfMonthBrazil,
} from "@repo/db/src/utils/timezone.utils"

import { toZonedTime } from "date-fns-tz"
import { BRAZIL_TIMEZONE as TZ } from "@repo/db/src/utils/timezone.utils"

/**
 * Obtém a hora no timezone de Brasília (0-23)
 */
export function getBrazilHours(date: Date | string): number {
  const dateObj = typeof date === "string" ? new Date(date) : date
  return toZonedTime(dateObj, TZ).getHours()
}

/**
 * Obtém os minutos no timezone de Brasília (0-59)
 */
export function getBrazilMinutes(date: Date | string): number {
  const dateObj = typeof date === "string" ? new Date(date) : date
  return toZonedTime(dateObj, TZ).getMinutes()
}

/**
 * Obtém o dia do mês no timezone de Brasília (1-31)
 */
export function getBrazilDate(date: Date | string): number {
  const dateObj = typeof date === "string" ? new Date(date) : date
  return toZonedTime(dateObj, TZ).getDate()
}

/**
 * Obtém o dia da semana no timezone de Brasília (0 = domingo, 6 = sábado)
 */
export function getBrazilDay(date: Date | string): number {
  const dateObj = typeof date === "string" ? new Date(date) : date
  return toZonedTime(dateObj, TZ).getDay()
}
