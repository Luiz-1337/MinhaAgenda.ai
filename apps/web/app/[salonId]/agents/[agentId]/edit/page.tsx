import { redirect } from "next/navigation"
import { getCurrentSalon } from "@/app/actions/salon"
import { getAgent } from "@/app/actions/agents"
import { AgentForm } from "../../components/agent-form"

export default async function EditAgentPage({
  params,
}: {
  params: Promise<{ salonId: string; agentId: string }>
}) {
  const { salonId, agentId } = await params
  const salon = await getCurrentSalon(salonId)

  if ("error" in salon) {
    redirect(`/${salonId}/agents`)
  }

  const agentResult = await getAgent(salonId, agentId)

  if ("error" in agentResult || !agentResult.data) {
    redirect(`/${salonId}/agents`)
  }

  const agent = agentResult.data

  return (
    <div className="h-full">
      <AgentForm
        salonId={salonId}
        mode="edit"
        initialData={{
          id: agent.id,
          name: agent.name,
          systemPrompt: agent.systemPrompt,
          model: agent.model as "gpt-5-mini",
          tone: agent.tone,
          isActive: agent.isActive,
        }}
      />
    </div>
  )
}

