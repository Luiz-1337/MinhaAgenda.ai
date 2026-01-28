/**
 * Use Case para operações de serviços (APPLICATION LAYER)
 */

import { formatZodError } from "@/lib/services/validation.service"
import type { ActionResult } from "@/lib/types/common"
import { ServiceRepository } from "./service.repository"
import { ServiceMapper, type UpsertServiceInput } from "./service-mapper.service"
import { SalonPlanService } from "./salon-plan.service"
import { ProfessionalService } from "@/lib/services/professional.service"

export class ServiceUseCase {
  /**
   * Cria ou atualiza um serviço
   */
  static async upsert(
    input: UpsertServiceInput & { salonId: string }
  ): Promise<ActionResult> {
    // Validação de entrada
    const parsed = ServiceMapper.getValidationSchema().safeParse(input)
    if (!parsed.success) {
      return { error: formatZodError(parsed.error) }
    }

    // Prepara payload
    const payload = ServiceMapper.prepareServicePayload(parsed.data)
    let serviceId = parsed.data.id

    // Cria ou atualiza serviço
    if (serviceId) {
      await ServiceRepository.update(serviceId, input.salonId, payload)
    } else {
      serviceId = await ServiceRepository.create(input.salonId, payload)
    }

    // Remove associações existentes
    await ServiceRepository.removeProfessionalAssociations(serviceId)

    // Lógica de negócio: plano SOLO vs outros planos
    const isSolo = await SalonPlanService.isSoloPlan(input.salonId)

    if (isSolo) {
      // Garante que o profissional único do plano SOLO exista
      // Se não existir, cria automaticamente usando os dados do owner
      const soloProfessional = await ProfessionalService.ensureSoloProfessional(input.salonId)
      if (soloProfessional) {
        await ServiceRepository.associateProfessionals(serviceId, [soloProfessional.id])
      }
    } else {
      // Para outros planos, valida e associa profissionais selecionados
      const validProfessionalIds = await ServiceRepository.validateProfessionalsBelongToSalon(
        input.salonId,
        parsed.data.professionalIds
      )

      if (validProfessionalIds.length > 0) {
        await ServiceRepository.associateProfessionals(serviceId, validProfessionalIds)
      }
    }

    return { success: true, data: undefined }
  }

  /**
   * Remove um serviço
   */
  static async delete(id: string, salonId: string): Promise<ActionResult> {
    // Remove associações primeiro
    await ServiceRepository.removeProfessionalAssociations(id)

    // Remove serviço
    await ServiceRepository.delete(id, salonId)

    return { success: true, data: undefined }
  }
}
