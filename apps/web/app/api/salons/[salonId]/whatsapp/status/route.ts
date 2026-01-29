import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { db, agents, salons } from "@repo/db"
import { eq } from "drizzle-orm"
import { hasSalonPermission } from "@/lib/services/permissions.service"

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ salonId: string }> }
) {
  try {
    const { salonId } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
    }

    // Verifica se o salão existe
    const salon = await db.query.salons.findFirst({
      where: eq(salons.id, salonId),
      columns: { id: true },
    })
    if (!salon) {
      return NextResponse.json({ error: "Salão não encontrado" }, { status: 404 })
    }

    const hasAccess = await hasSalonPermission(salonId, user.id)
    if (!hasAccess) {
      return NextResponse.json({ error: "Acesso negado a este salão" }, { status: 403 })
    }

    // Busca qualquer agente do salão para obter o WhatsApp (todos devem ter o mesmo número)
    const agent = await db.query.agents.findFirst({
      where: eq(agents.salonId, salonId),
      columns: {
        whatsappNumber: true,
        whatsappConnectedAt: true,
      },
    })

    // Retorna array para manter compatibilidade com o frontend
    const numbers = agent?.whatsappNumber
      ? [{
          phoneNumber: agent.whatsappNumber,
          connectedAt: agent.whatsappConnectedAt?.toISOString() ?? "",
        }]
      : []

    return NextResponse.json({ numbers })
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Ocorreu um erro. Tente novamente ou contate o suporte."
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
