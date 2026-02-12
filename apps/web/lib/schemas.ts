import { z } from "zod"

// Schema para horário de funcionamento de um dia
const workHoursDaySchema = z.object({
  start: z.string().regex(/^([0-1][0-9]|2[0-3]):[0-5][0-9]$/, "Formato inválido. Use HH:MM"),
  end: z.string().regex(/^([0-1][0-9]|2[0-3]):[0-5][0-9]$/, "Formato inválido. Use HH:MM"),
}).refine((data) => data.start < data.end, {
  message: "Horário de início deve ser anterior ao horário de fim",
  path: ["end"],
})

const workHoursSchema = z.preprocess(
  (val) => {
    if (typeof val === 'object' && val !== null) {
      const cleanObj: Record<string, unknown> = {};
      Object.entries(val).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          cleanObj[key] = value;
        }
      });
      return Object.keys(cleanObj).length > 0 ? cleanObj : undefined;
    }
    return val;
  },
  z.record(
    z.enum(["0", "1", "2", "3", "4", "5", "6"]),
    workHoursDaySchema
  ).optional()
);

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
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    .optional()
    .or(z.literal("")),
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

// Schema para configuração do agente (armazenado em salons.settings.agent_config)
export const agentConfigSchema = z.object({
  system_instructions: z.string().max(10000, "Instruções muito longas").optional().or(z.literal("")),
  tone: z.enum(["formal", "informal"]),
  isActive: z.boolean(),
})

export type AgentConfigSchema = z.infer<typeof agentConfigSchema>

// Schema para criação/edição de agentes
export const agentModelEnum = z.enum([
  "gpt-5-mini"
])

export const agentSchema = z.object({
  name: z.string().min(1, "Nome é obrigatório").max(255, "Nome muito longo"),
  systemPrompt: z.string().min(1, "System prompt é obrigatório").max(10000, "System prompt muito longo"),
  model: agentModelEnum,
  tone: z.enum(["formal", "informal"]),
  isActive: z.boolean(),
})

export type AgentSchema = z.infer<typeof agentSchema>

// Schema para criação de agente (mesmo que o base)
export const createAgentSchema = agentSchema

export type CreateAgentSchema = z.infer<typeof createAgentSchema>

// Schema para atualização de agente (todos os campos opcionais)
export const updateAgentSchema = agentSchema.partial()

export type UpdateAgentSchema = z.infer<typeof updateAgentSchema>

// Schema para atualização do perfil
export const updateProfileSchema = z.object({
  fullName: z.string().min(2, "Nome deve ter pelo menos 2 caracteres").optional().or(z.literal("")).or(z.undefined()),
  phone: z.string().optional().or(z.literal("")).or(z.undefined()),
  calendarSyncEnabled: z.boolean().optional(),
})

export type UpdateProfileSchema = z.infer<typeof updateProfileSchema>

// Schema para templates de system prompts
export const systemPromptTemplateSchema = z.object({
  name: z.string().min(1, "Nome é obrigatório").max(255, "Nome muito longo"),
  description: z.string().max(500, "Descrição muito longa").optional().or(z.literal("")),
  systemPrompt: z.string().min(1, "System prompt é obrigatório").max(10000, "System prompt muito longo"),
  category: z.string().max(100, "Categoria muito longa").optional().or(z.literal("")),
  isActive: z.boolean(),
  isGlobal: z.boolean().optional(), // Campo auxiliar para indicar se é template global
})

export type SystemPromptTemplateSchema = z.infer<typeof systemPromptTemplateSchema>

// Schema para criação de template
export const createSystemPromptTemplateSchema = systemPromptTemplateSchema

export type CreateSystemPromptTemplateSchema = z.infer<typeof createSystemPromptTemplateSchema>

// Schema para atualização de template (todos os campos opcionais)
export const updateSystemPromptTemplateSchema = systemPromptTemplateSchema.partial()

export type UpdateSystemPromptTemplateSchema = z.infer<typeof updateSystemPromptTemplateSchema>

