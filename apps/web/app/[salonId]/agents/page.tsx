import { getCurrentSalon } from "@/app/actions/salon"
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

  const settings = (salon.settings ?? {}) as unknown as Record<string, unknown>
  const agentConfig = (settings?.agent_config ?? {}) as Record<string, unknown>

  const system_instructions = typeof agentConfig.system_instructions === "string" ? agentConfig.system_instructions : ""
  const tone = agentConfig.tone === "formal" ? "formal" : "informal"
  const isActive = typeof agentConfig.isActive === "boolean" ? agentConfig.isActive : false

  return (
    <AgentsClient
      salonId={salonId}
      initialAgentConfig={{ system_instructions, tone, isActive }}
    />
  )
}

