import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { db, agents } from "@repo/db"
import { eq } from "drizzle-orm"
import { hasSalonPermission } from "@/lib/services/permissions.service"

/** Mapeia status (nosso enum ou Twilio) para o contrato da API */
function mapStatus(s: string): "verified" | "pending_verification" | "verifying" | "failed" {
  const v = (s || "").toLowerCase()
  if (["verified", "pending_verification", "verifying", "failed"].includes(v))
    return v as "verified" | "pending_verification" | "verifying" | "failed"
  const u = (s || "").toUpperCase()
  if (u === "ONLINE") return "verified"
  if (["PENDING_VERIFICATION", "CREATING"].includes(u)) return "pending_verification"
  if (u === "VERIFYING") return "verifying"
  return "failed"
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ agentId: string }> }
) {
  try {
    const { agentId } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
    }

    const agent = await db.query.agents.findFirst({
      where: eq(agents.id, agentId),
      columns: { salonId: true, whatsappNumbers: true },
    })
    if (!agent) {
      return NextResponse.json({ error: "Agente não encontrado" }, { status: 404 })
    }

    const hasAccess = await hasSalonPermission(agent.salonId, user.id)
    if (!hasAccess) {
      return NextResponse.json({ error: "Acesso negado a este salão" }, { status: 403 })
    }

    const arr = Array.isArray(agent.whatsappNumbers) ? agent.whatsappNumbers : []
    const numbers = arr.map((e: { phoneNumber?: string; status?: string; connectedAt?: string; verifiedAt?: string }) => ({
      phoneNumber: e?.phoneNumber ?? "",
      status: mapStatus(e?.status ?? ""),
      connectedAt: e?.connectedAt ?? "",
      ...(e?.verifiedAt ? { verifiedAt: e.verifiedAt } : {}),
    }))

    return NextResponse.json({ numbers })
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Ocorreu um erro. Tente novamente ou contate o suporte."
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
