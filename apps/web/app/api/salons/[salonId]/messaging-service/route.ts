import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { db, salons } from "@repo/db"
import { eq } from "drizzle-orm"
import { hasSalonPermission } from "@/lib/services/permissions.service"
import {
  getOrCreateMessagingService,
  getMessagingServiceInfo,
  listServiceSenders,
} from "@/lib/services/twilio-messaging-service.service"

/**
 * GET - Obtém informações do Messaging Service do salão
 */
export async function GET(
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

    const hasAccess = await hasSalonPermission(salonId, user.id)
    if (!hasAccess) {
      return NextResponse.json({ success: false, error: "Acesso negado" }, { status: 403 })
    }

    const serviceInfo = await getMessagingServiceInfo(salonId)
    
    if (!serviceInfo) {
      return NextResponse.json({
        success: true,
        data: null,
        message: "Nenhum Messaging Service configurado",
      })
    }

    const senders = await listServiceSenders(salonId)

    return NextResponse.json({
      success: true,
      data: {
        ...serviceInfo,
        senders,
      },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro ao buscar Messaging Service"
    return NextResponse.json({ success: false, error: msg }, { status: 500 })
  }
}

/**
 * POST - Cria ou obtém o Messaging Service do salão
 */
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

    const hasAccess = await hasSalonPermission(salonId, user.id)
    if (!hasAccess) {
      return NextResponse.json({ success: false, error: "Acesso negado" }, { status: 403 })
    }

    // Verifica se o salão tem subaccount configurada
    const salon = await db.query.salons.findFirst({
      where: eq(salons.id, salonId),
      columns: { twilioSubaccountSid: true },
    })

    if (!salon?.twilioSubaccountSid) {
      return NextResponse.json(
        { success: false, error: "Configure a conexão WhatsApp primeiro" },
        { status: 400 }
      )
    }

    const serviceSid = await getOrCreateMessagingService(salonId)

    return NextResponse.json({
      success: true,
      data: { serviceSid },
      message: "Messaging Service configurado com sucesso",
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro ao criar Messaging Service"
    return NextResponse.json({ success: false, error: msg }, { status: 500 })
  }
}
