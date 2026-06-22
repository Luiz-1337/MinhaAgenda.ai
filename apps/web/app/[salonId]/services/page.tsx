import ServiceList from "./service-list"
import { getServices } from "@/app/actions/services"
import { getProfessionals } from "@/app/actions/professionals"

export default async function ServicesPage({
  params,
}: {
  params: Promise<{ salonId: string }>
}) {
  const { salonId } = await params

  // Busca inicial no servidor (paralelo) — entregue no HTML, sem fetch pós-hidratação.
  const [servicesRes, profsRes] = await Promise.all([
    getServices(salonId),
    getProfessionals(salonId),
  ])

  const initialServices = "error" in servicesRes ? [] : servicesRes.data ?? []
  const initialProfessionals = "error" in profsRes ? [] : profsRes

  return (
    <ServiceList
      key={salonId}
      salonId={salonId}
      initialServices={initialServices}
      initialProfessionals={initialProfessionals}
    />
  )
}
