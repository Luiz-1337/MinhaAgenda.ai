import TeamClient from "./team-client"
import { getProfessionals } from "@/app/actions/professionals"

export default async function TeamPage({
  params,
}: {
  params: Promise<{ salonId: string }>
}) {
  const { salonId } = await params

  // Busca inicial no servidor — entregue no HTML, sem fetch pós-hidratação (sem cold-start).
  const res = await getProfessionals(salonId)
  const initialProfessionals = Array.isArray(res) ? res : []

  return (
    <TeamClient
      key={salonId}
      salonId={salonId}
      initialProfessionals={initialProfessionals}
    />
  )
}
