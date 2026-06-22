import ProductList from "./product-list"
import { getProducts } from "@/app/actions/products"

export default async function ProductsPage({
  params,
}: {
  params: Promise<{ salonId: string }>
}) {
  const { salonId } = await params

  // Busca inicial no servidor — entregue no HTML, sem fetch pós-hidratação.
  const productsRes = await getProducts(salonId)
  const initialProducts = "error" in productsRes ? [] : productsRes.data ?? []

  return <ProductList key={salonId} salonId={salonId} initialProducts={initialProducts} />
}
