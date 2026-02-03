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

    // Permite que múltiplos agentes do mesmo salão compartilhem o número
    // Apenas verifica se já existe em OUTRO salão
    const existingAgent = await db.query.agents.findFirst({
      where: and(
        ne(agents.salonId, agent.salonId),
        eq(agents.whatsappNumber, phone)
      ),
      columns: { id: true },
    })
    if (existingAgent) {
      return NextResponse.json(
        { success: false, error: "Este número já está conectado a outro salão" },
        { status: 409 }
      )
    }

    // Para simplificar, usa o número Sandbox da Twilio
    // O número sandbox já está pré-aprovado e não requer verificação WABA
    const sandboxNumber = process.env.TWILIO_PHONE_NUMBER || "whatsapp:+14155238886"
    const normalizedSandbox = normalizeForCompare(sandboxNumber)

    // Atualiza o agente com o número sandbox (sem registro no Twilio, já está configurado)
    await db
      .update(agents)
      .set({
        whatsappNumber: normalizedSandbox,
        whatsappStatus: "verified", // Sandbox já está verificado
        twilioSenderId: null, // Não precisa de sender ID para sandbox
        whatsappConnectedAt: new Date(),
        whatsappVerifiedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(agents.id, agentId))

    return NextResponse.json({
      success: true,
      status: "verified",
      message: "WhatsApp conectado com sucesso! Use o número sandbox da Twilio para testes.",
      sandboxInfo: {
        number: sandboxNumber,
        instructions: `Para testar, envie uma mensagem para ${sandboxNumber} com o código "join <seu-codigo-sandbox>" primeiro.`
      }
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Ocorreu um erro. Tente novamente ou contate o suporte."
    return NextResponse.json({ success: false, error: msg }, { status: 500 })
  }
}
