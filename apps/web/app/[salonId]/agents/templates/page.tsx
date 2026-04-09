import { getCurrentSalon } from "@/app/actions/salon"
import { getSystemPromptTemplates } from "@/app/actions/system-prompt-templates"
import { TemplatesClient } from "./templates-client"

export default async function TemplatesPage({ params }: { params: Promise<{ salonId: string }> }) {
  const { salonId } = await params
  const salon = await getCurrentSalon(salonId)

  if ("error" in salon) {
    return (
      <div className="p-6 bg-card rounded-md border border-border">
        <h2 className="text-xl font-bold text-foreground">Templates de System Prompts</h2>
        <p className="mt-2 text-sm text-red-600 dark:text-red-400">{salon.error}</p>
      </div>
    )
  }

  const templatesResult = await getSystemPromptTemplates(salonId)
  const templates = "error" in templatesResult ? [] : templatesResult.data ?? []

  return <TemplatesClient salonId={salonId} initialTemplates={templates} />
}

