/**
 * Factory para criação da tool de produtos (APPLICATION LAYER)
 */

import { tool } from "ai"
import { z } from "zod"
import { db, products, and, eq } from "@repo/db"

export class ProductsToolFactory {
  /**
   * Cria tool para buscar produtos do salão
   */
  static create(salonId: string) {
    return tool({
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
    })
  }
}
