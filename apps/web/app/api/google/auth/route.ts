import { NextRequest, NextResponse } from 'next/server'
import { getOAuth2Client } from '@/lib/google'
import { createClient } from '@/lib/supabase/server'
import { db, salons } from '@repo/db'
import { eq } from 'drizzle-orm'

/**
 * Gera URL de autenticação OAuth do Google
 * Redireciona o usuário para autorizar acesso ao Google Calendar
 */
export async function GET(req: NextRequest) {
  try {
    // Verifica autenticação
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
    }

    // Busca salão do usuário
    const salon = await db.query.salons.findFirst({
      where: eq(salons.ownerId, user.id),
      columns: { id: true },
    })

    if (!salon) {
      return NextResponse.json({ error: 'Salão não encontrado' }, { status: 404 })
    }

    // Obtém cliente OAuth2
    const oauth2Client = getOAuth2Client()

    // Gera URL de autorização
    const authUrl = oauth2Client.generateAuthUrl({
      access_type: 'offline', // Necessário para obter refresh_token
      scope: [
        'https://www.googleapis.com/auth/calendar',
        'https://www.googleapis.com/auth/calendar.events',
      ],
      prompt: 'consent', // Força mostrar tela de consentimento para garantir refresh_token
      state: salon.id, // Passa o salonId no state para recuperar no callback
    })

    // Redireciona para Google
    return NextResponse.redirect(authUrl)
  } catch (error: any) {
    console.error('Erro ao gerar URL de autenticação Google:', error)
    return NextResponse.json(
      { error: 'Erro ao iniciar autenticação com Google' },
      { status: 500 }
    )
  }
}

