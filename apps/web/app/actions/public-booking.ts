"use server"

import { z } from "zod"
import { createOnlineBookingService, listOnlineBookingSlotsService } from "@repo/db"
import { formatZodError } from "@/lib/services/validation.service"

/**
 * Agendamento online — as actions da página PÚBLICA (docs/ROADMAP.md, fase 7,
 * fatia 7f).
 *
 * ESTAS ACTIONS NÃO TÊM SESSÃO NEM `authorizeSalon`, DE PROPÓSITO: quem marca é o
 * cliente do salão, que não tem conta. Por isso este arquivo fica FORA da guarda
 * de `__tests__/lib/actions-authz.test.ts` — e por isso ele não pode crescer:
 *
 *   - só respondem para salão com o módulo `online_booking` ligado (a conferência
 *     é no serviço, a cada chamada);
 *   - `getPublicBookingSlots` só devolve horários livres ("HH:mm");
 *   - `createPublicBooking` só cria UM agendamento, num horário que a página está
 *     oferecendo agora, e devolve só o dia e a hora marcados;
 *   - nenhuma devolve dado de cliente, nem diz se um telefone já é cadastrado.
 *
 * Não há limite de tentativas por endereço (como em /avaliar e /assinar). O que
 * segura abuso é: antecedência mínima, janela de dias e o teto de agendamentos
 * futuros por telefone (domain/booking-slots.ts).
 */

const slotsSchema = z.object({
  salonId: z.string().max(60),
  serviceId: z.string().max(60),
  professionalId: z.string().max(60),
  day: z.string().max(10),
})

const bookingSchema = slotsSchema.extend({
  time: z.string().max(8),
  name: z.string().max(200),
  phone: z.string().max(40),
  // Campo-isca: invisível na página. Quem o preenche é robô.
  website: z.string().max(200).optional(),
})

export async function getPublicBookingSlots(
  input: z.infer<typeof slotsSchema>
): Promise<{ slots: string[] } | { error: string }> {
  const parsed = slotsSchema.safeParse(input)
  if (!parsed.success) return { error: formatZodError(parsed.error) }

  try {
    return { slots: await listOnlineBookingSlotsService({ ...parsed.data, now: new Date() }) }
  } catch (error) {
    console.error("Erro ao carregar horários do agendamento online:", error)
    return { error: "Não foi possível carregar os horários. Tente de novo" }
  }
}

export async function createPublicBooking(
  input: z.infer<typeof bookingSchema>
): Promise<{ success: true; day: string; time: string } | { error: string }> {
  const parsed = bookingSchema.safeParse(input)
  if (!parsed.success) return { error: formatZodError(parsed.error) }

  // Robô que preencheu o campo-isca recebe "deu certo" e nada é gravado.
  if (parsed.data.website) return { success: true, day: parsed.data.day, time: parsed.data.time }

  try {
    const result = await createOnlineBookingService({ ...parsed.data, now: new Date() })
    if (!result.success) return { error: result.error }
    return { success: true, ...result.data }
  } catch (error) {
    console.error("Erro ao marcar pelo agendamento online:", error)
    return { error: "Não foi possível marcar agora. Tente de novo ou fale com o salão" }
  }
}
