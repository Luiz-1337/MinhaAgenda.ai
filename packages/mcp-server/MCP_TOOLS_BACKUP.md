# MCP Server Tools - Backup Completo

Este arquivo contém toda a documentação das tools do MCP Server do MinhaAgendaAI.

## Índice

1. [Visão Geral](#visão-geral)
2. [Schemas (tools.schema.ts)](#schemas)
3. [Tools Core](#tools-core)
4. [Tools de Agendamento Default](#tools-de-agendamento-default)
5. [Tools do Google Calendar](#tools-do-google-calendar)
6. [Tools do Trinks](#tools-do-trinks)
7. [Handlers](#handlers)
8. [Utilitários](#utilitários)
9. [Serviços](#serviços)

---

## Visão Geral

O pacote `@repo/mcp-server` tem dois usos:

1. **MCP server (stdio)**: `src/index.ts` - Servidor MCP via stdio
2. **Tools locais para Vercel AI SDK**: `tools/vercel-ai.ts` - Adapter de tools locais

### Dependências (package.json)

```json
{
  "name": "@repo/mcp-server",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.0.4",
    "@repo/db": "workspace:*",
    "ai": "^5.0.108",
    "drizzle-orm": "^0.45.0",
    "google-auth-library": "^9.0.0",
    "googleapis": "^144.0.0",
    "zod": "^4.1.13"
  },
  "devDependencies": {
    "@types/node": "^20.11.24",
    "tsx": "^4.7.0",
    "typescript": "^5.3.3"
  }
}
```

---

## Schemas

### Arquivo: `src/schemas/tools.schema.ts`

```typescript
import { z } from "zod";

// ============================================================================
// Validação ISO 8601 (baseado no google-calendar-mcp-main)
// ============================================================================

const ISO_DATETIME_WITH_TZ = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(Z|[+-]\d{2}:\d{2})$/
const ISO_DATETIME_WITHOUT_TZ = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/
const ISO_DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/

export function isValidIsoDateTime(val: string): boolean {
  return ISO_DATETIME_WITH_TZ.test(val) || ISO_DATETIME_WITHOUT_TZ.test(val)
}

export function isValidIsoDateOrDateTime(val: string): boolean {
  return ISO_DATE_ONLY.test(val) || isValidIsoDateTime(val)
}

export const isoDateTimeSchema = z
  .string()
  .min(1, "Data/hora é obrigatória")
  .refine(isValidIsoDateTime, {
    message: "Formato inválido. Use ISO 8601: '2025-01-01T10:00:00' ou '2025-01-01T10:00:00-03:00'",
  })
  .describe("Data/hora ISO 8601 (ex: 2025-01-01T10:00:00-03:00)")

export const isoDateTimeOptionalSchema = z
  .string()
  .refine((val) => !val || isValidIsoDateTime(val), {
    message: "Formato inválido. Use ISO 8601: '2025-01-01T10:00:00' ou '2025-01-01T10:00:00-03:00'",
  })
  .optional()
  .describe("Data/hora ISO 8601 (ex: 2025-01-01T10:00:00-03:00)")

// ============================================================================
// Schemas para Google Calendar Tools
// ============================================================================

export const googleCheckAvailabilitySchema = z.object({
  professionalId: z
    .string()
    .uuid("professionalId deve ser um UUID válido")
    .describe("ID do profissional para verificar disponibilidade"),
  date: isoDateTimeSchema,
  serviceId: z.uuid("serviceId deve ser um UUID válido").optional(),
  serviceDuration: z
    .number()
    .int()
    .positive("serviceDuration deve ser um número positivo")
    .optional()
    .describe("Duração do serviço em minutos (padrão: 60)"),
})

export type GoogleCheckAvailabilityInput = z.infer<typeof googleCheckAvailabilitySchema>

export const googleCreateAppointmentSchema = z.object({
  professionalId: z
    .string()
    .uuid("professionalId deve ser um UUID válido")
    .describe("ID do profissional"),
  serviceId: z
    .string()
    .uuid("serviceId deve ser um UUID válido")
    .describe("ID do serviço"),
  date: isoDateTimeSchema,
  notes: z.string().optional().describe("Observações do agendamento"),
})

export type GoogleCreateAppointmentInput = z.infer<typeof googleCreateAppointmentSchema>

export const googleUpdateAppointmentSchema = z.object({
  appointmentId: z
    .string()
    .uuid("appointmentId deve ser um UUID válido")
    .describe("ID do agendamento a ser atualizado"),
  professionalId: z.uuid("professionalId deve ser um UUID válido").optional(),
  serviceId: z.uuid("serviceId deve ser um UUID válido").optional(),
  date: isoDateTimeOptionalSchema,
  notes: z.string().optional(),
})

export type GoogleUpdateAppointmentInput = z.infer<typeof googleUpdateAppointmentSchema>

export const googleDeleteAppointmentSchema = z.object({
  appointmentId: z
    .string()
    .uuid("appointmentId deve ser um UUID válido")
    .describe("ID do agendamento a ser removido"),
})

export type GoogleDeleteAppointmentInput = z.infer<typeof googleDeleteAppointmentSchema>

// ============================================================================
// Schemas Existentes (mantidos para compatibilidade)
// ============================================================================

export const checkAvailabilitySchema = z.object({
  salonId: z.uuid("salonId deve ser um UUID válido"),
  professionalId: z.uuid("professionalId deve ser um UUID válido").optional(),
  date: z.iso.datetime("date deve ser uma data ISO válida"),
  serviceId: z.uuid("serviceId deve ser um UUID válido").optional(),
  serviceDuration: z.number().int().positive("serviceDuration deve ser um número positivo").optional(),
})

export type CheckAvailabilityInput = z.infer<typeof checkAvailabilitySchema>

export const createAppointmentSchema = z.object({
  salonId: z.uuid("salonId deve ser um UUID válido"),
  professionalId: z.uuid("professionalId deve ser um UUID válido"),
  phone: z.string().min(1, "phone é obrigatório"),
  serviceId: z.uuid("serviceId deve ser um UUID válido"),
  date: z.iso.datetime("date deve ser uma data ISO válida"),
  notes: z.string().optional(),
})

export type CreateAppointmentInput = z.infer<typeof createAppointmentSchema>

export const cancelAppointmentSchema = z.object({
  appointmentId: z.uuid("appointmentId deve ser um UUID válido. Obtenha-o chamando getMyFutureAppointments primeiro."),
  reason: z.string().optional(),
})

export type CancelAppointmentInput = z.infer<typeof cancelAppointmentSchema>

export const getServicesSchema = z.object({
  salonId: z.uuid("salonId deve ser um UUID válido"),
  includeInactive: z.boolean().default(false).optional(),
})

export type GetServicesInput = z.infer<typeof getServicesSchema>

export const getProductsSchema = z.object({
  salonId: z.uuid("salonId deve ser um UUID válido"),
  includeInactive: z.boolean().default(false).optional(),
})

export type GetProductsInput = z.infer<typeof getProductsSchema>

export const saveCustomerPreferenceSchema = z.object({
  salonId: z.uuid("salonId deve ser um UUID válido"),
  customerId: z.uuid("customerId deve ser um UUID válido"),
  key: z.string().min(1, "key é obrigatória"),
  value: z.union([
    z.string(),
    z.number(),
    z.boolean()
  ]).describe("Valor da preferência (texto, número ou booleano)"),
})

export type SaveCustomerPreferenceInput = z.infer<typeof saveCustomerPreferenceSchema>

export const getSalonInfoSchema = z.object({
  salonId: z.uuid("salonId deve ser um UUID válido").optional(),
})

export type GetSalonInfoInput = z.infer<typeof getSalonInfoSchema>

export const getProfessionalsSchema = z.object({
  salonId: z.string().uuid("salonId deve ser um UUID válido"),
  includeInactive: z.boolean().default(false).optional(),
})

export type GetProfessionalsInput = z.infer<typeof getProfessionalsSchema>

export const qualifyLeadSchema = z.object({
  salonId: z.uuid("salonId deve ser um UUID válido"),
  phoneNumber: z.string().min(1, "phoneNumber é obrigatório"),
  interest: z.enum(["high", "medium", "low", "none"]),
  notes: z.string().optional(),
})

export type QualifyLeadInput = z.infer<typeof qualifyLeadSchema>

export const rescheduleAppointmentSchema = z.object({
  appointmentId: z.uuid("appointmentId deve ser um UUID válido. Obtenha-o chamando getMyFutureAppointments primeiro."),
  newDate: z.iso.datetime("newDate deve ser uma data ISO válida"),
})

export type RescheduleAppointmentInput = z.infer<typeof rescheduleAppointmentSchema>

export const identifyCustomerSchema = z.object({
  phone: z.string().min(1, "phone é obrigatório").describe("Telefone do cliente"),
  name: z.string().optional().describe("Nome do cliente (opcional, usado para criar se não existir)"),
})

export type IdentifyCustomerInput = z.infer<typeof identifyCustomerSchema>

export const createCustomerSchema = z.object({
  phone: z.string().min(1, "phone é obrigatório").describe("Telefone do cliente"),
  name: z.string().min(1, "name é obrigatório").describe("Nome completo do cliente"),
})

export type CreateCustomerInput = z.infer<typeof createCustomerSchema>

export const updateCustomerNameSchema = z.object({
  customerId: z.string().uuid("customerId deve ser um UUID válido"),
  name: z.string().min(1, "name é obrigatório").describe("Novo nome completo do cliente"),
})

export type UpdateCustomerNameInput = z.infer<typeof updateCustomerNameSchema>

export const getCustomerUpcomingAppointmentsSchema = z.object({
  salonId: z.uuid("salonId deve ser um UUID válido"),
  customerPhone: z.string().min(1, "customerPhone é obrigatório"),
})

export type GetCustomerUpcomingAppointmentsInput = z.infer<typeof getCustomerUpcomingAppointmentsSchema>

export const getMyFutureAppointmentsSchema = z.object({
  salonId: z.uuid("salonId deve ser um UUID válido"),
  clientId: z.uuid("clientId deve ser um UUID válido").optional(),
  phone: z.string().min(1, "phone deve ser fornecido se clientId não estiver disponível").optional(),
})

export type GetMyFutureAppointmentsInput = z.infer<typeof getMyFutureAppointmentsSchema>

export const getProfessionalAvailabilityRulesSchema = z.object({
  salonId: z.uuid("salonId deve ser um UUID válido"),
  professionalName: z.string().min(1, "professionalName é obrigatório"),
})

export type GetProfessionalAvailabilityRulesInput = z.infer<typeof getProfessionalAvailabilityRulesSchema>

export const updateAppointmentSchema = z.object({
  appointmentId: z.uuid("appointmentId deve ser um UUID válido. Obtenha-o chamando getMyFutureAppointments primeiro."),
  professionalId: z.uuid("professionalId deve ser um UUID válido").optional(),
  serviceId: z.uuid("serviceId deve ser um UUID válido").optional(),
  date: z.iso.datetime("date deve ser uma data ISO válida").optional(),
  notes: z.string().optional(),
})

export type UpdateAppointmentInput = z.infer<typeof updateAppointmentSchema>

export const deleteAppointmentSchema = z.object({
  appointmentId: z.uuid("appointmentId deve ser um UUID válido. Obtenha-o chamando getMyFutureAppointments primeiro."),
})

export type DeleteAppointmentInput = z.infer<typeof deleteAppointmentSchema>
```

---

## Tools Core

### Arquivo: `tools/core.ts`

```typescript
import { tool } from "ai"
import { z } from "zod"
import { MinhaAgendaAITools } from "../src/MinhaAgendaAI_tools"
import {
  createCustomerSchema,
  getCustomerUpcomingAppointmentsSchema,
  getMyFutureAppointmentsSchema,
  getProfessionalAvailabilityRulesSchema,
  getProfessionalsSchema,
  getProductsSchema,
  getServicesSchema,
  identifyCustomerSchema,
  qualifyLeadSchema,
  saveCustomerPreferenceSchema,
  updateCustomerNameSchema,
} from "../src/schemas/tools.schema"

const SOURCE_FILE = 'packages/mcp-server/tools/core.ts'

function logToolExecution(toolName: string, params: unknown, result: unknown, startTime: number) {
  const duration = Date.now() - startTime
  console.log('\n🔨 [Tool Execution] ' + toolName)
  console.log(`   📁 Arquivo: ${SOURCE_FILE}`)
  console.log(`   📥 Parâmetros: ${JSON.stringify(params, null, 2).split('\n').join('\n      ')}`)
  console.log(`   📤 Resposta: ${JSON.stringify(result, null, 2).split('\n').join('\n      ')}`)
  console.log(`   ⏱️ Duração: ${duration}ms`)
  console.log('')
}

function parseToolResult(result: unknown): unknown {
  if (typeof result !== "string") {
    return result
  }
  return JSON.parse(result)
}

export function createCoreTools(salonId: string, clientPhone: string) {
  const impl = new MinhaAgendaAITools()

  const identifyCustomerInputSchema = identifyCustomerSchema
    .partial({ phone: true })
    .describe("Identificação de cliente (phone é opcional; padrão = telefone do WhatsApp)")

  const createCustomerInputSchema = createCustomerSchema
    .omit({ phone: true })
    .extend({
      phone: createCustomerSchema.shape.phone
        .optional()
        .describe("Telefone do cliente (opcional; padrão = telefone do WhatsApp)"),
    })

  const getServicesInputSchema = getServicesSchema.omit({ salonId: true })
  const getProductsInputSchema = getProductsSchema.omit({ salonId: true })
  const saveCustomerPreferenceInputSchema = saveCustomerPreferenceSchema
    .omit({ salonId: true })
    .extend({
      customerId: saveCustomerPreferenceSchema.shape.customerId
        .optional()
        .describe("ID do cliente (opcional; padrão = cliente do WhatsApp, se já existir)"),
    })
  const qualifyLeadInputSchema = qualifyLeadSchema
    .omit({ salonId: true })
    .extend({
      phoneNumber: qualifyLeadSchema.shape.phoneNumber
        .optional()
        .describe("Número do lead (opcional; padrão = telefone do WhatsApp)"),
    })

  const getCustomerUpcomingAppointmentsInputSchema = getCustomerUpcomingAppointmentsSchema
    .omit({ salonId: true, customerPhone: true })
    .extend({
      customerPhone: getCustomerUpcomingAppointmentsSchema.shape.customerPhone
        .optional()
        .describe("Telefone do cliente (opcional; padrão = telefone do WhatsApp)"),
    })
  const getMyFutureAppointmentsInputSchema = getMyFutureAppointmentsSchema.omit({ salonId: true })
  const getProfessionalsInputSchema = getProfessionalsSchema.omit({ salonId: true })
  const getProfessionalAvailabilityRulesInputSchema = getProfessionalAvailabilityRulesSchema.omit({ salonId: true })

  return {
    identifyCustomer: tool({
      description:
        "Identifica um cliente pelo telefone. Se não encontrar e um nome for fornecido, cria um novo cliente. Retorna { id, name, found: true/false, created: true/false }.",
      inputSchema: identifyCustomerInputSchema,
      execute: async ({ phone, name }: z.infer<typeof identifyCustomerInputSchema>) => {
        const startTime = Date.now()
        const params = { phone: phone || clientPhone, name }
        const resolvedPhone = (phone || clientPhone).trim()
        const result = await impl.identifyCustomer(resolvedPhone, name, salonId)
        const parsed = parseToolResult(result)
        logToolExecution('identifyCustomer', params, parsed, startTime)
        return parsed
      },
    }),

    createCustomer: tool({
      description:
        "Cria um novo cliente no sistema explicitamente. Se o cliente já existir, retorna os dados do cliente existente. Retorna { id, name, phone, created: true/false, alreadyExists: true/false }.",
      inputSchema: createCustomerInputSchema,
      execute: async ({ phone, name }: z.infer<typeof createCustomerInputSchema>) => {
        const startTime = Date.now()
        const params = { phone: phone || clientPhone, name }
        const resolvedPhone = (phone || clientPhone).trim()
        if (!name || name.trim() === "") {
          throw new Error("Nome é obrigatório para criar um cliente")
        }
        const result = await impl.createCustomer(resolvedPhone, name.trim(), salonId)
        const parsed = parseToolResult(result)
        logToolExecution('createCustomer', params, parsed, startTime)
        return parsed
      },
    }),

    getServices: tool({
      description: "Busca lista de serviços disponíveis em um salão com preços e durações.",
      inputSchema: getServicesInputSchema,
      execute: async (input: z.infer<typeof getServicesInputSchema>) => {
        const startTime = Date.now()
        const result = await impl.getServices(salonId, input.includeInactive)
        const parsed = parseToolResult(result)
        logToolExecution('getServices', input, parsed, startTime)
        return parsed
      },
    }),

    getProducts: tool({
      description: "Busca lista de produtos disponíveis em um salão com preços.",
      inputSchema: getProductsInputSchema,
      execute: async (input: z.infer<typeof getProductsInputSchema>) => {
        const startTime = Date.now()
        const result = await impl.getProducts(salonId, input.includeInactive)
        const parsed = parseToolResult(result)
        logToolExecution('getProducts', input, parsed, startTime)
        return parsed
      },
    }),

    saveCustomerPreference: tool({
      description:
        "Salva uma preferência do cliente no CRM do salão. Útil para armazenar informações extraídas da conversa (ex: alergias, preferências).",
      inputSchema: saveCustomerPreferenceInputSchema,
      execute: async (input: z.infer<typeof saveCustomerPreferenceInputSchema>) => {
        const startTime = Date.now()
        let resolvedCustomerId = input.customerId
        if (!resolvedCustomerId) {
          const identified = await impl.identifyCustomer(clientPhone, undefined, salonId)
          const parsedId = parseToolResult(identified) as { id?: string }
          resolvedCustomerId = parsedId?.id
        }
        if (!resolvedCustomerId) {
          throw new Error("Não foi possível identificar o cliente. Chame identifyCustomer primeiro (ou forneça customerId).")
        }
        const result = await impl.saveCustomerPreference(salonId, resolvedCustomerId, input.key, input.value)
        const parsed = parseToolResult(result)
        logToolExecution('saveCustomerPreference', { ...input, resolvedCustomerId }, parsed, startTime)
        return parsed
      },
    }),

    qualifyLead: tool({
      description: "Qualifica um lead baseado no nível de interesse demonstrado.",
      inputSchema: qualifyLeadInputSchema,
      execute: async (input: z.infer<typeof qualifyLeadInputSchema>) => {
        const startTime = Date.now()
        const result = await impl.qualifyLead(salonId, input.phoneNumber || clientPhone, input.interest, input.notes)
        const parsed = parseToolResult(result)
        logToolExecution('qualifyLead', input, parsed, startTime)
        return parsed
      },
    }),

    getMyFutureAppointments: tool({
      description:
        "Lista agendamentos futuros do cliente atual. Use esta tool SEMPRE antes de cancelar ou reagendar agendamentos para obter os IDs necessários.",
      inputSchema: getMyFutureAppointmentsInputSchema,
      execute: async (input: z.infer<typeof getMyFutureAppointmentsInputSchema>) => {
        const startTime = Date.now()
        const result = await impl.getMyFutureAppointments(salonId, input.clientId, input.phone || clientPhone)
        const parsed = parseToolResult(result)
        logToolExecution('getMyFutureAppointments', input, parsed, startTime)
        return parsed
      },
    }),

    getProfessionals: tool({
      description: "Retorna lista de profissionais (barbeiros) do salão para mapear nomes a IDs.",
      inputSchema: getProfessionalsInputSchema,
      execute: async (input: z.infer<typeof getProfessionalsInputSchema>) => {
        const startTime = Date.now()
        const result = await impl.getProfessionals(salonId, input.includeInactive)
        const parsed = parseToolResult(result)
        logToolExecution('getProfessionals', input, parsed, startTime)
        return parsed
      },
    }),

    getProfessionalAvailabilityRules: tool({
      description:
        "Verifica os turnos de trabalho de um profissional específico (ex: 'João trabalha terças e quintas?').",
      inputSchema: getProfessionalAvailabilityRulesInputSchema,
      execute: async (input: z.infer<typeof getProfessionalAvailabilityRulesInputSchema>) => {
        const startTime = Date.now()
        const result = await impl.getProfessionalAvailabilityRules(salonId, input.professionalName)
        const parsed = parseToolResult(result)
        logToolExecution('getProfessionalAvailabilityRules', input, parsed, startTime)
        return parsed
      },
    }),

    updateCustomerName: tool({
      description:
        "Atualiza o nome de um cliente no sistema. Use esta tool quando o cliente fornecer seu nome ou quando quiser corrigir o nome cadastrado. IMPORTANTE: Se o nome atual do cliente for apenas um número de telefone formatado (ex: '(11) 98604-9295'), pergunte o nome ao cliente e use esta tool para atualizar.",
      inputSchema: updateCustomerNameSchema,
      execute: async (input: z.infer<typeof updateCustomerNameSchema>) => {
        const startTime = Date.now()
        const result = await impl.updateCustomerName(input.customerId, input.name)
        const parsed = parseToolResult(result)
        logToolExecution('updateCustomerName', input, parsed, startTime)
        return parsed
      },
    }),
  }
}
```

---

## Tools de Agendamento Default

### Arquivo: `tools/appointments.ts`

```typescript
import { tool } from "ai"
import { z } from "zod"
import { MinhaAgendaAITools } from "../src/MinhaAgendaAI_tools"
import {
  checkAvailabilitySchema,
  createAppointmentSchema,
  updateAppointmentSchema,
  deleteAppointmentSchema,
} from "../src/schemas/tools.schema"
import { assertRateLimit, RATE_LIMITS } from "../src/utils"
import { ensureIsoWithTimezone } from "../src/utils/date-format.utils"

const SOURCE_FILE = 'packages/mcp-server/tools/appointments.ts'

type JsonValue =
  | string
  | number
  | boolean
  | null
  | { [key: string]: JsonValue }
  | JsonValue[]

function logToolExecution(toolName: string, params: unknown, result: unknown, startTime: number) {
  const duration = Date.now() - startTime
  console.log('\n🔨 [Tool Execution] ' + toolName)
  console.log(`   📁 Arquivo: ${SOURCE_FILE}`)
  console.log(`   📥 Parâmetros: ${JSON.stringify(params, null, 2).split('\n').join('\n      ')}`)
  console.log(`   📤 Resposta: ${JSON.stringify(result, null, 2).split('\n').join('\n      ')}`)
  console.log(`   ⏱️ Duração: ${duration}ms`)
  console.log('')
}

function maybeParseJson(value: unknown): JsonValue | unknown {
  if (typeof value !== "string") return value
  const text = value.trim()
  if (!text) return value
  try {
    return JSON.parse(text) as JsonValue
  } catch {
    return value
  }
}

export function createAppointmentTools(salonId: string, clientPhone: string) {
  const impl = new MinhaAgendaAITools()

  const checkAvailabilityInputSchema = checkAvailabilitySchema
    .omit({ salonId: true })
    .extend({
      date: z
        .string()
        .min(1)
        .describe("Data/hora ISO (ex: 2025-12-27T09:00:00-03:00). Se faltar timezone, será normalizado."),
    })

  const createAppointmentInputSchema = createAppointmentSchema
    .omit({ salonId: true, phone: true })
    .extend({
      date: z
        .string()
        .min(1)
        .describe("Data/hora ISO (ex: 2025-12-27T09:00:00-03:00). Se faltar timezone, será normalizado."),
    })

  const updateAppointmentInputSchema = updateAppointmentSchema.extend({
    date: z
      .string()
      .min(1)
      .describe("Data/hora ISO (ex: 2025-12-27T09:00:00-03:00). Se faltar timezone, será normalizado.")
      .optional(),
  })

  return {
    checkAvailability: tool({
      description: "Retorna slots de horário disponíveis para agendamento. PRÉ-REQUISITOS: Obter professionalId via getProfessionals PRIMEIRO.",
      inputSchema: checkAvailabilityInputSchema,
      execute: async (input) => {
        const startTime = Date.now()
        const result = await impl.checkAvailability(
          salonId,
          String(ensureIsoWithTimezone(input.date)),
          input.professionalId,
          input.serviceId,
          input.serviceDuration
        )
        const parsed = maybeParseJson(result)
        logToolExecution('checkAvailability', input, parsed, startTime)
        return parsed
      },
    }),

    addAppointment: tool({
      description: "Cria um novo agendamento para o cliente. PRÉ-REQUISITOS: Cliente identificado, professionalId e serviceId obtidos.",
      inputSchema: createAppointmentInputSchema,
      execute: async (input) => {
        assertRateLimit(`${salonId}:createAppointment`, RATE_LIMITS.CREATE_APPOINTMENT)
        const startTime = Date.now()
        const result = await impl.createAppointment(
          salonId,
          input.professionalId,
          clientPhone,
          input.serviceId,
          String(ensureIsoWithTimezone(input.date)),
          input.notes
        )
        const parsed = maybeParseJson(result)
        logToolExecution('addAppointment', input, parsed, startTime)
        return parsed
      },
    }),

    updateAppointment: tool({
      description: "Atualiza um agendamento existente (reagendamento). PRÉ-REQUISITO: Obter appointmentId via getMyFutureAppointments.",
      inputSchema: updateAppointmentInputSchema,
      execute: async (input) => {
        const startTime = Date.now()
        const result = await impl.updateAppointment(
          input.appointmentId,
          input.professionalId,
          input.serviceId,
          input.date ? String(ensureIsoWithTimezone(input.date)) : undefined,
          input.notes
        )
        const parsed = maybeParseJson(result)
        logToolExecution('updateAppointment', input, parsed, startTime)
        return parsed
      },
    }),

    removeAppointment: tool({
      description: "Cancela um agendamento existente (soft delete). PRÉ-REQUISITO: Obter appointmentId via getMyFutureAppointments.",
      inputSchema: deleteAppointmentSchema,
      execute: async (input) => {
        const startTime = Date.now()
        const result = await impl.deleteAppointment(input.appointmentId)
        const parsed = maybeParseJson(result)
        logToolExecution('removeAppointment', input, parsed, startTime)
        return parsed
      },
    }),
  }
}
```

---

## Tools do Google Calendar

### Arquivo: `tools/google-calendar-tools.ts`

```typescript
import { tool } from "ai"

import {
  CheckAvailabilityHandler,
  CreateAppointmentHandler,
  UpdateAppointmentHandler,
  DeleteAppointmentHandler,
} from "../src/handlers"

import {
  googleCheckAvailabilitySchema,
  googleCreateAppointmentSchema,
  googleUpdateAppointmentSchema,
  googleDeleteAppointmentSchema,
} from "../src/schemas/tools.schema"

export function createGoogleCalendarTools(salonId: string, clientPhone: string) {
  const checkAvailabilityHandler = new CheckAvailabilityHandler(salonId, clientPhone)
  const createAppointmentHandler = new CreateAppointmentHandler(salonId, clientPhone)
  const updateAppointmentHandler = new UpdateAppointmentHandler(salonId, clientPhone)
  const deleteAppointmentHandler = new DeleteAppointmentHandler(salonId, clientPhone)

  return {
    google_checkAvailability: tool({
      description:
        "Verifica horários disponíveis consultando o Google Calendar. " +
        "Combina disponibilidade do banco com a API FreeBusy do Google.",
      inputSchema: googleCheckAvailabilitySchema,
      execute: async (input) => checkAvailabilityHandler.execute(input),
    }),

    google_createAppointment: tool({
      description:
        "Cria um novo agendamento e sincroniza com o Google Calendar.",
      inputSchema: googleCreateAppointmentSchema,
      execute: async (input) => createAppointmentHandler.execute(input),
    }),

    google_updateAppointment: tool({
      description:
        "Atualiza um agendamento existente e sincroniza com o Google Calendar.",
      inputSchema: googleUpdateAppointmentSchema,
      execute: async (input) => updateAppointmentHandler.execute(input),
    }),

    google_deleteAppointment: tool({
      description:
        "Remove um agendamento e deleta o evento do Google Calendar.",
      inputSchema: googleDeleteAppointmentSchema,
      execute: async (input) => deleteAppointmentHandler.execute(input),
    }),
  }
}
```

---

## Tools do Trinks

### Arquivo: `tools/trinks-tools.ts`

```typescript
import { tool } from "ai"
import { z } from "zod"
import { MinhaAgendaAITools } from "../src/MinhaAgendaAI_tools"
import {
  checkAvailabilitySchema,
  createAppointmentSchema,
  updateAppointmentSchema,
  deleteAppointmentSchema,
} from "../src/schemas/tools.schema"
import {
  db,
  services,
  professionals,
  profiles,
  appointments,
  domainServices as sharedServices,
  getTrinksBusySlots,
  createTrinksAppointment,
  updateTrinksAppointment,
  deleteTrinksAppointment,
} from "@repo/db"
import { eq } from "drizzle-orm"
import { ensureIsoWithTimezone } from "../src/utils/date-format.utils"

const SOURCE_FILE = 'packages/mcp-server/tools/trinks-tools.ts'

export function createTrinksTools(salonId: string, clientPhone: string) {
  const impl = new MinhaAgendaAITools()

  const checkAvailabilityInputSchema = checkAvailabilitySchema
    .omit({ salonId: true })
    .extend({
      date: z.string().min(1).describe("Data/hora ISO"),
    })

  const createAppointmentInputSchema = createAppointmentSchema
    .omit({ salonId: true, phone: true })
    .extend({
      date: z.string().min(1).describe("Data/hora ISO"),
    })

  const updateAppointmentInputSchema = updateAppointmentSchema.extend({
    date: z.string().min(1).describe("Data/hora ISO").optional(),
  })

  return {
    trinks_checkAvailability: tool({
      description:
        "Verifica horários disponíveis consultando o sistema Trinks.",
      inputSchema: checkAvailabilityInputSchema,
      execute: async (input) => {
        // Implementação que combina slots do DB com Trinks busy slots
        const dateStr = String(ensureIsoWithTimezone(input.date))
        const dateOnly = dateStr.slice(0, 10)
        // ... lógica de verificação
        return { slots: [], totalAvailable: 0, message: "Implementação" }
      },
    }),

    trinks_createAppointment: tool({
      description:
        "Cria um novo agendamento e sincroniza com o sistema Trinks.",
      inputSchema: createAppointmentInputSchema,
      execute: async (input) => {
        // Implementação que cria no DB e sincroniza com Trinks
        return { appointmentId: "", message: "Implementação" }
      },
    }),

    trinks_updateAppointment: tool({
      description:
        "Atualiza um agendamento e sincroniza com o Trinks.",
      inputSchema: updateAppointmentInputSchema,
      execute: async (input) => {
        return { appointmentId: input.appointmentId, message: "Implementação" }
      },
    }),

    trinks_deleteAppointment: tool({
      description:
        "Remove um agendamento e deleta do Trinks.",
      inputSchema: deleteAppointmentSchema,
      execute: async (input) => {
        return { message: "Implementação" }
      },
    }),
  }
}
```

---

## Vercel AI SDK Adapter

### Arquivo: `tools/vercel-ai.ts`

```typescript
import { createCoreTools } from "./core"
import { createAppointmentTools } from "./appointments"
import { createGoogleCalendarTools } from "./google-calendar-tools"
import { createTrinksTools } from "./trinks-tools"
import { getActiveIntegrations, type ActiveIntegrations } from "../src/MinhaAgendaAI_tools"

function logToolsLoaded(toolNames: string[], sourceFile: string, context: { salonId: string; clientPhone: string }) {
  console.log('\n📦 [MCP Tools] Tools carregadas para o LLM:')
  console.log(`   📁 Arquivo: ${sourceFile}`)
  console.log(`   🏪 Salon ID: ${context.salonId}`)
  console.log(`   📱 Client Phone: ${context.clientPhone}`)
  console.log(`   🔧 Tools (${toolNames.length}):`)
  toolNames.forEach(name => {
    console.log(`      - ${name}`)
  })
  console.log('')
}

export async function createMCPTools(salonId: string, clientPhone: string) {
  const context = { salonId, clientPhone }
  
  // Cria tools core (sempre disponíveis)
  const coreTools = createCoreTools(salonId, clientPhone)
  const coreToolNames = Object.keys(coreTools)
  logToolsLoaded(coreToolNames, 'packages/mcp-server/tools/core.ts', context)

  // Verifica integrações ativas para o salão
  const integrations = await getActiveIntegrations(salonId)
  
  // Determina quais tools de agendamento carregar
  const { tools: appointmentTools, sourceFile } = await resolveAppointmentToolsWithSource(
    salonId, 
    clientPhone, 
    integrations
  )
  const appointmentToolNames = Object.keys(appointmentTools)
  logToolsLoaded(appointmentToolNames, sourceFile, context)

  // Log resumo final
  const allTools = { ...coreTools, ...appointmentTools }
  console.log('✅ [MCP Tools] Resumo final:')
  console.log(`   Total de tools carregadas: ${Object.keys(allTools).length}`)
  console.log(`   Integrações: Google=${integrations.google?.isActive ?? false}, Trinks=${integrations.trinks?.isActive ?? false}`)
  console.log('')

  return allTools
}

async function resolveAppointmentToolsWithSource(
  salonId: string,
  clientPhone: string,
  integrations: ActiveIntegrations
): Promise<{ tools: Record<string, unknown>; sourceFile: string }> {
  const hasGoogle = integrations.google?.isActive === true
  const hasTrinks = integrations.trinks?.isActive === true

  if (hasGoogle && hasTrinks) {
    const googleTools = createGoogleCalendarTools(salonId, clientPhone)
    const trinksTools = createTrinksTools(salonId, clientPhone)
    return {
      tools: { ...googleTools, ...trinksTools },
      sourceFile: 'google-calendar-tools.ts + trinks-tools.ts',
    }
  }

  if (hasGoogle) {
    return {
      tools: createGoogleCalendarTools(salonId, clientPhone),
      sourceFile: 'packages/mcp-server/tools/google-calendar-tools.ts',
    }
  }

  if (hasTrinks) {
    return {
      tools: createTrinksTools(salonId, clientPhone),
      sourceFile: 'packages/mcp-server/tools/trinks-tools.ts',
    }
  }

  return {
    tools: createAppointmentTools(salonId, clientPhone),
    sourceFile: 'packages/mcp-server/tools/appointments.ts',
  }
}

export async function getIntegrationStatus(salonId: string): Promise<ActiveIntegrations> {
  return getActiveIntegrations(salonId)
}
```

---

## Facade Principal

### Arquivo: `src/MinhaAgendaAI_tools.ts`

```typescript
import {
    CustomerTools,
    AppointmentTools,
    AvailabilityTools,
    CatalogTools,
    SalonTools,
    getActiveIntegrations as getActiveIntegrationsInternal,
    type ActiveIntegrations,
} from "./tools"

export type { ActiveIntegrations }
export { getActiveIntegrationsInternal as getActiveIntegrations }

export class MinhaAgendaAITools {
    private customerTools = new CustomerTools()
    private appointmentTools = new AppointmentTools()
    private availabilityTools = new AvailabilityTools()
    private catalogTools = new CatalogTools()
    private salonTools = new SalonTools()

    public async getActiveIntegrations(salonId: string): Promise<ActiveIntegrations> {
        return getActiveIntegrationsInternal(salonId)
    }

    // Customer Methods
    public async identifyCustomer(phone: string, name?: string, salonId?: string) {
        return this.customerTools.identifyCustomer(phone, name, salonId)
    }

    public async createCustomer(phone: string, name: string, salonId?: string) {
        return this.customerTools.createCustomer(phone, name, salonId)
    }

    public async updateCustomerName(customerId: string, name: string) {
        return this.customerTools.updateCustomerName(customerId, name)
    }

    // Availability Methods
    public async checkAvailability(
        salonId: string, 
        date: string, 
        professionalId?: string, 
        serviceId?: string, 
        serviceDuration?: number
    ) {
        return this.availabilityTools.checkAvailability(salonId, date, professionalId, serviceId, serviceDuration)
    }

    public async getProfessionalAvailabilityRules(salonId: string, professionalName: string) {
        return this.availabilityTools.getProfessionalAvailabilityRules(salonId, professionalName)
    }

    // Appointment Methods
    public async createAppointment(
        salonId: string, 
        professionalId: string, 
        phone: string, 
        serviceId: string, 
        date: string, 
        notes?: string
    ) {
        return this.appointmentTools.createAppointment(salonId, professionalId, phone, serviceId, date, notes)
    }

    public async updateAppointment(
        appointmentId: string,
        professionalId?: string,
        serviceId?: string,
        date?: string,
        notes?: string
    ) {
        return this.appointmentTools.updateAppointment(appointmentId, professionalId, serviceId, date, notes)
    }

    public async deleteAppointment(appointmentId: string) {
        return this.appointmentTools.deleteAppointment(appointmentId)
    }

    public async getCustomerUpcomingAppointments(salonId: string, customerPhone: string) {
        return this.appointmentTools.getCustomerUpcomingAppointments(salonId, customerPhone)
    }

    public async getMyFutureAppointments(salonId: string, clientId?: string, phone?: string) {
        return this.appointmentTools.getMyFutureAppointments(salonId, clientId, phone)
    }

    // Catalog Methods
    public async getServices(salonId: string, includeInactive?: boolean) {
        return this.catalogTools.getServices(salonId, includeInactive)
    }

    public async getProducts(salonId: string, includeInactive?: boolean) {
        return this.catalogTools.getProducts(salonId, includeInactive)
    }

    public async getProfessionals(salonId: string, includeInactive?: boolean) {
        return this.catalogTools.getProfessionals(salonId, includeInactive)
    }

    // Salon Methods
    public async getSalonDetails(salonId?: string) {
        return this.salonTools.getSalonDetails(salonId)
    }

    public async saveCustomerPreference(
        salonId: string, 
        customerId: string, 
        key: string, 
        value: string | number | boolean
    ) {
        return this.salonTools.saveCustomerPreference(salonId, customerId, key, value)
    }

    public async qualifyLead(
        salonId: string, 
        phoneNumber: string, 
        interest: "high" | "medium" | "low" | "none", 
        notes?: string
    ) {
        return this.salonTools.qualifyLead(salonId, phoneNumber, interest, notes)
    }

    public async hasGoogleCalendarIntegration(salonId: string): Promise<boolean> {
        return this.salonTools.hasGoogleCalendarIntegration(salonId)
    }
}
```

---

## Implementações das Tools Especializadas

### Arquivo: `src/tools/shared.ts`

```typescript
import { and, eq } from "drizzle-orm"
import { db, salonIntegrations } from "@repo/db"

export interface ActiveIntegrations {
    google: { isActive: boolean; email?: string } | null
    trinks: { isActive: boolean } | null
}

export async function getActiveIntegrations(salonId: string): Promise<ActiveIntegrations> {
    const [googleIntegration, trinksIntegration] = await Promise.all([
        db.query.salonIntegrations.findFirst({
            where: and(
                eq(salonIntegrations.salonId, salonId),
                eq(salonIntegrations.provider, 'google')
            ),
            columns: { isActive: true, email: true }
        }),
        db.query.salonIntegrations.findFirst({
            where: and(
                eq(salonIntegrations.salonId, salonId),
                eq(salonIntegrations.provider, 'trinks')
            ),
            columns: { isActive: true }
        })
    ])

    return {
        google: googleIntegration?.isActive ? { isActive: true, email: googleIntegration.email || undefined } : null,
        trinks: trinksIntegration?.isActive ? { isActive: true } : null
    }
}
```

### Arquivo: `src/tools/customer.tools.ts`

```typescript
import { and, eq } from "drizzle-orm"
import { db, profiles, customers } from "@repo/db"

export class CustomerTools {
    async identifyCustomer(phone: string, name?: string, salonId?: string): Promise<string> {
        const existing = await db.query.profiles.findFirst({
            where: eq(profiles.phone, phone),
            columns: { id: true, fullName: true, phone: true },
        })

        let profileId: string
        let created = false

        if (existing) {
            profileId = existing.id
        } else if (name) {
            const [newProfile] = await db
                .insert(profiles)
                .values({
                    phone,
                    fullName: name,
                    email: `${phone.replace(/\D/g, '')}@temp.com`,
                })
                .returning({ id: profiles.id, fullName: profiles.fullName, phone: profiles.phone })

            profileId = newProfile.id
            created = true
        } else {
            return JSON.stringify({ found: false })
        }

        return JSON.stringify({
            id: profileId,
            name: existing?.fullName || name,
            phone: existing?.phone || phone,
            found: !created,
            created: created,
        })
    }

    async createCustomer(phone: string, name: string, salonId?: string): Promise<string> {
        const existing = await db.query.profiles.findFirst({
            where: eq(profiles.phone, phone),
            columns: { id: true, fullName: true, phone: true },
        })

        let profileId: string
        let alreadyExists = false

        if (existing) {
            profileId = existing.id
            alreadyExists = true
        } else {
            const [newProfile] = await db
                .insert(profiles)
                .values({
                    phone,
                    fullName: name,
                    email: `${phone.replace(/\D/g, '')}@temp.com`,
                })
                .returning({ id: profiles.id, fullName: profiles.fullName, phone: profiles.phone })

            profileId = newProfile.id
        }

        if (salonId && phone) {
            const normalizedPhone = phone.replace(/\D/g, "")
            const existingCustomer = await db.query.customers.findFirst({
                where: and(
                    eq(customers.salonId, salonId),
                    eq(customers.phone, normalizedPhone)
                ),
                columns: { id: true },
            })

            if (!existingCustomer) {
                await db.insert(customers).values({
                    salonId,
                    name: existing?.fullName || name,
                    phone: normalizedPhone,
                })
            }
        }

        return JSON.stringify({
            id: profileId,
            name: existing?.fullName || name,
            phone: existing?.phone || phone,
            alreadyExists: alreadyExists,
            created: !alreadyExists,
            message: alreadyExists ? "Cliente já existe no sistema" : "Cliente criado com sucesso",
        })
    }

    async updateCustomerName(customerId: string, name: string): Promise<string> {
        if (!name || name.trim() === "") {
            throw new Error("Nome não pode ser vazio")
        }

        const trimmedName = name.trim()

        const customer = await db.query.customers.findFirst({
            where: eq(customers.id, customerId),
            columns: { id: true, name: true, phone: true },
        })

        if (!customer) {
            throw new Error(`Cliente com ID ${customerId} não encontrado`)
        }

        const [updatedCustomer] = await db
            .update(customers)
            .set({
                name: trimmedName,
                updatedAt: new Date(),
            })
            .where(eq(customers.id, customerId))
            .returning({
                id: customers.id,
                name: customers.name,
                phone: customers.phone,
            })

        return JSON.stringify({
            id: updatedCustomer.id,
            name: updatedCustomer.name,
            phone: updatedCustomer.phone,
            message: "Nome atualizado com sucesso",
        })
    }
}
```

### Arquivo: `src/tools/catalog.tools.ts`

```typescript
import { and, eq } from "drizzle-orm"
import { db, services, products, professionals, professionalServices } from "@repo/db"

export class CatalogTools {
    async getServices(salonId: string, includeInactive?: boolean): Promise<string> {
        const servicesList = await db
            .select({
                id: services.id,
                name: services.name,
                description: services.description,
                duration: services.duration,
                price: services.price,
                isActive: services.isActive,
            })
            .from(services)
            .where(
                and(
                    eq(services.salonId, salonId),
                    includeInactive ? undefined : eq(services.isActive, true)
                )
            )

        return JSON.stringify({
            services: servicesList.map((s) => ({
                ...s,
                price: s.price.toString(),
            })),
            message: `Encontrados ${servicesList.length} serviço(s) disponível(is)`,
        })
    }

    async getProducts(salonId: string, includeInactive?: boolean): Promise<string> {
        const productsList = await db
            .select({
                id: products.id,
                name: products.name,
                description: products.description,
                price: products.price,
                isActive: products.isActive,
            })
            .from(products)
            .where(
                and(
                    eq(products.salonId, salonId),
                    includeInactive ? undefined : eq(products.isActive, true)
                )
            )

        return JSON.stringify({
            products: productsList.map((p) => ({
                ...p,
                price: p.price.toString(),
            })),
            message: `Encontrados ${productsList.length} produto(s) disponível(is)`,
        })
    }

    async getProfessionals(salonId: string, includeInactive?: boolean): Promise<string> {
        const professionalsWithServices = await db
            .select({
                id: professionals.id,
                name: professionals.name,
                isActive: professionals.isActive,
                serviceName: services.name,
            })
            .from(professionals)
            .leftJoin(professionalServices, eq(professionals.id, professionalServices.professionalId))
            .leftJoin(services, eq(professionalServices.serviceId, services.id))
            .where(
                and(
                    eq(professionals.salonId, salonId),
                    includeInactive ? undefined : eq(professionals.isActive, true)
                )
            )

        const professionalsMap = new Map<
            string,
            { id: string; name: string; services: string[]; isActive: boolean }
        >()

        for (const row of professionalsWithServices) {
            if (!professionalsMap.has(row.id)) {
                professionalsMap.set(row.id, {
                    id: row.id,
                    name: row.name,
                    services: [],
                    isActive: row.isActive,
                })
            }

            const professional = professionalsMap.get(row.id)!
            if (row.serviceName) {
                professional.services.push(row.serviceName)
            }
        }

        const professionalsList = Array.from(professionalsMap.values())

        return JSON.stringify({
            professionals: professionalsList,
            message: `Encontrados ${professionalsList.length} profissional(is)`,
        })
    }
}
```

### Arquivo: `src/tools/salon.tools.ts`

```typescript
import { and, eq } from "drizzle-orm"
import { db, salons, customers, leads, salonIntegrations } from "@repo/db"

export class SalonTools {
    async getSalonDetails(salonId?: string): Promise<string> {
        if (!salonId) {
            throw new Error("salonId é obrigatório. Forneça como parâmetro.")
        }

        const salon = await db.query.salons.findFirst({
            where: eq(salons.id, salonId),
            columns: {
                id: true,
                name: true,
                address: true,
                phone: true,
                description: true,
                settings: true,
                workHours: true,
            },
        })

        if (!salon) {
            throw new Error(`Salão com ID ${salonId} não encontrado`)
        }

        const settings = (salon.settings as Record<string, unknown>) || {}
        const workHours = (salon.workHours as Record<string, { start: string; end: string }> | null) || null
        const cancellationPolicy = settings.cancellation_policy as string | undefined

        return JSON.stringify({
            id: salon.id,
            name: salon.name,
            address: salon.address || null,
            phone: salon.phone || null,
            description: salon.description || null,
            cancellationPolicy,
            businessHours: workHours,
            settings,
            message: "Informações do salão recuperadas com sucesso",
        })
    }

    async saveCustomerPreference(
        salonId: string, 
        customerId: string, 
        key: string, 
        value: string | number | boolean
    ): Promise<string> {
        let customer = await db.query.customers.findFirst({
            where: and(
                eq(customers.salonId, salonId),
                eq(customers.id, customerId)
            ),
            columns: { id: true, preferences: true },
        })

        if (!customer) {
            customer = await db.query.customers.findFirst({
                where: and(
                    eq(customers.salonId, salonId),
                    eq(customers.phone, customerId.replace(/\D/g, ""))
                ),
                columns: { id: true, preferences: true },
            })
        }

        const currentPreferences = (customer?.preferences as Record<string, unknown>) || {}

        const updatedPreferences = {
            ...currentPreferences,
            [key]: value,
        }

        if (customer) {
            await db
                .update(customers)
                .set({ 
                    preferences: updatedPreferences,
                    updatedAt: new Date()
                })
                .where(eq(customers.id, customer.id))
        } else {
            return JSON.stringify({
                error: "Cliente não encontrado no salão",
            })
        }

        return JSON.stringify({
            message: `Preferência "${key}" salva com sucesso para o cliente`,
        })
    }

    async qualifyLead(
        salonId: string, 
        phoneNumber: string, 
        interest: "high" | "medium" | "low" | "none", 
        notes?: string
    ): Promise<string> {
        let lead = await db.query.leads.findFirst({
            where: and(
                eq(leads.salonId, salonId),
                eq(leads.phoneNumber, phoneNumber)
            ),
            columns: { id: true },
        })

        const statusMap: Record<string, string> = {
            high: "recently_scheduled",
            medium: "new",
            low: "cold",
            none: "cold",
        }

        if (lead) {
            await db
                .update(leads)
                .set({
                    status: statusMap[interest] as any,
                    notes: notes || undefined,
                    lastContactAt: new Date(),
                })
                .where(eq(leads.id, lead.id))
        } else {
            await db.insert(leads).values({
                salonId,
                phoneNumber,
                status: statusMap[interest] as any,
                notes: notes || null,
                lastContactAt: new Date(),
            })
        }

        const interestMap: Record<string, string> = {
            high: "alto",
            medium: "médio",
            low: "baixo",
            none: "nenhum",
        }

        return JSON.stringify({
            message: `Lead qualificado com interesse ${interestMap[interest]}`,
        })
    }

    async hasGoogleCalendarIntegration(salonId: string): Promise<boolean> {
        const integration = await db.query.salonIntegrations.findFirst({
            where: eq(salonIntegrations.salonId, salonId),
            columns: { id: true, refreshToken: true },
        })

        return !!integration && !!integration.refreshToken
    }
}
```

---

## Utilitários

### Arquivo: `src/utils/date-format.utils.ts`

```typescript
export function ensureIsoWithTimezone(input: unknown): string {
  if (typeof input !== "string") {
    throw new Error(`Data inválida: esperava string, recebeu ${typeof input}`)
  }

  const s = input.trim()

  // Já tem timezone completo (Z ou ±HH:mm / ±HHmm)
  if (/(Z|[+-]\d{2}:?\d{2})$/.test(s)) return s

  // YYYY-MM-DDTHH:mm:ss → adiciona -03:00
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(s)) {
    return `${s}-03:00`
  }

  // YYYY-MM-DDTHH:mm → adiciona :00-03:00
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s)) {
    return `${s}:00-03:00`
  }

  // YYYY-MM-DD (só data) → adiciona T09:00:00-03:00
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    return `${s}T09:00:00-03:00`
  }

  throw new Error(
    `Formato de data não reconhecido: "${s}". Use ISO 8601 (ex: 2025-01-28T14:00:00-03:00)`
  )
}
```

### Arquivo: `src/utils/rate-limiter.ts`

```typescript
interface RateLimitConfig {
  windowMs: number
  max: number
}

interface RateLimitResult {
  allowed: boolean
  remaining: number
  resetAt: number
}

const requests = new Map<string, number[]>()
const CLEANUP_INTERVAL = 5 * 60 * 1000
let cleanupTimer: ReturnType<typeof setInterval> | null = null

function startCleanup(): void {
  if (cleanupTimer) return
  
  cleanupTimer = setInterval(() => {
    const now = Date.now()
    const maxAge = 10 * 60 * 1000
    
    for (const [key, timestamps] of requests.entries()) {
      const recent = timestamps.filter(t => now - t < maxAge)
      if (recent.length === 0) {
        requests.delete(key)
      } else {
        requests.set(key, recent)
      }
    }
  }, CLEANUP_INTERVAL)
  
  cleanupTimer.unref?.()
}

export function checkRateLimit(key: string, config: RateLimitConfig): RateLimitResult {
  startCleanup()
  
  const now = Date.now()
  const windowStart = now - config.windowMs
  
  const timestamps = requests.get(key) || []
  const recentRequests = timestamps.filter(t => t > windowStart)
  
  const allowed = recentRequests.length < config.max
  const remaining = Math.max(0, config.max - recentRequests.length - (allowed ? 1 : 0))
  const oldestInWindow = recentRequests[0] || now
  const resetAt = oldestInWindow + config.windowMs
  
  if (allowed) {
    recentRequests.push(now)
    requests.set(key, recentRequests)
  }
  
  return { allowed, remaining, resetAt }
}

export function assertRateLimit(key: string, config: RateLimitConfig): void {
  const result = checkRateLimit(key, config)
  
  if (!result.allowed) {
    const waitSeconds = Math.ceil((result.resetAt - Date.now()) / 1000)
    throw new Error(
      `Rate limit excedido. Máximo de ${config.max} requisições por ${config.windowMs / 1000}s. ` +
      `Tente novamente em ${waitSeconds}s.`
    )
  }
}

export const RATE_LIMITS = {
  CREATE_APPOINTMENT: { windowMs: 60_000, max: 10 },
  CHECK_AVAILABILITY: { windowMs: 60_000, max: 30 },
  UPDATE_APPOINTMENT: { windowMs: 60_000, max: 20 },
  DELETE_APPOINTMENT: { windowMs: 60_000, max: 10 },
} as const

export function clearRateLimitData(): void {
  requests.clear()
}
```

---

## Serviços

### Arquivo: `src/services/external-sync.ts`

```typescript
import { 
  createGoogleEvent, 
  updateGoogleEvent, 
  deleteGoogleEvent,
  logger 
} from '@repo/db'

export async function syncCreateAppointment(appointmentId: string): Promise<void> {
  try {
    logger.debug('Syncing appointment creation', { appointmentId })
    const result = await createGoogleEvent(appointmentId)
    
    if (result) {
      logger.info('Appointment synced to Google Calendar', { 
        appointmentId, 
        eventId: result.eventId 
      })
    } else {
      logger.debug('Google Calendar integration not configured', { appointmentId })
    }
  } catch (error) {
    logger.error(
      'Failed to sync appointment creation to Google Calendar',
      { appointmentId },
      error instanceof Error ? error : undefined
    )
  }
}

export async function syncUpdateAppointment(appointmentId: string): Promise<void> {
  try {
    logger.debug('Syncing appointment update', { appointmentId })
    const result = await updateGoogleEvent(appointmentId)
    
    if (result) {
      logger.info('Appointment update synced to Google Calendar', { 
        appointmentId, 
        eventId: result.eventId 
      })
    } else {
      logger.debug('Google Calendar integration not configured', { appointmentId })
    }
  } catch (error) {
    logger.error(
      'Failed to sync appointment update to Google Calendar',
      { appointmentId },
      error instanceof Error ? error : undefined
    )
  }
}

export async function syncDeleteAppointment(appointmentId: string): Promise<void> {
  try {
    logger.debug('Syncing appointment deletion', { appointmentId })
    const result = await deleteGoogleEvent(appointmentId)
    
    if (result === true) {
      logger.info('Appointment deletion synced to Google Calendar', { appointmentId })
    } else if (result === false) {
      logger.debug('No Google Calendar event to delete', { appointmentId })
    } else {
      logger.debug('Google Calendar integration not configured', { appointmentId })
    }
  } catch (error) {
    logger.error(
      'Failed to sync appointment deletion to Google Calendar',
      { appointmentId },
      error instanceof Error ? error : undefined
    )
  }
}
```

---

## Handlers do Google Calendar

### Arquivo: `src/handlers/BaseGoogleCalendarHandler.ts`

```typescript
export interface HandlerResult<T = unknown> {
  success: boolean
  data?: T
  error?: string
  googleSyncSuccess?: boolean
  googleSyncError?: string | null
}

export interface HandlerContext {
  salonId: string
  clientPhone: string
}

const ISO_DATETIME_WITH_TZ = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(Z|[+-]\d{2}:\d{2})$/
const ISO_DATETIME_WITHOUT_TZ = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/
const ISO_DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/

export function isValidIsoDateTime(val: string): boolean {
  return ISO_DATETIME_WITH_TZ.test(val) || ISO_DATETIME_WITHOUT_TZ.test(val)
}

export function isValidIsoDateOrDateTime(val: string): boolean {
  return ISO_DATE_ONLY.test(val) || isValidIsoDateTime(val)
}

export function hasTimezoneInDatetime(datetime: string): boolean {
  return ISO_DATETIME_WITH_TZ.test(datetime)
}

export abstract class BaseGoogleCalendarHandler<TInput, TOutput> {
  protected readonly salonId: string
  protected readonly clientPhone: string
  protected readonly sourceFile: string

  constructor(salonId: string, clientPhone: string, sourceFile: string) {
    this.salonId = salonId
    this.clientPhone = clientPhone
    this.sourceFile = sourceFile
  }

  abstract execute(input: TInput): Promise<TOutput>

  protected handleGoogleApiError(error: unknown, context?: string): never {
    if (this.isGaxiosError(error)) {
      const status = error.response?.status
      const errorData = error.response?.data as Record<string, unknown> | undefined

      if (errorData?.error === "invalid_grant") {
        throw new Error(
          "Token de autenticação inválido ou expirado. " +
            "Por favor, reconecte o Google Calendar nas configurações."
        )
      }

      if (status === 401) {
        throw new Error(
          "Não autorizado. O token de acesso expirou ou foi revogado."
        )
      }

      if (status === 403) {
        throw new Error(`Acesso negado`)
      }

      if (status === 404) {
        throw new Error(`Não encontrado`)
      }

      if (status === 429) {
        throw new Error(
          "Limite de requisições excedido. Por favor, aguarde alguns segundos."
        )
      }

      throw new Error(`Erro na API do Google Calendar: ${error.message}`)
    }

    if (error instanceof Error) {
      throw new Error(`Erro${context ? ` em ${context}` : ""}: ${error.message}`)
    }

    throw new Error(`Erro desconhecido${context ? ` em ${context}` : ""}`)
  }

  private isGaxiosError(error: unknown): error is { response?: { status?: number; data?: unknown }; message: string } {
    return (
      typeof error === "object" &&
      error !== null &&
      "response" in error
    )
  }

  protected normalizeDateTime(dateTime: string, timezone = "America/Sao_Paulo"): string {
    if (!dateTime) return dateTime

    if (hasTimezoneInDatetime(dateTime)) {
      return dateTime
    }

    if (ISO_DATETIME_WITHOUT_TZ.test(dateTime)) {
      return `${dateTime}-03:00`
    }

    if (ISO_DATE_ONLY.test(dateTime)) {
      return `${dateTime}T00:00:00-03:00`
    }

    return dateTime
  }

  protected extractDateOnly(dateTime: string): string {
    return dateTime.slice(0, 10)
  }

  protected parseDateTime(dateTime: string): Date {
    const normalized = this.normalizeDateTime(dateTime)
    return new Date(normalized)
  }

  protected logExecution(toolName: string, params: unknown, result: unknown, startTime: number): void {
    const duration = Date.now() - startTime
    console.log("\n🔨 [Tool Execution] " + toolName)
    console.log(`   📁 Arquivo: ${this.sourceFile}`)
    console.log(`   ⏱️ Duração: ${duration}ms`)
  }

  protected logWarning(message: string, data?: unknown): void {
    console.warn(`⚠️ [${this.constructor.name}] ${message}`, data || "")
  }

  protected logError(message: string, data?: unknown): void {
    console.error(`❌ [${this.constructor.name}] ${message}`, data || "")
  }
}
```

---

## Resumo das Tools

| Tool | Categoria | Descrição |
|------|-----------|-----------|
| `identifyCustomer` | Core | Identifica cliente pelo telefone |
| `createCustomer` | Core | Cria novo cliente |
| `updateCustomerName` | Core | Atualiza nome do cliente |
| `getServices` | Core | Lista serviços do salão |
| `getProducts` | Core | Lista produtos do salão |
| `getProfessionals` | Core | Lista profissionais do salão |
| `saveCustomerPreference` | Core | Salva preferência do cliente |
| `qualifyLead` | Core | Qualifica lead por interesse |
| `getMyFutureAppointments` | Core | Lista agendamentos futuros |
| `getProfessionalAvailabilityRules` | Core | Regras de disponibilidade |
| `checkAvailability` | Appointment | Verifica horários disponíveis |
| `addAppointment` | Appointment | Cria agendamento |
| `updateAppointment` | Appointment | Atualiza agendamento |
| `removeAppointment` | Appointment | Cancela agendamento |
| `google_checkAvailability` | Google | Verifica via Google Calendar |
| `google_createAppointment` | Google | Cria e sincroniza com Google |
| `google_updateAppointment` | Google | Atualiza e sincroniza com Google |
| `google_deleteAppointment` | Google | Remove do Google Calendar |
| `trinks_checkAvailability` | Trinks | Verifica via Trinks |
| `trinks_createAppointment` | Trinks | Cria e sincroniza com Trinks |
| `trinks_updateAppointment` | Trinks | Atualiza e sincroniza com Trinks |
| `trinks_deleteAppointment` | Trinks | Remove do Trinks |

---

**Fim do Backup**
