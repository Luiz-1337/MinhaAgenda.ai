/**
 * Tool para verificar regras de disponibilidade de um profissional
 * Retorna os dias da semana e horários de turno (regras de trabalho), não slots livres
 */

import { and, eq, ilike, asc } from "drizzle-orm"
import { db, professionals, availability } from "@repo/db"
import type { Server } from "@modelcontextprotocol/sdk/server/index.js"
import { getProfessionalAvailabilityRulesSchema, type GetProfessionalAvailabilityRulesInput } from "../schemas/tools.schema.js"

/**
 * Retorna as regras de trabalho de um profissional específico
 * Busca pelo nome do profissional e retorna dias da semana e horários de turno
 */
export async function getProfessionalAvailabilityRulesTool(
  server: Server,
  args: unknown
): Promise<{
  professionalId: string
  professionalName: string
  rules: Array<{
    dayOfWeek: number
    dayName: string
    startTime: string
    endTime: string
    isBreak: boolean
  }>
  message: string
}> {
  const params = getProfessionalAvailabilityRulesSchema.parse(args)

  // Busca o profissional pelo nome (case-insensitive)
  const professional = await db.query.professionals.findFirst({
    where: and(
      eq(professionals.salonId, params.salonId),
      ilike(professionals.name, `%${params.professionalName}%`)
    ),
    columns: {
      id: true,
      name: true,
    },
  })

  if (!professional) {
    throw new Error(`Profissional "${params.professionalName}" não encontrado no salão`)
  }

  // Busca as regras de disponibilidade do profissional
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

  // Mapeia números dos dias da semana para nomes
  const dayNames = ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"]

  const rules = availabilityRules.map((rule) => ({
    dayOfWeek: rule.dayOfWeek,
    dayName: dayNames[rule.dayOfWeek] || `Dia ${rule.dayOfWeek}`,
    startTime: rule.startTime,
    endTime: rule.endTime,
    isBreak: rule.isBreak,
  }))

  // Filtra apenas regras de trabalho (não breaks)
  const workRules = rules.filter((rule) => !rule.isBreak)

  return {
    professionalId: professional.id,
    professionalName: professional.name,
    rules: workRules,
    message: workRules.length > 0
      ? `${professional.name} trabalha ${workRules.length} dia(s) da semana`
      : `${professional.name} não possui regras de trabalho cadastradas`,
  }
}

