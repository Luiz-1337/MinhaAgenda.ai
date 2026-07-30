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
  // Semeia só a PRIMEIRA página: antes vinha a base inteira, com join de tags por
  // contato, dentro do HTML do RSC, para renderizar 20 linhas.
  const [customersRes, tagsRes] = await Promise.all([
    getSalonCustomers(salonId, { page: 1 }),
    getSalonTags(salonId),
  ])
  const initialPage =
    "error" in customersRes
      ? { rows: [], total: 0, page: 1, pageSize: 20 }
      : customersRes.data ?? { rows: [], total: 0, page: 1, pageSize: 20 }
  const initialTags = "error" in tagsRes ? [] : tagsRes.data ?? []

  return (
    <ContactsClient
      key={salonId}
      salonId={salonId}
      initialPage={initialPage}
      initialTags={initialTags}
    />
  )
}
