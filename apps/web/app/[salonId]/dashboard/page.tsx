import { after } from "next/server"
import { getDashboardStats, initializeDashboardData } from "@/app/actions/dashboard"
import SoloDashboardContent from "./solo-dashboard-content"
import ProDashboardContent from "./pro-dashboard-content"

export default async function DashboardHomePage({
  params,
}: {
  params: Promise<{ salonId: string }>
}) {
  const { salonId } = await params

  const statsResult = await getDashboardStats(salonId)

  // Sincronização de uso roda APÓS a resposta (rastreada pelo runtime),
  // em vez de um promise solto competindo com o fim do render.
  after(() => initializeDashboardData(salonId).catch(console.error))

  if ("error" in statsResult) {
    return (
      <div className="flex items-center justify-center p-8">
        <p className="text-destructive">Erro ao carregar dados: {statsResult.error}</p>
      </div>
    )
  }

  // Decisão de plano feita no servidor (planTier já vem do RSC).
  return statsResult.planTier === "SOLO" ? (
    <SoloDashboardContent stats={statsResult} salonId={salonId} />
  ) : (
    <ProDashboardContent stats={statsResult} />
  )
}
