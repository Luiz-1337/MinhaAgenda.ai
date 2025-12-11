import { z } from "zod"

// Schema para horário de funcionamento de um dia
const workHoursDaySchema = z.object({
  start: z.string().regex(/^([0-1][0-9]|2[0-3]):[0-5][0-9]$/, "Formato inválido. Use HH:MM"),
  end: z.string().regex(/^([0-1][0-9]|2[0-3]):[0-5][0-9]$/, "Formato inválido. Use HH:MM"),
}).refine((data) => data.start < data.end, {
  message: "Horário de início deve ser anterior ao horário de fim",
  path: ["end"],
})

// Schema para horários de funcionamento (0 = domingo, 6 = sábado)
const workHoursSchema = z.record(
  z.enum(["0", "1", "2", "3", "4", "5", "6"]),
  workHoursDaySchema
).optional()

// Schema para configurações do salão
const salonSettingsSchema = z.object({
  accepts_card: z.boolean().optional(),
  parking: z.boolean().optional(),
  late_tolerance_minutes: z.number().min(0).optional(),
  cancellation_policy: z.string().optional(),
}).optional()

export const createSalonSchema = z.object({
  name: z.string().min(3),
  slug: z
    .string()
    .min(3)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  whatsapp: z.string().optional().or(z.literal("")),
  address: z.string().optional().or(z.literal("")),
  phone: z.string().optional().or(z.literal("")),
  description: z.string().optional().or(z.literal("")),
  workHours: workHoursSchema,
  settings: salonSettingsSchema,
})

export type CreateSalonSchema = z.infer<typeof createSalonSchema>

// Schema para atualização do salão (slug não pode ser alterado)
export const updateSalonSchema = z.object({
  name: z.string().min(3),
  whatsapp: z.string().optional().or(z.literal("")),
  address: z.string().optional().or(z.literal("")),
  phone: z.string().optional().or(z.literal("")),
  description: z.string().optional().or(z.literal("")),
  workHours: workHoursSchema,
  settings: salonSettingsSchema,
})

export type UpdateSalonSchema = z.infer<typeof updateSalonSchema>

// Schema para atualização do perfil
export const updateProfileSchema = z.object({
  fullName: z.string().min(2, "Nome deve ter pelo menos 2 caracteres").optional().or(z.literal("")).or(z.undefined()),
  phone: z.string().optional().or(z.literal("")).or(z.undefined()),
  calendarSyncEnabled: z.boolean().optional(),
})

export type UpdateProfileSchema = z.infer<typeof updateProfileSchema>

