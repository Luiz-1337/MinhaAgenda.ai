"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { db, products, salons, asc, eq, and } from "@repo/db"
import { createClient } from "@/lib/supabase/server"
import { formatZodError, normalizeString, emptyStringToNull } from "@/lib/services/validation.service"
import type { ProductRow, UpsertProductInput, ProductPayload } from "@/lib/types/product"
import type { ActionResult } from "@/lib/types/common"

import { hasSalonPermission } from "@/lib/services/permissions.service"

const upsertProductSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(2),
  description: z.string().optional().or(z.literal("")),
  price: z.number().positive(),
  isActive: z.boolean().default(true),
})

export type { UpsertProductInput }

type ProductSelect = Pick<
  typeof products.$inferSelect,
  "id" | "salonId" | "name" | "description" | "price" | "isActive"
>

/**
 * Obtém todos os produtos de um salão
 */
export async function getProducts(salonId: string): Promise<ActionResult<ProductRow[]>> {
  try {
    if (!salonId) {
      return { error: "salonId é obrigatório" }
    }

    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return { error: "Unauthorized" }
    }

    // Permission Check: Verify if user has access to the salon (Owner/Manager)
    const hasAccess = await hasSalonPermission(salonId, user.id)

    if (!hasAccess) {
      return { error: "Acesso negado a este salão" }
    }

    const rows: ProductSelect[] = await db.query.products.findMany({
      where: eq(products.salonId, salonId),
      columns: {
        id: true,
        salonId: true,
        name: true,
        description: true,
        price: true,
        isActive: true,
      },
      orderBy: asc(products.name),
    })

    const formattedRows = rows.map((row) => ({
      id: row.id,
      salon_id: row.salonId,
      name: row.name,
      description: row.description ?? null,
      price: row.price ?? "0",
      is_active: row.isActive,
    }))

    return { success: true, data: formattedRows }
  } catch (error) {
    console.error("Erro ao buscar produtos:", error)
    return { error: "Falha ao buscar produtos." }
  }
}

/**
 * Prepara o payload do produto para inserção/atualização
 */
function prepareProductPayload(data: z.infer<typeof upsertProductSchema>): ProductPayload {
  return {
    name: normalizeString(data.name),
    description: emptyStringToNull(data.description),
    price: data.price.toFixed(2),
    isActive: data.isActive,
  }
}

/**
 * Cria ou atualiza um produto
 */
export async function upsertProduct(input: UpsertProductInput & { salonId: string }): Promise<ActionResult> {
  try {
    // 1. Auth Check
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return { error: "Unauthorized" }
    }

    // 2. Input Validation (Zod)
    const parsed = upsertProductSchema.safeParse(input)
    if (!parsed.success) {
      return { error: formatZodError(parsed.error) }
    }

    if (!input.salonId) {
      return { error: "salonId é obrigatório" }
    }

    // 3. Permission Check
    const hasAccess = await hasSalonPermission(input.salonId, user.id)

    if (!hasAccess) {
      return { error: "Acesso negado a este salão" }
    }

    // 4. DB Operation
    const payload = prepareProductPayload(parsed.data)
    let productId = parsed.data.id

    // Atualiza produto existente
    if (productId) {
      await db
        .update(products)
        .set(payload)
        .where(and(eq(products.id, productId), eq(products.salonId, input.salonId)))
    } else {
      // Cria novo produto
      const inserted = await db
        .insert(products)
        .values({ ...payload, salonId: input.salonId })
        .returning({ id: products.id })

      productId = inserted[0]?.id
    }

    if (!productId) {
      return { error: "Não foi possível salvar o produto" }
    }

    revalidatePath(`/${input.salonId}/products`)
    return { success: true, data: undefined }

  } catch (error) {
    console.error("Erro ao salvar produto:", error)
    return { error: "Falha ao salvar produto." }
  }
}

/**
 * Remove um produto definitivamente (hard delete)
 */
export async function deleteProduct(id: string, salonId: string): Promise<ActionResult> {
  try {
    // 1. Auth Check
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return { error: "Unauthorized" }
    }

    if (!salonId) {
      return { error: "salonId é obrigatório" }
    }

    // 2. Permission Check
    const hasAccess = await hasSalonPermission(salonId, user.id)

    if (!hasAccess) {
      return { error: "Acesso negado a este salão" }
    }

    // 3. DB Operation
    // Remove o produto definitivamente
    await db
      .delete(products)
      .where(and(eq(products.id, id), eq(products.salonId, salonId)))

    revalidatePath(`/${salonId}/products`)
    return { success: true, data: undefined }

  } catch (error) {
    console.error("Erro ao excluir produto:", error)
    return { error: "Falha ao excluir produto." }
  }
}

