import { Result, ok, fail } from "../../../shared/types"
import { getDayOfWeekName } from "../../../shared/utils/date.utils"
import { DomainError } from "../../../domain/errors"
import { IProfessionalRepository, IAvailabilityRepository } from "../../../domain/repositories"
import { ProfessionalAvailabilityRulesDTO } from "../../dtos"

export interface GetProfessionalAvailabilityRulesInput {
  salonId: string
  professionalName: string
}

export class GetProfessionalAvailabilityRulesUseCase {
  constructor(
    private professionalRepo: IProfessionalRepository,
    private availabilityRepo: IAvailabilityRepository
  ) {}

  async execute(
    input: GetProfessionalAvailabilityRulesInput
  ): Promise<Result<ProfessionalAvailabilityRulesDTO, DomainError>> {
    // Buscar profissional por nome
    const professional = await this.professionalRepo.findByName(
      input.professionalName,
      input.salonId
    )

    if (!professional) {
      return fail(
        new Error(`Profissional "${input.professionalName}" não encontrado`) as DomainError
      )
    }

    // Buscar regras de disponibilidade
    const rules = await this.availabilityRepo.findByProfessional(professional.id)

    const rulesDTOs = rules.map((rule) => ({
      dayOfWeek: rule.dayOfWeek,
      dayName: getDayOfWeekName(rule.dayOfWeek),
      startTime: rule.startTime,
      endTime: rule.endTime,
      isBreak: rule.isBreak,
    }))

    // Agrupar por dia para mensagem mais clara
    const workDays = rulesDTOs
      .filter((r) => !r.isBreak)
      .reduce((acc, rule) => {
        if (!acc[rule.dayOfWeek]) {
          acc[rule.dayOfWeek] = {
            day: rule.dayName,
            times: [],
          }
        }
        acc[rule.dayOfWeek].times.push(`${rule.startTime}-${rule.endTime}`)
        return acc
      }, {} as Record<number, { day: string; times: string[] }>)

    const workDaysList = Object.values(workDays)
      .map((d) => `${d.day}: ${d.times.join(", ")}`)
      .join("; ")

    const message =
      rulesDTOs.length === 0
        ? `${professional.name} não tem horários de trabalho cadastrados`
        : `${professional.name} trabalha: ${workDaysList}`

    return ok({
      professionalId: professional.id,
      professionalName: professional.name,
      rules: rulesDTOs,
      message,
    })
  }
}
