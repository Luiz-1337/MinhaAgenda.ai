import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { db, whatsappTemplates } from "@repo/db"
import { eq } from "drizzle-orm"
import { hasSalonPermission } from "@/lib/services/permissions.service"
import {
  syncTemplateApprovalStatus,
  submitSalonTemplateForApproval,
  deleteSalonTemplate,
} from "@/lib/services/twilio-content.service"

/**
 * GET - Obtém um template específico com status atualizado
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ salonId: string; templateId: string }> }
) {
  try {
    const { salonId, templateId } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      return NextResponse.json({ success: false, error: "Não autenticado" }, { status: 401 })
    }

    const hasAccess = await hasSalonPermission(salonId, user.id)
    if (!hasAccess) {
      return NextResponse.json({ success: false, error: "Acesso negado" }, { status: 403 })
    }

    // Busca o template
    const template = await db.query.whatsappTemplates.findFirst({
      where: eq(whatsappTemplates.id, templateId),
    })

    if (!template || template.salonId !== salonId) {
      return NextResponse.json(
        { success: false, error: "Template não encontrado" },
        { status: 404 }
      )
    }

    // Se está pendente, sincroniza o status
    if (template.status === "pending" && template.twilioContentSid) {
      try {
        const approvalStatus = await syncTemplateApprovalStatus(salonId, templateId)
        return NextResponse.json({
          success: true,
          data: {
            ...template,
            status: approvalStatus.status,
            rejectionReason: approvalStatus.rejectionReason,
          },
        })
      } catch {
        // Se falhar a sincronização, retorna o status atual
      }
    }

    return NextResponse.json({
      success: true,
      data: template,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro ao buscar template"
    return NextResponse.json({ success: false, error: msg }, { status: 500 })
  }
}

/**
 * POST - Submete o template para aprovação do WhatsApp
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ salonId: string; templateId: string }> }
) {
  try {
    const { salonId, templateId } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      return NextResponse.json({ success: false, error: "Não autenticado" }, { status: 401 })
    }

    const hasAccess = await hasSalonPermission(salonId, user.id)
    if (!hasAccess) {
      return NextResponse.json({ success: false, error: "Acesso negado" }, { status: 403 })
    }

    // Verifica se o template existe e é do salão
    const template = await db.query.whatsappTemplates.findFirst({
      where: eq(whatsappTemplates.id, templateId),
    })

    if (!template || template.salonId !== salonId) {
      return NextResponse.json(
        { success: false, error: "Template não encontrado" },
        { status: 404 }
      )
    }

    if (template.status === "approved") {
      return NextResponse.json(
        { success: false, error: "Este template já foi aprovado" },
        { status: 400 }
      )
    }

    if (template.status === "pending") {
      return NextResponse.json(
        { success: false, error: "Este template já está aguardando aprovação" },
        { status: 400 }
      )
    }

    await submitSalonTemplateForApproval(salonId, templateId)

    return NextResponse.json({
      success: true,
      message: "Template submetido para aprovação. A revisão geralmente leva de minutos a algumas horas.",
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro ao submeter template"
    return NextResponse.json({ success: false, error: msg }, { status: 500 })
  }
}

/**
 * DELETE - Remove um template
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ salonId: string; templateId: string }> }
) {
  try {
    const { salonId, templateId } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      return NextResponse.json({ success: false, error: "Não autenticado" }, { status: 401 })
    }

    const hasAccess = await hasSalonPermission(salonId, user.id)
    if (!hasAccess) {
      return NextResponse.json({ success: false, error: "Acesso negado" }, { status: 403 })
    }

    await deleteSalonTemplate(salonId, templateId)

    return NextResponse.json({
      success: true,
      message: "Template removido com sucesso",
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro ao remover template"
    return NextResponse.json({ success: false, error: msg }, { status: 500 })
  }
}
