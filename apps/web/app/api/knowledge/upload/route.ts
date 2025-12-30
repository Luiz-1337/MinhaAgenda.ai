import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { uploadKnowledgeFile } from "@/app/actions/knowledge"
import { hasSalonPermission } from "@/lib/services/permissions.service"
import { db, agents } from "@repo/db"
import { eq, and } from "drizzle-orm"

export const maxDuration = 300 // 5 minutos para processar arquivos grandes

export async function POST(req: NextRequest) {
  try {
    // Verifica autenticação
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
    }

    // Obtém FormData
    const formData = await req.formData()
    const file = formData.get("file") as File | null
    const agentId = formData.get("agentId") as string | null

    if (!file) {
      return NextResponse.json({ error: "Arquivo não fornecido" }, { status: 400 })
    }

    if (!agentId) {
      return NextResponse.json({ error: "agentId não fornecido" }, { status: 400 })
    }

    // Busca o agente para obter o salonId e verificar permissões
    const agent = await db.query.agents.findFirst({
      where: eq(agents.id, agentId),
      columns: { salonId: true },
    })

    if (!agent) {
      return NextResponse.json({ error: "Agente não encontrado" }, { status: 404 })
    }

    // Verifica permissões
    const hasAccess = await hasSalonPermission(agent.salonId, user.id)

    if (!hasAccess) {
      return NextResponse.json({ error: "Acesso negado a este salão" }, { status: 403 })
    }

    // Converte o arquivo para ArrayBuffer
    const arrayBuffer = await file.arrayBuffer()

    // Processa o arquivo
    const result = await uploadKnowledgeFile(agentId, {
      name: file.name,
      type: file.type,
      size: file.size,
      buffer: arrayBuffer,
    })

    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: 400 })
    }

    return NextResponse.json({
      success: true,
      data: result.data,
    })
  } catch (error) {
    console.error("Erro no upload de arquivo:", error)
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Erro ao processar arquivo",
      },
      { status: 500 }
    )
  }
}
