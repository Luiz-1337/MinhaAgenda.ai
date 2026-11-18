import { ShieldOff } from "lucide-react"
import { getCareMessages } from "@/app/actions/care-messages"
import { CareMessagesClient } from "./care-messages-client"

/** Mensagens de cuidados e de retorno (docs/ROADMAP.md, fase 6, fatia 6d). */
export default async function CareMessagesPage({ params }: { params: Promise<{ salonId: string }> }) {
  const { salonId } = await params

  // A action confere sessão, módulo e permissão.
  const data = await getCareMessages(salonId)

  if ("error" in data) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3 text-center">
        <ShieldOff size={32} className="text-muted-foreground" />
        <h2 className="text-lg font-bold text-foreground">Cuidados e retorno indisponíveis</h2>
        <p className="text-sm text-muted-foreground max-w-sm">{data.error}</p>
      </div>
    )
  }

  return <CareMessagesClient salonId={salonId} data={data} />
}
