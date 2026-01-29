import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { db, agents, salons } from "@repo/db"
import { eq, and, ne } from "drizzle-orm"
import { hasSalonPermission } from "@/lib/services/permissions.service"
import { checkRateLimit } from "@/lib/redis"

const E164_REGEX = /^\+[1-9]\d{10,14}$/

function normalizeForCompare(phone: string): string {
  return phone.trim().replace(/\s/g, "").replace(/^whatsapp:/i, "")
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

    // Verifica se o número já está em uso por outro salão
    const existingAgent = await db.query.agents.findFirst({
      where: and(
        eq(agents.whatsappNumber, phone),
        ne(agents.salonId, salonId) // Pertence a outro salão
      ),
      columns: { id: true, salonId: true },
    })
    if (existingAgent) {
      return NextResponse.json(
        { success: false, error: "Este número já está conectado a outro salão" },
        { status: 409 }
      )
    }

    // Atualiza TODOS os agentes do salão com o novo número
    await db
      .update(agents)
      .set({
        whatsappNumber: phone,
        whatsappStatus: "verified",
        whatsappConnectedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(agents.salonId, salonId))

    return NextResponse.json({
      success: true,
      message: "WhatsApp conectado com sucesso!",
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Ocorreu um erro. Tente novamente ou contate o suporte."
    return NextResponse.json({ success: false, error: msg }, { status: 500 })
  }
}
