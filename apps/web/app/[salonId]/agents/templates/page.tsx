import { getCurrentSalon } from "@/app/actions/salon"
import { getSystemPromptTemplates } from "@/app/actions/system-prompt-templates"
import { TemplatesClient } from "./templates-client"

export default async function TemplatesPage({ params }: { params: Promise<{ salonId: string }> }) {
  const { salonId } = await params
  const salon = await getCurrentSalon(salonId)

  if ("error" in salon) {
    return (
      <div className="p-6 bg-white/60 dark:bg-slate-900/40 backdrop-blur-md rounded-2xl border border-slate-200 dark:border-white/5">
        <h2 className="text-xl font-bold text-slate-800 dark:text-white">Templates de System Prompts</h2>
        <p className="mt-2 text-sm text-red-500">{salon.error}</p>
      </div>
    )
  }

  const templatesResult = await getSystemPromptTemplates(salonId)
  const templates = "error" in templatesResult ? [] : templatesResult.data ?? []

  return <TemplatesClient salonId={salonId} initialTemplates={templates} />
}

