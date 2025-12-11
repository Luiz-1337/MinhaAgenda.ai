import { NextRequest, NextResponse } from 'next/server'
import { google } from 'googleapis'
import { getOAuth2Client } from '@/lib/google'
import { createClient } from '@/lib/supabase/server'
import { db, salonIntegrations, salons } from '@repo/db'
import { eq } from 'drizzle-orm'

/**
 * Callback OAuth do Google
 * Recebe o código de autorização, troca por tokens e salva no banco
 */
export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams
    const code = searchParams.get('code')
    const state = searchParams.get('state') // salonId
    const error = searchParams.get('error')

    // Verifica se houve erro na autorização
    if (error) {
      console.error('Erro na autorização Google:', error)
      return NextResponse.redirect(
        new URL(`/dashboard?error=${encodeURIComponent('Autorização Google cancelada')}`, req.url)
      )
    }

    if (!code) {
      return NextResponse.redirect(
        new URL('/dashboard?error=' + encodeURIComponent('Código de autorização não fornecido'), req.url)
      )
    }

    if (!state) {
      return NextResponse.redirect(
        new URL('/dashboard?error=' + encodeURIComponent('Estado inválido'), req.url)
      )
    }

    const salonId = state

    // Verifica autenticação
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.redirect(
        new URL('/login?error=' + encodeURIComponent('Não autenticado'), req.url)
      )
    }

    // Verifica se o salão pertence ao usuário
    const salon = await db.query.salons.findFirst({
      where: eq(salons.id, salonId),
      columns: { id: true, ownerId: true },
    })

    if (!salon || salon.ownerId !== user.id) {
      return NextResponse.redirect(
        new URL('/dashboard?error=' + encodeURIComponent('Acesso negado'), req.url)
      )
    }

    // Obtém cliente OAuth2
    const oauth2Client = getOAuth2Client()

    // Troca código por tokens
    const { tokens } = await oauth2Client.getToken(code)

    if (!tokens.refresh_token) {
      return NextResponse.redirect(
        new URL(
          '/dashboard?error=' + encodeURIComponent('Refresh token não fornecido. Tente novamente.'),
          req.url
        )
      )
    }

    // Configura credenciais antes de usar
    oauth2Client.setCredentials({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expiry_date: tokens.expiry_date,
    })

    // Busca informações do usuário Google (opcional - pode falhar, mas não é crítico)
    let email: string | null = null
    try {
      const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client })
      const userInfo = await oauth2.userinfo.get()
      email = userInfo.data.email || null
    } catch (emailError: any) {
      // Não é crítico se falhar - podemos continuar sem o email
      console.warn('Não foi possível obter email do usuário Google:', emailError.message)
      // O email pode ser null, não é obrigatório
    }

    // Salva ou atualiza integração no banco
    const existingIntegration = await db.query.salonIntegrations.findFirst({
      where: eq(salonIntegrations.salonId, salonId),
    })

    const expiresAt = tokens.expiry_date ? Math.floor(tokens.expiry_date / 1000) : null

    console.log('💾 Salvando integração no banco:', {
      salonId,
      hasRefreshToken: !!tokens.refresh_token,
      hasAccessToken: !!tokens.access_token,
      expiresAt,
      email,
      existingIntegration: !!existingIntegration,
    })

    if (existingIntegration) {
      // Atualiza existente
      await db
        .update(salonIntegrations)
        .set({
          refreshToken: tokens.refresh_token,
          accessToken: tokens.access_token || null,
          expiresAt,
          email,
          updatedAt: new Date(),
        })
        .where(eq(salonIntegrations.id, existingIntegration.id))
      console.log('✅ Integração atualizada com sucesso')
    } else {
      // Cria novo
      const result = await db.insert(salonIntegrations).values({
        salonId,
        provider: 'google',
        refreshToken: tokens.refresh_token,
        accessToken: tokens.access_token || null,
        expiresAt,
        email,
      }).returning({ id: salonIntegrations.id })
      console.log('✅ Integração criada com sucesso:', result[0]?.id)
    }

    // Redireciona para dashboard com sucesso
    return NextResponse.redirect(
      new URL('/dashboard?success=' + encodeURIComponent('Google Calendar conectado com sucesso!'), req.url)
    )
  } catch (error: any) {
    console.error('Erro no callback Google OAuth:', error)
    return NextResponse.redirect(
      new URL(
        '/dashboard?error=' + encodeURIComponent('Erro ao conectar Google Calendar: ' + error.message),
        req.url
      )
    )
  }
}

