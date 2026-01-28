import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { db, agents } from "@repo/db"
import { eq, ne, and, isNotNull } from "drizzle-orm"
import { hasSalonPermission } from "@/lib/services/permissions.service"
import { registerSender } from "@/lib/services/twilio-whatsapp-senders.service"
import { checkRateLimit } from "@/lib/redis"

const E164_REGEX = /^\+[1-9]\d{10,14}$/

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
      columns: { id: true, salonId: true, name: true, whatsappNumber: true },
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

    let body: { phoneNumber?: string }
    try {
      body = await req.json()
    } catch {
      return NextResponse.json(
        { success: false, error: "Corpo da requisição inválido" },
        { status: 400 }
      )
    }

    const raw = body.phoneNumber?.trim()
    if (!raw || !E164_REGEX.test(raw)) {
      return NextResponse.json(
        { success: false, error: "Formato de número inválido. Use o formato +5511999999999" },
        { status: 400 }
      )
    }
    const phone = normalizeForCompare(raw)

    // Número já em outro agente?
    const existingAgent = await db.query.agents.findFirst({
      where: and(
        ne(agents.id, agentId),
        eq(agents.whatsappNumber, phone)
      ),
      columns: { id: true },
    })
    if (existingAgent) {
      return NextResponse.json(
        { success: false, error: "Este número já está conectado a outro agente" },
        { status: 409 }
      )
    }

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL
    const statusCallbackUrl = baseUrl
      ? `${String(baseUrl).replace(/\/$/, "")}/api/webhooks/twilio/whatsapp-status`
      : undefined

    const { sid, status } = await registerSender(phone, agent.name, statusCallbackUrl)

    await db
      .update(agents)
      .set({
        whatsappNumber: phone,
        whatsappStatus: "pending_verification",
        twilioSenderId: sid,
        whatsappConnectedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(agents.id, agentId))

    return NextResponse.json({
      success: true,
      status: "pending_verification",
      message:
        "Número registrado. Você receberá um SMS com um código. Use o botão 'Verificar' abaixo para completar.",
      verificationDetails: { twilioSenderId: sid, verificationMethod: "sms" },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Ocorreu um erro. Tente novamente ou contate o suporte."
    return NextResponse.json({ success: false, error: msg }, { status: 500 })
  }
}
