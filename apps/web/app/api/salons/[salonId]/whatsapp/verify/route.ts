import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { db, agents, salons } from "@repo/db"
import { eq } from "drizzle-orm"
import { hasSalonPermission } from "@/lib/services/permissions.service"
import { checkRateLimit } from "@/lib/redis"
import { getSubaccountClient } from "@/lib/services/twilio-subaccount.service"
import { verifySenderWithClient } from "@/lib/services/twilio-whatsapp-senders.service"

interface VerifyRequestBody {
  verificationCode?: string
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ salonId: string }> }
) {
  try {
    const { salonId } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ success: false, error: "Não autenticado" }, { status: 401 })
    }

    // Verifica se o salão existe
    const salon = await db.query.salons.findFirst({
      where: eq(salons.id, salonId),
      columns: { id: true, name: true },
    })
    if (!salon) {
      return NextResponse.json({ success: false, error: "Salão não encontrado" }, { status: 404 })
    }

    const hasAccess = await hasSalonPermission(salonId, user.id)
    if (!hasAccess) {
      return NextResponse.json({ success: false, error: "Acesso negado a este salão" }, { status: 403 })
    }

    // Rate limit mais restritivo para verificação (3 tentativas por minuto)
    try {
      const rl = await checkRateLimit(`whatsapp:verify:${salonId}`, 3, 60)
      if (!rl.allowed) {
        return NextResponse.json(
          { success: false, error: "Muitas tentativas. Aguarde um minuto antes de tentar novamente." },
          { status: 429 }
        )
      }
    } catch {
      // Redis falhou: segue sem rate limit
    }

    let body: VerifyRequestBody
    try {
      body = await req.json()
    } catch {
      return NextResponse.json(
        { success: false, error: "Corpo da requisição inválido" },
        { status: 400 }
      )
    }

    const code = body.verificationCode?.trim()
    if (!code || !/^\d{6}$/.test(code)) {
      return NextResponse.json(
        { success: false, error: "Código de verificação inválido. Digite os 6 dígitos recebidos por SMS." },
        { status: 400 }
      )
    }

    // Busca um agente do salão para obter o twilioSenderId
    const agent = await db.query.agents.findFirst({
      where: eq(agents.salonId, salonId),
      columns: {
        twilioSenderId: true,
        whatsappStatus: true,
      },
    })

    if (!agent?.twilioSenderId) {
      return NextResponse.json(
        { success: false, error: "Nenhum número WhatsApp pendente de verificação encontrado." },
        { status: 400 }
      )
    }

    if (agent.whatsappStatus === "verified") {
      return NextResponse.json(
        { success: false, error: "Este número já foi verificado." },
        { status: 400 }
      )
    }

    // Obtém o cliente Twilio da subaccount do salão
    const subClient = await getSubaccountClient(salonId)
    if (!subClient) {
      return NextResponse.json(
        { success: false, error: "Subaccount Twilio não encontrada. Reconecte o WhatsApp." },
        { status: 400 }
      )
    }

    // Envia o código de verificação para a Twilio
    const newStatus = await verifySenderWithClient(subClient, agent.twilioSenderId, code)

    // Mapeia status Twilio para status interno
    const internalStatus = newStatus === "ONLINE" ? "verified" : "verifying"

    // Atualiza TODOS os agentes do salão
    await db
      .update(agents)
      .set({
        whatsappStatus: internalStatus,
        whatsappVerifiedAt: internalStatus === "verified" ? new Date() : null,
        updatedAt: new Date(),
      })
      .where(eq(agents.salonId, salonId))

    if (internalStatus === "verified") {
      return NextResponse.json({
        success: true,
        status: "verified",
        message: "WhatsApp verificado com sucesso! Seu número está pronto para uso.",
      })
    }

    return NextResponse.json({
      success: true,
      status: internalStatus,
      twilioStatus: newStatus,
      message: "Código enviado. Aguardando confirmação da Twilio.",
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Ocorreu um erro. Tente novamente ou contate o suporte."
    return NextResponse.json({ success: false, error: msg }, { status: 500 })
  }
}
