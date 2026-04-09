import { getCurrentSalon } from "@/app/actions/salon"
import { getAgents } from "@/app/actions/agents"
import { AgentsClient } from "./agents-client"

export default async function AgentsPage({ params }: { params: Promise<{ salonId: string }> }) {
  const { salonId } = await params
  const salon = await getCurrentSalon(salonId)

  if ("error" in salon) {
    return (
      <div className="p-6 bg-card rounded-md border border-border">
        <h2 className="text-xl font-bold text-foreground">Agentes</h2>
        <p className="mt-2 text-sm text-red-600 dark:text-red-400">{salon.error}</p>
      </div>
    )
  }

  const agentsResult = await getAgents(salonId)
  const agents = "error" in agentsResult ? [] : agentsResult.data ?? []

  return <AgentsClient salonId={salonId} initialAgents={agents} />
}

