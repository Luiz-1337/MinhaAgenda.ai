/**
 * Exporta todas as tools do MCP Server
 */

import type { Server } from "@modelcontextprotocol/sdk/server/index.js"
import { 
  ListToolsRequestSchema,
  CallToolRequestSchema 
} from "@modelcontextprotocol/sdk/types.js"
import { checkAvailabilityTool } from "./availability.tool.js"
import {
  createAppointmentTool,
  cancelAppointmentTool,
  rescheduleAppointmentTool,
  getCustomerUpcomingAppointmentsTool,
  getMyFutureAppointmentsTool,
} from "./appointments.tool.js"
import { getServicesTool } from "./services.tool.js"
import {
  saveCustomerPreferenceTool,
  qualifyLeadTool,
} from "./crm.tool.js"
import { getSalonDetailsTool } from "./salon.tool.js"
import { getProfessionalsTool } from "./professionals.tool.js"
import { getProfessionalAvailabilityRulesTool } from "./professional-availability-rules.tool.js"

/**
 * Registra todas as tools no servidor MCP
 */
export function registerTools(server: Server) {
  // Handler para listar tools
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        {
          name: "checkAvailability",
          description:
            "Verifica horários disponíveis para agendamento em um salão. Considera horários de trabalho, agendamentos existentes e duração do serviço.",
          inputSchema: {
            type: "object",
            properties: {
              salonId: {
                type: "string",
                format: "uuid",
                description: "ID do salão",
              },
              professionalId: {
                type: "string",
                format: "uuid",
                description: "ID do profissional (opcional)",
              },
              date: {
                type: "string",
                format: "date-time",
                description: "Data para verificar disponibilidade (ISO 8601)",
              },
              serviceId: {
                type: "string",
                format: "uuid",
                description: "ID do serviço para obter duração (opcional)",
              },
              serviceDuration: {
                type: "number",
                description: "Duração do serviço em minutos (opcional, padrão: 60)",
              },
            },
            required: ["salonId", "date"],
          },
        },
        {
          name: "createAppointment",
          description:
            "Cria um novo agendamento no sistema. Também cria evento no Google Calendar se houver integração ativa.",
          inputSchema: {
            type: "object",
            properties: {
              salonId: { type: "string", format: "uuid" },
              professionalId: { type: "string", format: "uuid" },
              clientId: { type: "string", format: "uuid" },
              serviceId: { type: "string", format: "uuid" },
              date: { type: "string", format: "date-time" },
              notes: { type: "string", description: "Notas adicionais (opcional)" },
            },
            required: ["salonId", "professionalId", "clientId", "serviceId", "date"],
          },
        },
        {
          name: "cancelAppointment",
          description: "Cancela um agendamento existente. Remove do Google Calendar se houver integração. IMPORTANTE: SEMPRE chame getMyFutureAppointments primeiro para obter o appointmentId. O usuário não fornece IDs diretamente - você deve inferir qual agendamento cancelar baseado na descrição fornecida (ex: 'o de terça-feira') usando a lista retornada por getMyFutureAppointments.",
          inputSchema: {
            type: "object",
            properties: {
              appointmentId: { 
                type: "string", 
                format: "uuid",
                description: "ID do agendamento obtido de getMyFutureAppointments. NUNCA peça ao usuário para fornecer este ID diretamente."
              },
              reason: { type: "string", description: "Motivo do cancelamento (opcional)" },
            },
            required: ["appointmentId"],
          },
        },
        {
          name: "getServices",
          description: "Busca lista de serviços disponíveis em um salão com preços e durações.",
          inputSchema: {
            type: "object",
            properties: {
              salonId: { type: "string", format: "uuid" },
              includeInactive: {
                type: "boolean",
                description: "Incluir serviços inativos (padrão: false)",
              },
            },
            required: ["salonId"],
          },
        },
        {
          name: "saveCustomerPreference",
          description:
            "Salva uma preferência do cliente no CRM do salão. Útil para armazenar informações extraídas da conversa (ex: alergias, preferências).",
          inputSchema: {
            type: "object",
            properties: {
              salonId: { type: "string", format: "uuid" },
              customerId: { type: "string", format: "uuid" },
              key: { type: "string", description: "Chave da preferência (ex: 'allergic_to_ammonia')" },
              value: {
                type: ["string", "number", "boolean", "array", "object"],
                description: "Valor da preferência",
              },
            },
            required: ["salonId", "customerId", "key", "value"],
          },
        },
        {
          name: "qualifyLead",
          description: "Qualifica um lead baseado no nível de interesse demonstrado.",
          inputSchema: {
            type: "object",
            properties: {
              salonId: { type: "string", format: "uuid" },
              phoneNumber: { type: "string", description: "Número de telefone do lead" },
              interest: {
                type: "string",
                enum: ["high", "medium", "low", "none"],
                description: "Nível de interesse",
              },
              notes: { type: "string", description: "Notas adicionais (opcional)" },
            },
            required: ["salonId", "phoneNumber", "interest"],
          },
        },
        {
          name: "rescheduleAppointment",
          description:
            "Reagenda um agendamento existente para uma nova data. Operação atômica: verifica disponibilidade, cancela o agendamento antigo e cria um novo. Retorna erro se o novo horário não estiver disponível. IMPORTANTE: SEMPRE chame getMyFutureAppointments primeiro para obter o appointmentId. O usuário não fornece IDs diretamente - você deve inferir qual agendamento reagendar baseado na descrição fornecida (ex: 'o de terça-feira') usando a lista retornada por getMyFutureAppointments.",
          inputSchema: {
            type: "object",
            properties: {
              appointmentId: { 
                type: "string", 
                format: "uuid",
                description: "ID do agendamento obtido de getMyFutureAppointments. NUNCA peça ao usuário para fornecer este ID diretamente."
              },
              newDate: { type: "string", format: "date-time", description: "Nova data/hora (ISO 8601)" },
            },
            required: ["appointmentId", "newDate"],
          },
        },
        {
          name: "getCustomerUpcomingAppointments",
          description:
            "Lista agendamentos futuros de um cliente pelo número de telefone. Crucial para responder perguntas como 'Quando é meu agendamento?'",
          inputSchema: {
            type: "object",
            properties: {
              salonId: { type: "string", format: "uuid" },
              customerPhone: { type: "string", description: "Número de telefone do cliente" },
            },
            required: ["salonId", "customerPhone"],
          },
        },
        {
          name: "getMyFutureAppointments",
          description:
            "Lista agendamentos futuros do cliente atual. Aceita clientId (injetado automaticamente) ou phone (se fornecido via contexto). Retorna uma lista formatada para exibição ao usuário e dados completos com IDs para uso interno da IA. Use esta tool SEMPRE antes de cancelar ou reagendar agendamentos para obter os IDs necessários.",
          inputSchema: {
            type: "object",
            properties: {
              salonId: { type: "string", format: "uuid", description: "ID do salão" },
              clientId: { 
                type: "string", 
                format: "uuid", 
                description: "ID do cliente (injetado automaticamente se disponível, opcional)" 
              },
              phone: { 
                type: "string", 
                description: "Número de telefone do cliente (opcional, use se clientId não estiver disponível)" 
              },
            },
            required: ["salonId"],
          },
        },
        {
          name: "getSalonDetails",
          description:
            "Retorna informações estáticas do salão: endereço, telefone, política de cancelamento, horários de funcionamento (business_hours) e outras configurações. O salonId é opcional - se não fornecido, será obtido do contexto.",
          inputSchema: {
            type: "object",
            properties: {
              salonId: { 
                type: "string", 
                format: "uuid",
                description: "ID do salão (opcional - será obtido do contexto se não fornecido)"
              },
            },
            required: [],
          },
        },
        {
          name: "getProfessionals",
          description:
            "Retorna lista de profissionais (barbeiros) do salão para mapear nomes a IDs.",
          inputSchema: {
            type: "object",
            properties: {
              salonId: { type: "string", format: "uuid" },
              includeInactive: {
                type: "boolean",
                description: "Incluir profissionais inativos (padrão: false)",
              },
            },
            required: ["salonId"],
          },
        },
        {
          name: "getProfessionalAvailabilityRules",
          description:
            "Verifica os turnos de trabalho de um profissional específico (ex: 'João trabalha terças e quintas?'). Retorna dias da semana e horários de turno (regras de trabalho), não slots livres. Use o nome do profissional para buscar.",
          inputSchema: {
            type: "object",
            properties: {
              salonId: { 
                type: "string", 
                format: "uuid",
                description: "ID do salão"
              },
              professionalName: {
                type: "string",
                description: "Nome do profissional (busca parcial, case-insensitive)",
              },
            },
            required: ["salonId", "professionalName"],
          },
        },
      ],
    }
  })

  // Handler para executar tools
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params

    try {
      switch (name) {
        case "checkAvailability":
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(await checkAvailabilityTool(server, args)),
              },
            ],
          }

        case "createAppointment":
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(await createAppointmentTool(server, args)),
              },
            ],
          }

        case "cancelAppointment":
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(await cancelAppointmentTool(server, args)),
              },
            ],
          }

        case "getServices":
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(await getServicesTool(server, args)),
              },
            ],
          }

        case "saveCustomerPreference":
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(await saveCustomerPreferenceTool(server, args)),
              },
            ],
          }

        case "qualifyLead":
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(await qualifyLeadTool(server, args)),
              },
            ],
          }

        case "rescheduleAppointment":
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(await rescheduleAppointmentTool(server, args)),
              },
            ],
          }

        case "getCustomerUpcomingAppointments":
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(await getCustomerUpcomingAppointmentsTool(server, args)),
              },
            ],
          }

        case "getMyFutureAppointments":
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(await getMyFutureAppointmentsTool(server, args)),
              },
            ],
          }

        case "getSalonDetails":
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(await getSalonDetailsTool(server, args)),
              },
            ],
          }

        case "getProfessionals":
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(await getProfessionalsTool(server, args)),
              },
            ],
          }

        case "getProfessionalAvailabilityRules":
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(await getProfessionalAvailabilityRulesTool(server, args)),
              },
            ],
          }

        default:
          throw new Error(`Tool desconhecida: ${name}`)
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ error: errorMessage }),
          },
        ],
        isError: true,
      }
    }
  })
}

