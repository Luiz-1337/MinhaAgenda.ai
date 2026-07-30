import { notFound } from "next/navigation"
import { getCustomerDetail } from "@/app/actions/customers"
import CustomerDetailClient from "./customer-detail-client"

export default async function CustomerDetailPage({
  params,
}: {
  params: Promise<{ salonId: string; customerId: string }>
}) {
  const { salonId, customerId } = await params

  // RSC entrega a ficha no HTML — sem fetch pós-hidratação. A action faz um único
  // Promise.all; com o banco em us-west-2 o que pesa é o número de idas.
  const res = await getCustomerDetail(salonId, customerId)

  // Contato inexistente e contato de OUTRO salão caem no mesmo 404 de propósito:
  // distinguir os dois contaria a um estranho que aquele id existe.
  if ("error" in res || !res.data) notFound()

  return <CustomerDetailClient key={customerId} salonId={salonId} initialDetail={res.data} />
}
