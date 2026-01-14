import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { db, salonIntegrations } from '@repo/db'
import { eq, and } from 'drizzle-orm'
import { hasSalonPermission } from '@/lib/services/permissions.service'

/**
 * GET - Busca informações da integração Google Calendar de um salão
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
    }

    const searchParams = req.nextUrl.searchParams
    const salonId = searchParams.get('salonId')

    if (!salonId) {
      return NextResponse.json({ error: 'salonId é obrigatório' }, { status: 400 })
    }

    // Verifica permissão
    const hasAccess = await hasSalonPermission(salonId, user.id)
    if (!hasAccess) {
      return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
    }

    // Busca integração
    const integration = await db.query.salonIntegrations.findFirst({
      where: and(
        eq(salonIntegrations.salonId, salonId),
        eq(salonIntegrations.provider, 'google')
      ),
      columns: {
        id: true,
        isActive: true,
        email: true,
        createdAt: true,
        updatedAt: true,
      },
    })

    if (!integration) {
      return NextResponse.json({ isActive: false, hasIntegration: false })
    }

    return NextResponse.json({
      isActive: integration.isActive ?? true,
      hasIntegration: true,
      email: integration.email,
    })
  } catch (error: any) {
    console.error('Erro ao buscar integração Google:', error)
    return NextResponse.json(
      { error: 'Erro ao buscar integração' },
      { status: 500 }
    )
  }
}
