/**
 * AvailabilityTools - Operações relacionadas a disponibilidade
 *
 * Responsabilidades:
 * - Verificar horários disponíveis
 * - Consultar regras de disponibilidade de profissionais
 */

import { and, asc, eq, ilike } from "drizzle-orm"
import { db, domainServices as sharedServices, fromBrazilTime, professionals, profiles, salons, services, availability } from "@repo/db"
import { getActiveIntegrations } from "../utils"
import { ensureIsoWithTimezone } from "../utils/date-format.utils"

const DAY_NAMES = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"] as const

export class AvailabilityTools {
    /**
     * Verifica horários disponíveis para agendamento.
     * Inclui pré-checks: data normalizada, data passada, dia da semana,
     * profissional trabalha no dia, e mensagens de diagnóstico.
     */
    async checkAvailability(
        salonId: string,
        date: string,
        professionalId?: string,
        serviceId?: string,
        serviceDuration?: number
    ): Promise<string> {
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/ac7031ef-f4cf-4a4b-a2e4-8f976eb78084',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'availability.tools.ts:checkAvailability:entry',message:'checkAvailability entry',data:{salonId,date,professionalId,serviceId,serviceDuration},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'A,B,D'})}).catch(()=>{});
        // #endregion
        if (!professionalId?.trim()) {
            throw new Error("professionalId é obrigatório para verificar disponibilidade")
        }

        // 1. Normalizar data (ISO com timezone)
        const normalizedDate = ensureIsoWithTimezone(date)
        const requestedDate = new Date(normalizedDate)
        const now = new Date()

        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/ac7031ef-f4cf-4a4b-a2e4-8f976eb78084',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'availability.tools.ts:afterNorm',message:'after normalize',data:{normalizedDate,requestedDateIso:requestedDate.toISOString(),nowIso:now.toISOString(),isPast:requestedDate<now},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'A,D'})}).catch(()=>{});
        // #endregion

        if (Number.isNaN(requestedDate.getTime())) {
            return JSON.stringify({
                slots: [],
                totalAvailable: 0,
                message: "Data inválida.",
                error: "INVALID_DATE",
            })
        }

        // 2. Data passada
        if (requestedDate < now) {
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/ac7031ef-f4cf-4a4b-a2e4-8f976eb78084',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'availability.tools.ts:return:PAST_DATE',message:'early return PAST_DATE',data:{},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'D'})}).catch(()=>{});
            // #endregion
            return JSON.stringify({
                slots: [],
                totalAvailable: 0,
                message: `Horário solicitado já passou. Solicitado: ${requestedDate.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}`,
                error: "PAST_DATE",
                debug: { requested: normalizedDate, now: now.toISOString() },
            })
        }

        // 3. Dia da semana em Brasília
        const dayOfWeek = fromBrazilTime(requestedDate).getDay()

        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/ac7031ef-f4cf-4a4b-a2e4-8f976eb78084',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'availability.tools.ts:dayOfWeek',message:'dayOfWeek',data:{dayOfWeek},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'A,B'})}).catch(()=>{});
        // #endregion

        // 4. Profissional trabalha neste dia?
        const professionalAvailability = await db.query.availability.findFirst({
            where: and(
                eq(availability.professionalId, professionalId),
                eq(availability.dayOfWeek, dayOfWeek),
                eq(availability.isBreak, false)
            ),
            columns: { id: true, startTime: true, endTime: true },
        })

        /** Em salão SOLO, quando não há regras em availability, usamos salons.workHours. Usado na mensagem final se slots.length===0. */
        let workHoursFallback: { startTime: string; endTime: string } | undefined

        if (!professionalAvailability) {
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/ac7031ef-f4cf-4a4b-a2e4-8f976eb78084',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'availability.tools.ts:noProfessionalAvail',message:'professionalAvailability is null',data:{professionalId,dayOfWeek},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'B,D'})}).catch(()=>{});
            // #endregion
            const workDays = await db
                .selectDistinct({ day: availability.dayOfWeek })
                .from(availability)
                .where(and(eq(availability.professionalId, professionalId), eq(availability.isBreak, false)))

            if (workDays.length > 0) {
                const availableDays = workDays.map((d) => DAY_NAMES[d.day] ?? `Dia ${d.day}`).join(", ")
                // #region agent log
                fetch('http://127.0.0.1:7242/ingest/ac7031ef-f4cf-4a4b-a2e4-8f976eb78084',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'availability.tools.ts:return:PROFESSIONAL_NOT_AVAILABLE_THIS_DAY',message:'early return PROFESSIONAL_NOT_AVAILABLE_THIS_DAY',data:{dayOfWeek,workDays:workDays.map(d=>d.day)},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'D'})}).catch(()=>{});
                // #endregion
                return JSON.stringify({
                    slots: [],
                    totalAvailable: 0,
                    message: `Profissional não trabalha ${DAY_NAMES[dayOfWeek] ?? `dia ${dayOfWeek}`}. Dias disponíveis: ${availableDays}.`,
                    error: "PROFESSIONAL_NOT_AVAILABLE_THIS_DAY",
                    debug: { dayOfWeek, availableDays: workDays.map((d) => d.day) },
                })
            }

            // workDays.length === 0: em SOLO, tentar salons.workHours como fallback para o dono
            const salon = await db.query.salons.findFirst({
                where: eq(salons.id, salonId),
                columns: { ownerId: true, workHours: true },
            })
            const prof = salon?.ownerId
                ? await db.query.professionals.findFirst({
                    where: eq(professionals.id, professionalId),
                    columns: { userId: true },
                })
                : null
            const ownerProfile = salon?.ownerId
                ? await db.query.profiles.findFirst({
                    where: eq(profiles.id, salon.ownerId),
                    columns: { tier: true },
                })
                : null
            const wh = (salon?.workHours as Record<string, { start?: string; end?: string }> | null | undefined) ?? {}
            const dayHours = typeof wh === "object" && wh !== null ? wh[String(dayOfWeek)] : undefined

            if (
                ownerProfile?.tier === "SOLO" &&
                prof?.userId === salon?.ownerId &&
                dayHours?.start &&
                dayHours?.end
            ) {
                workHoursFallback = { startTime: dayHours.start, endTime: dayHours.end }
                // #region agent log
                fetch('http://127.0.0.1:7242/ingest/ac7031ef-f4cf-4a4b-a2e4-8f976eb78084',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'availability.tools.ts:soloWorkHoursFallback',message:'SOLO workHours fallback, skipping NO_AVAILABILITY_RULES',data:{dayOfWeek,start:dayHours.start,end:dayHours.end},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'B,D'})}).catch(()=>{});
                // #endregion
                // segue para getAvailableSlots (que usará workHours no db)
            } else {
                // #region agent log
                fetch('http://127.0.0.1:7242/ingest/ac7031ef-f4cf-4a4b-a2e4-8f976eb78084',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'availability.tools.ts:return:NO_AVAILABILITY_RULES',message:'early return NO_AVAILABILITY_RULES',data:{},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'D'})}).catch(()=>{});
                // #endregion
                return JSON.stringify({
                    slots: [],
                    totalAvailable: 0,
                    message: "Profissional não possui horários de trabalho cadastrados.",
                    error: "NO_AVAILABILITY_RULES",
                    debug: { professionalId },
                })
            }
        }

        // 5. Duração do serviço
        let finalServiceDuration = serviceDuration ?? 60
        if (serviceId && !serviceDuration) {
            const service = await db.query.services.findFirst({
                where: eq(services.id, serviceId),
                columns: { duration: true },
            })
            if (service) finalServiceDuration = service.duration
        }

        // 6. getAvailableSlots
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/ac7031ef-f4cf-4a4b-a2e4-8f976eb78084',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'availability.tools.ts:beforeGetAvailableSlots',message:'before getAvailableSlots',data:{normalizedDate,professionalId,finalServiceDuration},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'A,B,C'})}).catch(()=>{});
        // #endregion
        const allSlots = await sharedServices.getAvailableSlots({
            date: normalizedDate,
            salonId,
            serviceDuration: finalServiceDuration,
            professionalId,
        })

        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/ac7031ef-f4cf-4a4b-a2e4-8f976eb78084',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'availability.tools.ts:afterGetAvailableSlots',message:'after getAvailableSlots',data:{allSlotsLength:allSlots.length,allSlotsSample:allSlots.slice(0,5)},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'B,C'})}).catch(()=>{});
        // #endregion

        // Log opcional em dev
        const integrations = await getActiveIntegrations(salonId)
        if (integrations.google?.isActive || integrations.trinks?.isActive) {
            if (process.env.NODE_ENV === "development") {
                console.log("ℹ️ Integrações ativas durante checkAvailability:", {
                    google: integrations.google?.isActive,
                    trinks: integrations.trinks?.isActive,
                })
            }
        }

        // 7. Resposta
        const slots = allSlots.slice(0, 2)
        const workInfo = professionalAvailability ?? workHoursFallback

        let message: string
        if (slots.length > 0) {
            message =
                slots.length === 2
                    ? `Encontrados ${slots.length} horários disponíveis (mostrando os 2 melhores)`
                    : `Encontrado ${slots.length} horário disponível${allSlots.length > 1 ? ` (existem ${allSlots.length} no total)` : ""}`
        } else {
            message = workInfo
                ? `Nenhum horário disponível para ${requestedDate.toLocaleDateString("pt-BR")}. Profissional trabalha ${String(workInfo.startTime)}-${String(workInfo.endTime)}. Pode haver conflito com agendamentos existentes.`
                : `Nenhum horário disponível para ${requestedDate.toLocaleDateString("pt-BR")}.`
        }

        const result: Record<string, unknown> = {
            slots,
            totalAvailable: allSlots.length,
            message,
        }

        if (slots.length === 0 && workInfo) {
            result.debug = {
                normalizedDate,
                dayOfWeek,
                serviceDuration: finalServiceDuration,
                professionalWorkHours: `${workInfo.startTime}-${workInfo.endTime}`,
            }
        }

        return JSON.stringify(result)
    }

    /**
     * Busca regras de disponibilidade de um profissional
     */
    async getProfessionalAvailabilityRules(salonId: string, professionalName: string): Promise<string> {
        const professional = await db.query.professionals.findFirst({
            where: and(
                eq(professionals.salonId, salonId),
                ilike(professionals.name, `%${professionalName}%`)
            ),
            columns: {
                id: true,
                name: true,
            },
        })

        if (!professional) {
            throw new Error(`Profissional "${professionalName}" não encontrado no salão`)
        }

        const availabilityRules = await db
            .select({
                dayOfWeek: availability.dayOfWeek,
                startTime: availability.startTime,
                endTime: availability.endTime,
                isBreak: availability.isBreak,
            })
            .from(availability)
            .where(eq(availability.professionalId, professional.id))
            .orderBy(asc(availability.dayOfWeek), asc(availability.startTime))

        const dayNames = [
            "Domingo",
            "Segunda-feira",
            "Terça-feira",
            "Quarta-feira",
            "Quinta-feira",
            "Sexta-feira",
            "Sábado",
        ]

        const rules = availabilityRules.map((rule) => ({
            dayOfWeek: rule.dayOfWeek,
            dayName: dayNames[rule.dayOfWeek] || `Dia ${rule.dayOfWeek}`,
            startTime: rule.startTime,
            endTime: rule.endTime,
            isBreak: rule.isBreak,
        }))

        const workRules = rules.filter((rule) => !rule.isBreak)

        return JSON.stringify({
            professionalId: professional.id,
            professionalName: professional.name,
            rules: workRules,
            message: workRules.length > 0
                ? `${professional.name} trabalha ${workRules.length} dia(s) da semana`
                : `${professional.name} não possui regras de trabalho cadastradas`,
        })
    }
}
