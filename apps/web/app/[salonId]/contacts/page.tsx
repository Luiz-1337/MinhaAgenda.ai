import ContactsClient from "./contacts-client"
import { getSalonCustomers } from "@/app/actions/customers"
import { getSalonTags } from "@/app/actions/customer-tags"

export default async function ContactsPage({
  params,
}: {
  params: Promise<{ salonId: string }>
}) {
  const { salonId } = await params

  // Busca inicial no servidor — entregue no HTML, sem fetch pós-hidratação (sem cold-start).
  const [customersRes, tagsRes] = await Promise.all([
    getSalonCustomers(salonId),
    getSalonTags(salonId),
  ])
  const initialCustomers = "error" in customersRes ? [] : customersRes.data ?? []
  const initialTags = "error" in tagsRes ? [] : tagsRes.data ?? []

  return (
    <ContactsClient
      key={salonId}
      salonId={salonId}
      initialCustomers={initialCustomers}
      initialTags={initialTags}
    />
  )
}
