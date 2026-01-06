import ProductList from "./ProductList"

export default async function ProductsPage({
  params,
}: {
  params: Promise<{ salonId: string }>
}) {
  const { salonId } = await params
  return <ProductList salonId={salonId} />
}

