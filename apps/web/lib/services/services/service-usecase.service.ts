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
        // Especialistas: apenas os que também estão entre os profissionais válidos
        const validSet = new Set(validProfessionalIds)
        const specialistIds = (parsed.data.specialistProfessionalIds ?? []).filter((id) =>
          validSet.has(id)
        )
        await ServiceRepository.associateProfessionals(serviceId, validProfessionalIds, specialistIds)
      }
    }

    return { success: true, data: undefined }
  }

  /**
   * Remove um serviço.
   *
   * Se o serviço tiver agendamentos vinculados, por padrão NÃO apaga: retorna
   * um aviso com `code: "HAS_APPOINTMENTS"` para a UI confirmar. Com
   * `options.force`, apaga o serviço E seus agendamentos atomicamente.
   */
  static async delete(
    id: string,
    salonId: string,
    options: { force?: boolean } = {}
  ): Promise<ActionResult> {
    // Confirma que o serviço pertence ao salão antes de qualquer remoção
    // (evita apagar agendamentos de um serviço de outro salão).
    const existing = await ServiceRepository.findById(id, salonId)
    if (!existing) {
      return { success: true, data: undefined } // idempotente: nada a remover
    }

    const appointmentCount = await ServiceRepository.countAppointments(id, salonId)

    // Tem agendamentos e não foi confirmado: avisa em vez de apagar.
    if (appointmentCount > 0 && !options.force) {
      return {
        error: `O serviço "${existing.name}" possui ${appointmentCount} agendamento(s) vinculado(s). Excluí-lo também removerá esses agendamentos permanentemente. Deseja excluir mesmo assim?`,
        code: "HAS_APPOINTMENTS",
      }
    }

    if (appointmentCount > 0) {
      // Confirmado: remove agendamentos + serviço atomicamente.
      await ServiceRepository.deleteWithAppointments(id, salonId)
    } else {
      // Sem agendamentos: caminho simples (associações caem por CASCADE).
      await ServiceRepository.removeProfessionalAssociations(id)
      await ServiceRepository.delete(id, salonId)
    }

    return { success: true, data: undefined }
  }
}
