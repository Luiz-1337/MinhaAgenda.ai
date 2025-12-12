#!/usr/bin/env node

/**
 * MCP Server para Minha Agenda AI
 * 
 * Este servidor expõe tools para gerenciamento de agendamentos, serviços,
 * disponibilidade e CRM através do Model Context Protocol.
 * 
 * Uso:
 *   node dist/index.js
 * 
 * Ou configure no Cursor/Claude Desktop:
 *   {
 *     "mcpServers": {
 *       "minhaagendaai": {
 *         "command": "node",
 *         "args": ["path/to/dist/index.js"]
 *       }
 *     }
 *   }
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { z } from "zod"
import { MinhaAgendaAITools } from "./MinhaAgendaAI_tools.js"

const minhaAgendaAITools = new MinhaAgendaAITools()

const server = new McpServer({
    name: "minhaagendaai-mcp-server",
    version: "0.1.0",
})

server.tool(
    "identifyCustomer",
    "Identifica um cliente pelo telefone. Se não encontrar e um nome for fornecido, cria um novo cliente. Retorna { id, name, found: true/false, created: true/false }.",
    {
        phone: z.string().describe("Telefone do cliente"),
        name: z.string().optional().describe("Nome do cliente (opcional, usado para criar se não existir)"),
    },
    async ({ phone, name }) => {
        const resultMessage = await minhaAgendaAITools.identifyCustomer(phone, name)
        return {
            content: [{ type: "text", text: resultMessage }]
        }
    }
)

server.tool(
    "checkAvailability",
    "Verifica horários disponíveis para agendamento em um salão. Considera horários de trabalho, agendamentos existentes e duração do serviço.",
    {
        salonId: z.string().uuid("salonId deve ser um UUID válido").describe("ID do salão"),
        professionalId: z.string().uuid("professionalId deve ser um UUID válido").optional().describe("ID do profissional (opcional)"),
        date: z.string().datetime("date deve ser uma data ISO válida").describe("Data para verificar disponibilidade (ISO 8601)"),
        serviceId: z.string().uuid("serviceId deve ser um UUID válido").optional().describe("ID do serviço para obter duração (opcional)"),
        serviceDuration: z.number().int().positive("serviceDuration deve ser um número positivo").optional().describe("Duração do serviço em minutos (opcional, padrão: 60)"),
    },
    async ({ salonId, date, professionalId, serviceId, serviceDuration }) => {
        const resultMessage = await minhaAgendaAITools.checkAvailability(salonId, date, professionalId, serviceId, serviceDuration)
        return {
            content: [{ type: "text", text: resultMessage }]
        }
    }
)

server.tool(
    "createAppointment",
    "Cria um novo agendamento no sistema. Também cria evento no Google Calendar se houver integração ativa.",
    {
        salonId: z.string().uuid("salonId deve ser um UUID válido"),
        professionalId: z.string().uuid("professionalId deve ser um UUID válido"),
        phone: z.string().min(1, "phone é obrigatório").describe("Telefone do cliente"),
        serviceId: z.string().uuid("serviceId deve ser um UUID válido"),
        date: z.string().datetime("date deve ser uma data ISO válida"),
        notes: z.string().optional().describe("Notas adicionais (opcional)"),
    },
    async ({ salonId, professionalId, phone, serviceId, date, notes }) => {
        const resultMessage = await minhaAgendaAITools.createAppointment(salonId, professionalId, phone, serviceId, date, notes)
        return {
            content: [{ type: "text", text: resultMessage }]
        }
    }
)

server.tool(
    "cancelAppointment",
    "Cancela um agendamento existente. Remove do Google Calendar se houver integração. IMPORTANTE: SEMPRE chame getMyFutureAppointments primeiro para obter o appointmentId. O usuário não fornece IDs diretamente - você deve inferir qual agendamento cancelar baseado na descrição fornecida (ex: 'o de terça-feira') usando a lista retornada por getMyFutureAppointments.",
    {
        appointmentId: z.string().uuid("appointmentId deve ser um UUID válido. Obtenha-o chamando getMyFutureAppointments primeiro.").describe("ID do agendamento obtido de getMyFutureAppointments. NUNCA peça ao usuário para fornecer este ID diretamente."),
        reason: z.string().optional().describe("Motivo do cancelamento (opcional)"),
    },
    async ({ appointmentId, reason }) => {
        const resultMessage = await minhaAgendaAITools.cancelAppointment(appointmentId, reason)
        return {
            content: [{ type: "text", text: resultMessage }]
        }
    }
)

server.tool(
    "getServices",
    "Busca lista de serviços disponíveis em um salão com preços e durações.",
    {
        salonId: z.string().uuid("salonId deve ser um UUID válido"),
        includeInactive: z.boolean().default(false).optional().describe("Incluir serviços inativos (padrão: false)"),
    },
    async ({ salonId, includeInactive }) => {
        const resultMessage = await minhaAgendaAITools.getServices(salonId, includeInactive)
        return {
            content: [{ type: "text", text: resultMessage }]
        }
    }
)

server.tool(
    "saveCustomerPreference",
    "Salva uma preferência do cliente no CRM do salão. Útil para armazenar informações extraídas da conversa (ex: alergias, preferências).",
    {
        salonId: z.string().uuid("salonId deve ser um UUID válido"),
        customerId: z.string().uuid("customerId deve ser um UUID válido"),
        key: z.string().min(1, "key é obrigatória").describe("Chave da preferência (ex: 'allergic_to_ammonia')"),
        value: z.union([
            z.string(),
            z.number(),
            z.boolean()
        ]).describe("Valor da preferência (texto, número ou booleano)"),
    },
    async ({ salonId, customerId, key, value }) => {
        const resultMessage = await minhaAgendaAITools.saveCustomerPreference(salonId, customerId, key, value)
        return {
            content: [{ type: "text", text: resultMessage }]
        }
    }
)

server.tool(
    "qualifyLead",
    "Qualifica um lead baseado no nível de interesse demonstrado.",
    {
        salonId: z.string().uuid("salonId deve ser um UUID válido"),
        phoneNumber: z.string().min(1, "phoneNumber é obrigatório").describe("Número de telefone do lead"),
        interest: z.enum(["high", "medium", "low", "none"]).describe("Nível de interesse"),
        notes: z.string().optional().describe("Notas adicionais (opcional)"),
    },
    async ({ salonId, phoneNumber, interest, notes }) => {
        const resultMessage = await minhaAgendaAITools.qualifyLead(salonId, phoneNumber, interest, notes)
        return {
            content: [{ type: "text", text: resultMessage }]
        }
    }
)

server.tool(
    "rescheduleAppointment",
    "Reagenda um agendamento existente para uma nova data. Operação atômica: verifica disponibilidade, cancela o agendamento antigo e cria um novo. Retorna erro se o novo horário não estiver disponível. IMPORTANTE: SEMPRE chame getMyFutureAppointments primeiro para obter o appointmentId. O usuário não fornece IDs diretamente - você deve inferir qual agendamento reagendar baseado na descrição fornecida (ex: 'o de terça-feira') usando a lista retornada por getMyFutureAppointments.",
    {
        appointmentId: z.string().uuid("appointmentId deve ser um UUID válido. Obtenha-o chamando getMyFutureAppointments primeiro.").describe("ID do agendamento obtido de getMyFutureAppointments. NUNCA peça ao usuário para fornecer este ID diretamente."),
        newDate: z.string().datetime("newDate deve ser uma data ISO válida").describe("Nova data/hora (ISO 8601)"),
    },
    async ({ appointmentId, newDate }) => {
        const resultMessage = await minhaAgendaAITools.rescheduleAppointment(appointmentId, newDate)
        return {
            content: [{ type: "text", text: resultMessage }]
        }
    }
)

server.tool(
    "getCustomerUpcomingAppointments",
    "Lista agendamentos futuros de um cliente pelo número de telefone. Crucial para responder perguntas como 'Quando é meu agendamento?'",
    {
        salonId: z.string().uuid("salonId deve ser um UUID válido"),
        customerPhone: z.string().min(1, "customerPhone é obrigatório").describe("Número de telefone do cliente"),
    },
    async ({ salonId, customerPhone }) => {
        const resultMessage = await minhaAgendaAITools.getCustomerUpcomingAppointments(salonId, customerPhone)
        return {
            content: [{ type: "text", text: resultMessage }]
        }
    }
)

server.tool(
    "getMyFutureAppointments",
    "Lista agendamentos futuros do cliente atual. Aceita clientId (injetado automaticamente) ou phone (se fornecido via contexto). Retorna uma lista formatada para exibição ao usuário e dados completos com IDs para uso interno da IA. Use esta tool SEMPRE antes de cancelar ou reagendar agendamentos para obter os IDs necessários.",
    {
        salonId: z.string().uuid("salonId deve ser um UUID válido").describe("ID do salão"),
        clientId: z.string().uuid("clientId deve ser um UUID válido").optional().describe("ID do cliente (injetado automaticamente se disponível, opcional)"),
        phone: z.string().min(1, "phone deve ser fornecido se clientId não estiver disponível").optional().describe("Número de telefone do cliente (opcional, use se clientId não estiver disponível)"),
    },
    async ({ salonId, clientId, phone }) => {
        const resultMessage = await minhaAgendaAITools.getMyFutureAppointments(salonId, clientId, phone)
        return {
            content: [{ type: "text", text: resultMessage }]
        }
    }
)

server.tool(
    "getSalonDetails",
    "Retorna informações estáticas do salão: endereço, telefone, política de cancelamento, horários de funcionamento (business_hours) e outras configurações. O salonId é opcional - se não fornecido, será obtido do contexto.",
    {
        salonId: z.string().uuid("salonId deve ser um UUID válido").optional().describe("ID do salão (opcional - será obtido do contexto se não fornecido)"),
    },
    async ({ salonId }) => {
        const resultMessage = await minhaAgendaAITools.getSalonDetails(salonId)
        return {
            content: [{ type: "text", text: resultMessage }]
        }
    }
)

server.tool(
    "getProfessionals",
    "Retorna lista de profissionais (barbeiros) do salão para mapear nomes a IDs.",
    {
        salonId: z.string().uuid("salonId deve ser um UUID válido"),
        includeInactive: z.boolean().default(false).optional().describe("Incluir profissionais inativos (padrão: false)"),
    },
    async ({ salonId, includeInactive }) => {
        const resultMessage = await minhaAgendaAITools.getProfessionals(salonId, includeInactive)
        return {
            content: [{ type: "text", text: resultMessage }]
        }
    }
)

server.tool(
    "getProfessionalAvailabilityRules",
    "Verifica os turnos de trabalho de um profissional específico (ex: 'João trabalha terças e quintas?'). Retorna dias da semana e horários de turno (regras de trabalho), não slots livres. Use o nome do profissional para buscar.",
    {
        salonId: z.string().uuid("salonId deve ser um UUID válido").describe("ID do salão"),
        professionalName: z.string().min(1, "professionalName é obrigatório").describe("Nome do profissional (busca parcial, case-insensitive)"),
    },
    async ({ salonId, professionalName }) => {
        const resultMessage = await minhaAgendaAITools.getProfessionalAvailabilityRules(salonId, professionalName)
        return {
            content: [{ type: "text", text: resultMessage }]
        }
    }
)

async function main() {
    try {
        const transport = new StdioServerTransport()
        await server.connect(transport)
        console.log("Connected and all tools are registered.")
    } catch (e) {
        console.error("Failed to start server:", e)
        process.exit(1)
    }
}

main().catch(console.error)
