import { getCurrentProfile } from "@/app/actions/profile"
import { getTrinksIntegration, getTrinksProfilesStats } from "@/app/actions/integrations"
import { IntegrationsClient } from "./integrations-client"

export default async function IntegrationsPage({
  params,
}: {
  params: Promise<{ salonId: string }>
}) {
  const { salonId } = await params

  // Tudo buscado no servidor EM PARALELO — elimina o waterfall profile→trinks→stats.
  const [profileRes, trinksRes, statsRes] = await Promise.all([
    getCurrentProfile(),
    getTrinksIntegration(salonId),
    getTrinksProfilesStats(salonId),
  ])

  const initialProfile = "error" in profileRes ? null : profileRes
  const initialTrinksStatus = "error" in trinksRes ? null : trinksRes.data ?? null
  const initialTrinksStats = "error" in statsRes ? null : statsRes.data ?? null

  return (
    <IntegrationsClient
      key={salonId}
      salonId={salonId}
      initialProfile={initialProfile}
      initialTrinksStatus={initialTrinksStatus}
      initialTrinksStats={initialTrinksStats}
    />
  )
}
