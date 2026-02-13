/**
 * Factory para criação da tool de produtos (APPLICATION LAYER)
 */

import { z } from "zod"
import { db, products, and, eq } from "@repo/db"
import type { ToolDefinition } from "./tool-definition"

export class ProductsToolFactory {
  /**
   * Cria tool para buscar produtos do salão
   */
  static create(salonId: string): ToolDefinition {
    return {
      description: "Lista os produtos disponíveis no salão com seus preços.",
      inputSchema: z.object({}),
      execute: async () => {
        const results = await db
          .select({
            name: products.name,
            description: products.description,
            price: products.price,
          })
          .from(products)
          .where(and(eq(products.salonId, salonId), eq(products.isActive, true)))

        return { products: results }
      },
    }
  }
}
