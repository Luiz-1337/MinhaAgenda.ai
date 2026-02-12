"use server"

import { createClient } from "@/lib/supabase/server"
import { db, customers, eq, desc, and } from "@repo/db"
import { ActionResult } from "@/lib/types/common"

import { hasSalonPermission } from "@/lib/services/permissions.service"

export type CustomerRow = {
  id: string
  salonId: string
  name: string
  email: string | null
  phone: string | null
  preferences: Record<string, unknown> | null
  createdAt: string
  updatedAt: string
}

/**
 * Obtém todos os clientes de um salão
 */
export async function getSalonCustomers(salonId: string): Promise<ActionResult<CustomerRow[]>> {
  try {
    if (!salonId) {
      return { error: "salonId é obrigatório" }
    }

    // 1. Auth Check
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return { error: "Não autenticado" }
    }

    // 2. Permission Check
    // Verifica se o usuário tem acesso ao salão (Owner ou Manager)
    const hasAccess = await hasSalonPermission(salonId, user.id)

    if (!hasAccess) {
      return { error: "Acesso negado a este salão" }
    }

    // 3. DB Operation
    // Busca os clientes do salão diretamente da tabela customers
    const customersList = await db
      .select({
        id: customers.id,
        salonId: customers.salonId,
        name: customers.name,
        email: customers.email,
        phone: customers.phone,
        preferences: customers.preferences,
        createdAt: customers.createdAt,
        updatedAt: customers.updatedAt,
      })
      .from(customers)
      .where(eq(customers.salonId, salonId))
      .orderBy(desc(customers.updatedAt))

    const mappedCustomers = customersList.map((customer) => ({
      id: customer.id,
      salonId: customer.salonId,
      name: customer.name,
      email: customer.email || null,
      phone: customer.phone || null,
      preferences: customer.preferences as Record<string, unknown> | null,
      createdAt: customer.createdAt.toISOString(),
      updatedAt: customer.updatedAt.toISOString(),
    }))

    return { success: true, data: mappedCustomers }

  } catch (error) {
    console.error("Erro ao buscar clientes:", error)
    return { error: "Falha ao buscar clientes." }
  }
}

export type CreateSalonCustomerInput = {
  salonId: string
  name: string
  phone: string
  email?: string
  preferences?: string
}

/**
 * Cria um novo contato no salão
 */
export async function createSalonCustomer(
  input: CreateSalonCustomerInput
): Promise<ActionResult<CustomerRow>> {
  try {
    // 1. Validação de entrada
    if (!input.salonId || !input.name || !input.phone) {
      return { error: "Salão, nome e telefone são obrigatórios" }
    }

    if (input.name.trim().length < 2) {
      return { error: "Nome deve ter pelo menos 2 caracteres" }
    }

    // Validação básica de email se fornecido
    if (input.email && input.email.trim() && !input.email.includes("@")) {
      return { error: "E-mail inválido" }
    }

    // 2. Auth Check
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return { error: "Não autenticado" }
    }

    // 3. Permission Check
    const hasAccess = await hasSalonPermission(input.salonId, user.id)

    if (!hasAccess) {
      return { error: "Acesso negado a este salão" }
    }

    // 4. Normaliza telefone
    const normalizedPhone = input.phone.replace(/\D/g, "") // Remove caracteres não numéricos

    // 5. Prepara preferências
    const preferencesData: Record<string, unknown> | null = input.preferences?.trim()
      ? { notes: input.preferences.trim() }
      : null

    // 6. Verifica se já existe customer com este telefone no salão
    const existingCustomer = await db.query.customers.findFirst({
      where: and(
        eq(customers.salonId, input.salonId),
        eq(customers.phone, normalizedPhone)
      ),
      columns: { id: true, name: true, email: true, preferences: true },
    })

    let customerId: string

    if (existingCustomer) {
      // Cliente já existe, atualiza os dados
      const updates: {
        name?: string
        email?: string | null
        preferences?: Record<string, unknown> | null
      } = {}

      if (input.name.trim() !== existingCustomer.name) {
        updates.name = input.name.trim()
      }

      const emailToSet = input.email?.trim() || null
      if (emailToSet !== existingCustomer.email) {
        updates.email = emailToSet
      }

      if (preferencesData) {
        const currentPreferences = (existingCustomer.preferences as Record<string, unknown>) || {}
        updates.preferences = {
          ...currentPreferences,
          ...preferencesData,
        }
      }

      if (Object.keys(updates).length > 0) {
        await db
          .update(customers)
          .set({
            ...updates,
            updatedAt: new Date(),
          })
          .where(eq(customers.id, existingCustomer.id))
      }

      customerId = existingCustomer.id
    } else {
      // Cria novo customer
      const [newCustomer] = await db
        .insert(customers)
        .values({
          salonId: input.salonId,
          name: input.name.trim(),
          phone: normalizedPhone,
          email: input.email?.trim() || null,
          preferences: preferencesData,
        })
        .returning({ id: customers.id })

      customerId = newCustomer.id
    }

    // 7. Busca o cliente criado/atualizado para retornar
    const createdCustomer = await db.query.customers.findFirst({
      where: eq(customers.id, customerId),
      columns: {
        id: true,
        salonId: true,
        name: true,
        email: true,
        phone: true,
        preferences: true,
        createdAt: true,
        updatedAt: true,
      },
    })

    if (!createdCustomer) {
      return { error: "Falha ao recuperar contato criado" }
    }

    const mappedCustomer: CustomerRow = {
      id: createdCustomer.id,
      salonId: createdCustomer.salonId,
      name: createdCustomer.name,
      email: createdCustomer.email || null,
      phone: createdCustomer.phone || null,
      preferences: createdCustomer.preferences as Record<string, unknown> | null,
      createdAt: createdCustomer.createdAt.toISOString(),
      updatedAt: createdCustomer.updatedAt.toISOString(),
    }

    return { success: true, data: mappedCustomer }
  } catch (error) {
    console.error("Erro ao criar contato:", error)
    return { error: "Falha ao criar contato." }
  }
}

/**
 * Remove um contato do salão
 */
export async function deleteSalonCustomer(
  customerId: string,
  salonId: string
): Promise<ActionResult> {
  try {
    // 1. Validação de entrada
    if (!customerId || !salonId) {
      return { error: "ID do contato e do salão são obrigatórios" }
    }

    // 2. Auth Check
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return { error: "Não autenticado" }
    }

    // 3. Permission Check
    const hasAccess = await hasSalonPermission(salonId, user.id)

    if (!hasAccess) {
      return { error: "Acesso negado a este salão" }
    }

    // 4. Verifica se o contato existe e pertence ao salão
    const existingCustomer = await db.query.customers.findFirst({
      where: and(
        eq(customers.id, customerId),
        eq(customers.salonId, salonId)
      ),
      columns: { id: true },
    })

    if (!existingCustomer) {
      return { error: "Contato não encontrado ou não pertence a este salão" }
    }

    // 5. Remove o registro de customers
    await db.delete(customers).where(eq(customers.id, customerId))

    return { success: true }
  } catch (error) {
    console.error("Erro ao remover contato:", error)
    return { error: "Falha ao remover contato." }
  }
}

export type UpdateSalonCustomerInput = {
  customerId: string
  salonId: string
  name?: string
  phone?: string
  email?: string
  preferences?: string
}

/**
 * Atualiza um contato existente no salão
 */
export async function updateSalonCustomer(
  input: UpdateSalonCustomerInput
): Promise<ActionResult<CustomerRow>> {
  try {
    // 1. Validação de entrada
    if (!input.customerId || !input.salonId) {
      return { error: "ID do contato e do salão são obrigatórios" }
    }

    // 2. Auth Check
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return { error: "Não autenticado" }
    }

    // 3. Permission Check
    const hasAccess = await hasSalonPermission(input.salonId, user.id)

    if (!hasAccess) {
      return { error: "Acesso negado a este salão" }
    }

    // 4. Verifica se o contato existe e pertence ao salão
    const existingCustomer = await db.query.customers.findFirst({
      where: and(
        eq(customers.id, input.customerId),
        eq(customers.salonId, input.salonId)
      ),
      columns: {
        id: true,
        name: true,
        phone: true,
        email: true,
        preferences: true,
      },
    })

    if (!existingCustomer) {
      return { error: "Contato não encontrado ou não pertence a este salão" }
    }

    // 5. Prepara os dados para atualização
    const updates: {
      name?: string
      phone?: string
      email?: string | null
      preferences?: Record<string, unknown> | null
      updatedAt?: Date
    } = {}

    if (input.name !== undefined && input.name.trim() !== existingCustomer.name) {
      if (input.name.trim().length < 2) {
        return { error: "Nome deve ter pelo menos 2 caracteres" }
      }
      updates.name = input.name.trim()
    }

    if (input.phone !== undefined) {
      const normalizedPhone = input.phone.replace(/\D/g, "")
      if (normalizedPhone !== existingCustomer.phone) {
        if (!normalizedPhone) {
          return { error: "Telefone é obrigatório" }
        }
        updates.phone = normalizedPhone
      }
    }

    if (input.email !== undefined) {
      const emailToSet = input.email.trim() || null
      if (emailToSet && !emailToSet.includes("@")) {
        return { error: "E-mail inválido" }
      }
      if (emailToSet !== existingCustomer.email) {
        updates.email = emailToSet
      }
    }

    if (input.preferences !== undefined) {
      const preferencesData: Record<string, unknown> | null = input.preferences.trim()
        ? { notes: input.preferences.trim() }
        : null

      // Mescla com preferências existentes se houver
      const currentPreferences = (existingCustomer.preferences as Record<string, unknown>) || {}
      updates.preferences = preferencesData
        ? { ...currentPreferences, ...preferencesData }
        : null
    }

    // 6. Atualiza apenas se houver mudanças
    if (Object.keys(updates).length > 0) {
      updates.updatedAt = new Date()
      await db
        .update(customers)
        .set(updates)
        .where(eq(customers.id, input.customerId))
    }

    // 7. Busca o contato atualizado para retornar
    const updatedCustomer = await db.query.customers.findFirst({
      where: eq(customers.id, input.customerId),
      columns: {
        id: true,
        salonId: true,
        name: true,
        email: true,
        phone: true,
        preferences: true,
        createdAt: true,
        updatedAt: true,
      },
    })

    if (!updatedCustomer) {
      return { error: "Falha ao recuperar contato atualizado" }
    }

    const mappedCustomer: CustomerRow = {
      id: updatedCustomer.id,
      salonId: updatedCustomer.salonId,
      name: updatedCustomer.name,
      email: updatedCustomer.email || null,
      phone: updatedCustomer.phone || null,
      preferences: updatedCustomer.preferences as Record<string, unknown> | null,
      createdAt: updatedCustomer.createdAt.toISOString(),
      updatedAt: updatedCustomer.updatedAt.toISOString(),
    }

    return { success: true, data: mappedCustomer }
  } catch (error) {
    console.error("Erro ao atualizar contato:", error)
    return { error: "Falha ao atualizar contato." }
  }
}