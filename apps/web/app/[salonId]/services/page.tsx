import ServiceList from "./service-list"

export default async function ServicesPage({
  params,
}: {
  params: Promise<{ salonId: string }>
}) {
  const { salonId } = await params
  return <ServiceList salonId={salonId} />
}

