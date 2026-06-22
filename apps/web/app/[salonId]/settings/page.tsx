import { getCurrentProfile } from "@/app/actions/profile"
import { SettingsClient } from "./settings-client"

export default async function SettingsPage({
  params,
}: {
  params: Promise<{ salonId: string }>
}) {
  const { salonId } = await params

  // Perfil buscado no servidor — entregue no HTML, sem fetch pós-hidratação.
  const profile = await getCurrentProfile()

  if ("error" in profile) {
    return (
      <div className="py-8 text-center text-muted-foreground">
        Erro ao carregar dados do perfil.
      </div>
    )
  }

  return <SettingsClient profile={profile} salonId={salonId} />
}
