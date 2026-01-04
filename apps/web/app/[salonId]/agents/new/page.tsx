import { redirect } from "next/navigation"
import { getCurrentSalon } from "@/app/actions/salon"
import { getAgent } from "@/app/actions/agents"
import { AgentForm } from "../components/agent-form"

export default async function NewAgentPage({
  params,
  searchParams,
}: {
  params: Promise<{ salonId: string }>
  searchParams: Promise<{ duplicate?: string }>
}) {
  const { salonId } = await params
  const { duplicate } = await searchParams
  const salon = await getCurrentSalon(salonId)

  if ("error" in salon) {
    redirect(`/${salonId}/agents`)
  }

  // Se há um ID para duplicar, busca o agente
  let duplicateAgent = null
  if (duplicate) {
    const agentResult = await getAgent(salonId, duplicate)
    if ("error" in agentResult || !agentResult.data) {
      // Se não encontrar o agente, apenas ignora e cria um novo
      redirect(`/${salonId}/agents/new`)
    } else {
      duplicateAgent = agentResult.data
    }
  }

  return (
    <div className="h-full">
      <AgentForm
        salonId={salonId}
        mode="create"
        initialData={
          duplicateAgent
            ? {
                name: `${duplicateAgent.name} (cópia)`,
                systemPrompt: duplicateAgent.systemPrompt,
                model: duplicateAgent.model as "gpt-5.2" | "gpt-5.1" | "gpt-5-mini" | "gpt-5-nano" | "gpt-4.1" | "gpt-4o-mini",
                tone: duplicateAgent.tone,
                whatsappNumber: duplicateAgent.whatsappNumber ?? "",
                isActive: false, // Sempre false para duplicação
              }
            : undefined
        }
      />
    </div>
  )
}

