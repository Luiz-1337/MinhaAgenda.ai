import { getCurrentSalon } from "@/app/actions/salon"
import { getAgents } from "@/app/actions/agents"
import { AgentsClient } from "./agents-client"

export default async function AgentsPage({ params }: { params: Promise<{ salonId: string }> }) {
  const { salonId } = await params
  const salon = await getCurrentSalon(salonId)

  if ("error" in salon) {
    return (
      <div className="p-6 bg-white/60 dark:bg-slate-900/40 backdrop-blur-md rounded-2xl border border-slate-200 dark:border-white/5">
        <h2 className="text-xl font-bold text-slate-800 dark:text-white">Agentes</h2>
        <p className="mt-2 text-sm text-red-500">{salon.error}</p>
      </div>
    )
  }

  const agentsResult = await getAgents(salonId)
  const agents = "error" in agentsResult ? [] : agentsResult.data ?? []

  return <AgentsClient salonId={salonId} initialAgents={agents} />
}

