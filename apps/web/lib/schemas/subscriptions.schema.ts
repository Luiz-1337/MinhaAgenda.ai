import { z } from "zod"

/**
 * Validação de FORMATO das entradas de assinaturas. A regra (plano ativo, uma
 * assinatura por cliente e plano, o que pode ser excluído) fica em `@repo/db`
 * domain/subscriptions.ts.
 */

export const saveSubscriptionPlanSchema = z.object({
  salonId: z.string().uuid(),
  planId: z.string().uuid().optional(),
  name: z.string().max(200, "Nome do plano muito longo"),
  description: z.string().max(1000, "Descrição muito longa").nullish(),
  price: z.number().finite().min(0, "Valor inválido").max(1_000_000, "Valor inválido"),
  intervalMonths: z.number().int("A periodicidade é em meses inteiros").min(1).max(36),
  isActive: z.boolean(),
  isVisible: z.boolean(),
})

export const subscriptionPlanRefSchema = z.object({
  salonId: z.string().uuid(),
  planId: z.string().uuid(),
})

export const createCustomerSubscriptionSchema = z.object({
  salonId: z.string().uuid(),
  customerId: z.string().uuid({ message: "Selecione o cliente" }),
  planId: z.string().uuid({ message: "Selecione o plano" }),
})

export const customerSubscriptionRefSchema = z.object({
  salonId: z.string().uuid(),
  subscriptionId: z.string().uuid(),
})

export const setCustomerSubscriptionActiveSchema = customerSubscriptionRefSchema.extend({
  active: z.boolean(),
})

/** O aviso de vencimento por WhatsApp (fase 8, fatia 8d). */
export const saveSubscriptionReminderSchema = z.object({
  salonId: z.string().uuid(),
  isEnabled: z.boolean(),
  daysBefore: z.number().int(),
  message: z.string().max(1000, "Mensagem muito longa").nullish(),
})
