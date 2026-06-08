/**
 * Factory para criação da tool de serviços (APPLICATION LAYER)
 */

import { z } from "zod"
import {
  db,
  services,
  and,
  eq,
  formatWeekdaysPtBr,
  parseAllowedWeekdays,
  parseAllowedStartTimes,
  getBlockingDuration,
} from "@repo/db"
import type { ToolDefinition } from "./tool-definition"

export class ServicesToolFactory {
  /**
   * Cria tool para buscar serviços do salão
   */
  static create(salonId: string): ToolDefinition {
    return {
      description: "Lista os serviços disponíveis no salão com preços, duração e regras de agenda (dias/horários, sob avaliação).",
      inputSchema: z.object({}),
      execute: async () => {
        const rows = await db
          .select({
            name: services.name,
            description: services.description,
            duration: services.duration,
            durationMax: services.durationMax,
            price: services.price,
            priceType: services.priceType,
            priceMin: services.priceMin,
            priceMax: services.priceMax,
            priceOnRequest: services.priceOnRequest,
            allowedWeekdays: services.allowedWeekdays,
            allowedStartTimes: services.allowedStartTimes,
          })
          .from(services)
          .where(and(eq(services.salonId, salonId), eq(services.isActive, true)))

        const fmtBRL = (v: string | number) =>
          new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(v))

        const result = rows.map((s) => {
          const allowedWeekdays = parseAllowedWeekdays(s.allowedWeekdays)
          const allowedStartTimes = parseAllowedStartTimes(s.allowedStartTimes)
          const precoInfo = s.priceOnRequest
            ? "Sob avaliação"
            : s.priceType === "range" && s.priceMin && s.priceMax
              ? `${fmtBRL(s.priceMin)} a ${fmtBRL(s.priceMax)}`
              : fmtBRL(s.price)
          const duracaoInfo =
            s.durationMax && s.durationMax > s.duration
              ? `${s.duration} a ${s.durationMax} min`
              : `${s.duration} min`

          return {
            name: s.name,
            description: s.description,
            // Duração de bloqueio (reserva o maior da faixa), mantida para compat.
            duration: getBlockingDuration(s.duration, s.durationMax ?? null),
            duracaoInfo,
            precoInfo,
            ...(s.priceOnRequest ? { precoSobAvaliacao: true } : {}),
            ...(allowedWeekdays ? { diasAtendimento: formatWeekdaysPtBr(allowedWeekdays) } : {}),
            ...(allowedStartTimes ? { horariosDeInicio: allowedStartTimes } : {}),
          }
        })

        return {
          services: result,
          _instrucao:
            "Informe nome, preço (precoInfo) e duração (duracaoInfo). Se precoSobAvaliacao=true, diga que o valor é sob avaliação (não invente preço) e ainda assim ofereça agendar. " +
            "Se houver diasAtendimento/horariosDeInicio, o serviço só pode ser agendado nesses dias/horários — confirme com checkAvailability, que já respeita essas regras.",
        }
      },
    }
  }
}
