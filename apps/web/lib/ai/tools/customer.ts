/**
 * Tools para gerenciamento de clientes no sistema de IA
 * Permite que a IA reconheça clientes pelo WhatsApp (telefone) e aprenda sobre eles
 */

import { z } from "zod"
import { db, customers, and, eq } from "@repo/db"
import type { ToolDefinition } from "@/lib/services/ai/tools/tool-definition"

/**
 * Normaliza um número de telefone removendo caracteres especiais
 * Retorna apenas os dígitos numéricos
 */
function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, "")
}

/**
 * Tool para buscar um cliente pelo telefone e salão
 */
export function createLookupCustomerTool(): ToolDefinition {
  const paramsSchema = z.object({
    phone: z.string().describe("Número de telefone do cliente (aceita qualquer formato)"),
    salonId: z.string().uuid().describe("ID do salão"),
  })

  return {
    description: "Busca informações de um cliente pelo número de telefone. Retorna null se o cliente não for encontrado.",
    inputSchema: paramsSchema,
    execute: async ({ phone, salonId }: z.infer<typeof paramsSchema>) => {
      try {
        const normalizedPhone = normalizePhone(phone)

        const customer = await db.query.customers.findFirst({
          where: and(
            eq(customers.salonId, salonId),
            eq(customers.phone, normalizedPhone)
          ),
          columns: {
            id: true,
            name: true,
            phone: true,
            aiPreferences: true,
            createdAt: true,
            updatedAt: true,
          },
        })

        if (!customer) {
          return null
        }

        return {
          id: customer.id,
          name: customer.name,
          phone: customer.phone,
          aiPreferences: customer.aiPreferences || null,
          createdAt: customer.createdAt.toISOString(),
          updatedAt: customer.updatedAt.toISOString(),
        }
      } catch (error) {
        console.error("Erro ao buscar cliente:", error)
        throw new Error(`Erro ao buscar cliente: ${error instanceof Error ? error.message : "Erro desconhecido"}`)
      }
    },
  }
}

/**
 * Tool para registrar um novo cliente
 */
export function createRegisterCustomerTool(): ToolDefinition {
  const paramsSchema = z.object({
    phone: z.string().describe("Número de telefone do cliente (aceita qualquer formato)"),
    name: z.string().min(1).describe("Nome do cliente"),
    salonId: z.string().uuid().describe("ID do salão"),
  })

  return {
    description: "Registra um novo cliente no sistema. O telefone será normalizado automaticamente.",
    inputSchema: paramsSchema,
    execute: async ({ phone, name, salonId }: z.infer<typeof paramsSchema>) => {
      try {
        const normalizedPhone = normalizePhone(phone)

        // Verifica se o cliente já existe
        const existingCustomer = await db.query.customers.findFirst({
          where: and(
            eq(customers.salonId, salonId),
            eq(customers.phone, normalizedPhone)
          ),
        })

        if (existingCustomer) {
          return {
            id: existingCustomer.id,
            name: existingCustomer.name,
            phone: existingCustomer.phone,
            aiPreferences: existingCustomer.aiPreferences || null,
            createdAt: existingCustomer.createdAt.toISOString(),
            updatedAt: existingCustomer.updatedAt.toISOString(),
            message: "Cliente já existe no sistema",
          }
        }

        const [newCustomer] = await db.insert(customers).values({
          salonId,
          name,
          phone: normalizedPhone,
          aiPreferences: null,
        }).returning({
          id: customers.id,
          name: customers.name,
          phone: customers.phone,
          aiPreferences: customers.aiPreferences,
          createdAt: customers.createdAt,
          updatedAt: customers.updatedAt,
        })

        return {
          id: newCustomer.id,
          name: newCustomer.name,
          phone: newCustomer.phone,
          aiPreferences: newCustomer.aiPreferences || null,
          createdAt: newCustomer.createdAt.toISOString(),
          updatedAt: newCustomer.updatedAt.toISOString(),
        }
      } catch (error) {
        console.error("Erro ao registrar cliente:", error)
        throw new Error(`Erro ao registrar cliente: ${error instanceof Error ? error.message : "Erro desconhecido"}`)
      }
    },
  }
}

/**
 * Tool para atualizar as preferências/notas da IA sobre um cliente
 * IMPORTANTE: Esta função recebe o NOVO resumo completo das preferências
 * A IA deve concatenar ou resumir as preferências antes de chamar esta tool
 */
export function createUpdateCustomerPreferencesTool(): ToolDefinition {
  const paramsSchema = z.object({
    customerId: z.string().uuid().describe("ID do cliente"),
    preferences: z.string().describe("Resumo completo das preferências e informações sobre o cliente que a IA deve salvar"),
  })

  return {
    description: "Atualiza as preferências e notas da IA sobre um cliente. IMPORTANTE: Esta função substitui completamente o campo aiPreferences com o novo resumo fornecido. A IA deve concatenar ou resumir todas as preferências conhecidas antes de chamar esta tool.",
    inputSchema: paramsSchema,
    execute: async ({ customerId, preferences }: z.infer<typeof paramsSchema>) => {
      try {
        // Verifica se o cliente existe
        const customer = await db.query.customers.findFirst({
          where: eq(customers.id, customerId),
          columns: { id: true },
        })

        if (!customer) {
          throw new Error(`Cliente com ID ${customerId} não encontrado`)
        }

        const [updatedCustomer] = await db.update(customers)
          .set({
            aiPreferences: preferences,
            updatedAt: new Date(),
          })
          .where(eq(customers.id, customerId))
          .returning({
            id: customers.id,
            name: customers.name,
            phone: customers.phone,
            aiPreferences: customers.aiPreferences,
            updatedAt: customers.updatedAt,
          })

        return {
          id: updatedCustomer.id,
          name: updatedCustomer.name,
          phone: updatedCustomer.phone,
          aiPreferences: updatedCustomer.aiPreferences || null,
          updatedAt: updatedCustomer.updatedAt.toISOString(),
          message: "Preferências atualizadas com sucesso",
        }
      } catch (error) {
        console.error("Erro ao atualizar preferências do cliente:", error)
        throw new Error(`Erro ao atualizar preferências: ${error instanceof Error ? error.message : "Erro desconhecido"}`)
      }
    },
  }
}
