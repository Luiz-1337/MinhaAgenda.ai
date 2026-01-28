import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { db, agents } from "@repo/db"
import { eq } from "drizzle-orm"
import { hasSalonPermission } from "@/lib/services/permissions.service"
import { verifySender } from "@/lib/services/twilio-whatsapp-senders.service"
import { checkRateLimit } from "@/lib/redis"

function normalizeForCompare(phone: string): string {
  return phone.trim().replace(/\s/g, "").replace(/^whatsapp:/i, "")
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ agentId: string }> }
) {
  try {
    const { agentId } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ success: false, error: "Não autenticado" }, { status: 401 })
    }

    const agent = await db.query.agents.findFirst({
      where: eq(agents.id, agentId),
      columns: { 
        id: true, 
        salonId: true, 
        whatsappNumber: true,
        whatsappStatus: true,
        twilioSenderId: true,
      },
    })
    if (!agent) {
      return NextResponse.json({ success: false, error: "Agente não encontrado" }, { status: 404 })
    }

    const hasAccess = await hasSalonPermission(agent.salonId, user.id)
    if (!hasAccess) {
      return NextResponse.json({ success: false, error: "Acesso negado a este salão" }, { status: 403 })
    }

    try {
      const rl = await checkRateLimit(`whatsapp:connect:${user.id}`, 5, 60)
      if (!rl.allowed) {
        return NextResponse.json(
          { success: false, error: "Muitas tentativas. Aguarde um minuto." },
          { status: 429 }
        )
      }
    } catch {
      // Redis falhou: segue sem rate limit
    }

    let body: { phoneNumber?: string; verificationCode?: string }
    try {
      body = await req.json()
    } catch {
      return NextResponse.json(
        { success: false, error: "Corpo da requisição inválido" },
        { status: 400 }
      )
    }

    const phone = body.phoneNumber?.trim() ? normalizeForCompare(body.phoneNumber.trim()) : ""
    const code = body.verificationCode?.trim()
    if (!phone) {
      return NextResponse.json({ success: false, error: "phoneNumber é obrigatório" }, { status: 400 })
    }
    if (!code) {
      return NextResponse.json({ success: false, error: "verificationCode é obrigatório" }, { status: 400 })
    }

    // Verifica se o número corresponde ao número conectado
    if (!agent.whatsappNumber || normalizeForCompare(agent.whatsappNumber) !== phone) {
      return NextResponse.json(
        { success: false, error: "Este número não está conectado a este agente" },
        { status: 404 }
      )
    }

    const status = (agent.whatsappStatus ?? "").toLowerCase()
    if (status !== "pending_verification" && status !== "verifying") {
      return NextResponse.json(
        { success: false, error: "Este número não está aguardando verificação" },
        { status: 400 }
      )
    }
    if (!agent.twilioSenderId) {
      return NextResponse.json(
        { success: false, error: "Dados de verificação incompletos para este número" },
        { status: 400 }
      )
    }

    await verifySender(agent.twilioSenderId, code)

    await db
      .update(agents)
      .set({ 
        whatsappStatus: "verifying", 
        updatedAt: new Date() 
      })
      .where(eq(agents.id, agentId))

    return NextResponse.json({
      success: true,
      status: "verifying",
      message: "Código enviado. O status será atualizado quando a verificação for concluída.",
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Ocorreu um erro. Tente novamente ou contate o suporte."
    return NextResponse.json({ success: false, error: msg }, { status: 500 })
  }
}
