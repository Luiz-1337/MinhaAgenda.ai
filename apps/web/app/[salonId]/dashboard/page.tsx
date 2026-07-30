import { getDashboardStats } from "@/app/actions/dashboard"
import SoloDashboardContent from "./solo-dashboard-content"
import ProDashboardContent from "./pro-dashboard-content"

export default async function DashboardHomePage({
  params,
}: {
  params: Promise<{ salonId: string }>
}) {
  const { salonId } = await params

  const statsResult = await getDashboardStats(salonId)

  // Aqui havia um `after(() => initializeDashboardData(salonId))` que recalculava
  // ai_usage_stats/agent_stats a CADA abertura desta tela: varria TODAS as mensagens
  // do salão sem filtro de data e fazia 1 SELECT + 1 UPSERT sequenciais por par
  // (dia, modelo) — num salão com um ano de operação, ~2000 queries sequenciais por
  // visita, contra um banco a um oceano de distância.
  //
  // Reconciliação é trabalho de cron, não de request. Agora vive em
  // /api/cron/stats-sync, com a versão que agrega no SQL (stats-sync.service.ts).
  // E `debitSalonCredits` passou a gravar crédito PONDERADO, então o número certo
  // não depende mais de alguém abrir o dashboard.

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
