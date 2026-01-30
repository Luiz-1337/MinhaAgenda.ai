import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { hasSalonPermission } from "@/lib/services/permissions.service"
import {
  createSalonTemplate,
  listSalonTemplates,
  type CreateTemplateOptions,
  type TemplateCategory,
} from "@/lib/services/twilio-content.service"

const VALID_CATEGORIES: TemplateCategory[] = ["MARKETING", "UTILITY", "AUTHENTICATION"]

/**
 * GET - Lista todos os templates do salão
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

    const templates = await listSalonTemplates(salonId)

    return NextResponse.json({
      success: true,
      data: templates,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro ao listar templates"
    return NextResponse.json({ success: false, error: msg }, { status: 500 })
  }
}

/**
 * POST - Cria um novo template
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

    let body: CreateTemplateOptions
    try {
      body = await req.json()
    } catch {
      return NextResponse.json(
        { success: false, error: "Corpo da requisição inválido" },
        { status: 400 }
      )
    }

    // Validações
    if (!body.name || body.name.trim().length < 3) {
      return NextResponse.json(
        { success: false, error: "Nome do template deve ter pelo menos 3 caracteres" },
        { status: 400 }
      )
    }

    if (!body.body || body.body.trim().length < 10) {
      return NextResponse.json(
        { success: false, error: "Corpo da mensagem deve ter pelo menos 10 caracteres" },
        { status: 400 }
      )
    }

    if (!body.category || !VALID_CATEGORIES.includes(body.category)) {
      return NextResponse.json(
        { success: false, error: `Categoria inválida. Use: ${VALID_CATEGORIES.join(", ")}` },
        { status: 400 }
      )
    }

    // Valida que o nome não contém caracteres especiais
    if (!/^[a-z0-9_]+$/.test(body.name.toLowerCase().replace(/\s+/g, "_"))) {
      return NextResponse.json(
        { success: false, error: "Nome do template deve conter apenas letras, números e underscores" },
        { status: 400 }
      )
    }

    const contentSid = await createSalonTemplate(salonId, {
      ...body,
      name: body.name.toLowerCase().replace(/\s+/g, "_"),
    })

    return NextResponse.json({
      success: true,
      data: { contentSid },
      message: "Template criado com sucesso. Submeta para aprovação quando estiver pronto.",
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro ao criar template"
    return NextResponse.json({ success: false, error: msg }, { status: 500 })
  }
}
