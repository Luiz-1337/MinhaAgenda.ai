import { getDashboardStats, initializeDashboardData } from "@/app/actions/dashboard"
import DashboardContent from "./DashboardContent"

export default async function DashboardHomePage({
  params,
}: {
  params: Promise<{ salonId: string }>
}) {
  const { salonId } = await params

  // Busca dados em paralelo
  const statsResult = await getDashboardStats(salonId)

  // Inicializa dados em background (não bloqueia renderização)
  initializeDashboardData(salonId).catch(console.error)
  
  if ("error" in statsResult) {
    return (
      <div className="flex items-center justify-center p-8">
        <p className="text-destructive">Erro ao carregar dados: {statsResult.error}</p>
      </div>
    )
  }

  return <DashboardContent stats={statsResult} />
}

