import { NextRequest, NextResponse } from 'next/server'
import { google } from 'googleapis'
import { getRawOAuth2Client } from '@/lib/google'
import { createClient } from '@/lib/supabase/server'
import { db, salonIntegrations, salons, eq } from '@repo/db'
import { setupWatchChannelsForSalon } from '@repo/db/services/google-calendar-sync'

/**
 * Obtém a URL base da aplicação
 */
function getBaseUrl(req: NextRequest): string {
  // Prioridade: variável de ambiente > header host > fallback
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL
  }

  const host = req.headers.get('host') || req.headers.get('x-forwarded-host') || 'localhost:3000'
  const protocol = req.headers.get('x-forwarded-proto') ||
    (process.env.NODE_ENV === 'production' ? 'https' : 'http')

  return `${protocol}://${host}`
}

/**
 * Callback OAuth do Google
 * Recebe o código de autorização, troca por tokens e salva no banco
 */
export async function GET(req: NextRequest) {
  const baseUrl = getBaseUrl(req)

  try {
    const searchParams = req.nextUrl.searchParams
    const code = searchParams.get('code')
    const state = searchParams.get('state') // salonId
    const error = searchParams.get('error')

    console.log('📥 Callback Google OAuth recebido:', {
      hasCode: !!code,
      hasState: !!state,
      hasError: !!error,
      state,
    })

    // Verifica se houve erro na autorização
    if (error) {
      console.error('❌ Erro na autorização Google:', error)
      return NextResponse.redirect(
        new URL(`/dashboard?error=${encodeURIComponent('Autorização Google cancelada')}`, baseUrl)
      )
    }

    if (!code) {
      console.error('❌ Código de autorização não fornecido')
      return NextResponse.redirect(
        new URL('/dashboard?error=' + encodeURIComponent('Código de autorização não fornecido'), baseUrl)
      )
    }

    if (!state) {
      console.error('❌ Estado (salonId) não fornecido')
      return NextResponse.redirect(
        new URL('/dashboard?error=' + encodeURIComponent('Estado inválido'), baseUrl)
      )
    }

    const salonId = state

    // Primeiro verifica se o salão existe (antes de processar OAuth)
    const salon = await db.query.salons.findFirst({
      where: eq(salons.id, salonId),
      columns: { id: true, ownerId: true },
    })

    if (!salon) {
      console.error('❌ Salão não encontrado:', salonId)
      return NextResponse.redirect(
        new URL('/dashboard?error=' + encodeURIComponent('Salão não encontrado'), baseUrl)
      )
    }

    // Verifica autenticação - tenta múltiplas vezes se necessário
    let user = null
    let supabase = null

    try {
      supabase = await createClient()
      const authResult = await supabase.auth.getUser()
      user = authResult.data.user

      if (!user) {
        console.warn('⚠️ Usuário não autenticado no callback. Tentando verificar novamente...')
        // Aguarda um pouco e tenta novamente (pode ser problema de sincronização de cookies)
        await new Promise(resolve => setTimeout(resolve, 500))
        const retryResult = await supabase.auth.getUser()
        user = retryResult.data.user
      }
    } catch (authError: any) {
      console.error('❌ Erro ao verificar autenticação:', {
        message: authError.message,
        code: authError.code,
      })
    }

    if (!user) {
      console.error('❌ Usuário não autenticado após tentativas')
      return NextResponse.redirect(
        new URL('/login?error=' + encodeURIComponent('Não autenticado. Por favor, faça login novamente.'), baseUrl)
      )
    }

    // Verifica se o salão pertence ao usuário
    if (salon.ownerId !== user.id) {
      console.error('❌ Acesso negado - salão não pertence ao usuário:', {
        salonOwnerId: salon.ownerId,
        userId: user.id,
      })
      return NextResponse.redirect(
        new URL('/dashboard?error=' + encodeURIComponent('Acesso negado'), baseUrl)
      )
    }

    console.log('✅ Autenticação verificada:', {
      userId: user.id,
      salonId,
      salonOwnerId: salon.ownerId,
    })

    // Obtém cliente OAuth2 raw (não autenticado) para trocar código por tokens
    const oauth2Client = getRawOAuth2Client()

    // Troca código por tokens
    const { tokens } = await oauth2Client.getToken(code)

    console.log('🔐 Tokens recebidos do Google:', {
      hasRefreshToken: !!tokens.refresh_token,
      hasAccessToken: !!tokens.access_token,
      expiryDate: tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : null,
      tokenType: tokens.token_type,
      scope: tokens.scope,
    })

    if (!tokens.refresh_token) {
      console.error('❌ Refresh token não foi fornecido pelo Google!')
      return NextResponse.redirect(
        new URL(
          '/dashboard?error=' + encodeURIComponent('Refresh token não fornecido. Tente novamente autorizando o acesso novamente.'),
          baseUrl
        )
      )
    }

    // Configura credenciais antes de usar
    oauth2Client.setCredentials({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expiry_date: tokens.expiry_date,
    })

    // Busca informações do usuário Google
    let email: string | null = null
    try {
      console.log('📧 Buscando email do usuário Google...')
      const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client })
      const userInfo = await oauth2.userinfo.get()
      email = userInfo.data.email || null

      if (email) {
        console.log('✅ Email obtido com sucesso:', email)
      } else {
        console.warn('⚠️ Email não encontrado na resposta do Google. Dados recebidos:', {
          hasData: !!userInfo.data,
          dataKeys: userInfo.data ? Object.keys(userInfo.data) : [],
        })
      }
    } catch (emailError: any) {
      // Não é crítico se falhar - podemos continuar sem o email
      console.error('❌ Erro ao obter email do usuário Google:', {
        message: emailError.message,
        code: emailError.code,
        response: emailError.response?.data,
        stack: emailError.stack,
      })
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
      refreshTokenLength: tokens.refresh_token?.length,
      refreshTokenPrefix: tokens.refresh_token?.substring(0, 20) + '...',
    })

    if (existingIntegration) {
      // Atualiza existente (mantém isActive atual, não sobrescreve)
      console.log('🔄 Atualizando integração existente:', existingIntegration.id)

      const updateResult = await db
        .update(salonIntegrations)
        .set({
          refreshToken: tokens.refresh_token,
          accessToken: tokens.access_token || null,
          expiresAt,
          ...(email != null && email !== '' ? { email } : {}), // não sobrescreve com null se userinfo falhar
          updatedAt: new Date(),
          // isActive não é atualizado aqui - mantém o valor atual
        })
        .where(eq(salonIntegrations.id, existingIntegration.id))
        .returning({
          id: salonIntegrations.id,
          refreshToken: salonIntegrations.refreshToken,
          email: salonIntegrations.email,
        })

      console.log('📝 Resultado do update:', {
        updatedId: updateResult[0]?.id,
        hasRefreshToken: !!updateResult[0]?.refreshToken,
        savedEmail: updateResult[0]?.email,
      })

      // Verifica se o refresh token e email foram salvos corretamente
      const verifyIntegration = await db.query.salonIntegrations.findFirst({
        where: eq(salonIntegrations.id, existingIntegration.id),
        columns: {
          id: true,
          refreshToken: true,
          email: true,
        },
      })

      if (!verifyIntegration?.refreshToken || verifyIntegration.refreshToken !== tokens.refresh_token) {
        console.error('❌ ERRO: Refresh token não foi salvo corretamente!', {
          expectedLength: tokens.refresh_token?.length,
          savedLength: verifyIntegration?.refreshToken?.length,
        })
        throw new Error('Falha ao salvar refresh token no banco de dados')
      }

      if (email && verifyIntegration.email !== email) {
        console.error('❌ ERRO: Email não foi salvo corretamente!', {
          expected: email,
          saved: verifyIntegration.email,
        })
        throw new Error('Falha ao salvar email no banco de dados')
      }

      console.log('✅ Integração atualizada com sucesso:', {
        refreshTokenSaved: true,
        emailSaved: email ? verifyIntegration.email === email : 'N/A (email não fornecido)',
        savedEmail: verifyIntegration.email,
      })
    } else {
      // Cria novo (isActive será true por padrão)
      console.log('🆕 Criando nova integração')

      const result = await db.insert(salonIntegrations).values({
        salonId,
        provider: 'google',
        refreshToken: tokens.refresh_token,
        accessToken: tokens.access_token || null,
        expiresAt,
        email, // Garante que o email seja salvo
        isActive: true, // Ativa sincronização automática por padrão ao conectar
      }).returning({
        id: salonIntegrations.id,
        email: salonIntegrations.email,
      })

      console.log('📝 Resultado do insert:', {
        createdId: result[0]?.id,
        savedEmail: result[0]?.email,
      })

      // Verifica se o refresh token e email foram salvos corretamente
      const verifyIntegration = await db.query.salonIntegrations.findFirst({
        where: eq(salonIntegrations.id, result[0]?.id),
        columns: {
          id: true,
          refreshToken: true,
          email: true,
        },
      })

      if (!verifyIntegration?.refreshToken || verifyIntegration.refreshToken !== tokens.refresh_token) {
        console.error('❌ ERRO: Refresh token não foi salvo corretamente!', {
          expectedLength: tokens.refresh_token?.length,
          savedLength: verifyIntegration?.refreshToken?.length,
        })
        throw new Error('Falha ao salvar refresh token no banco de dados')
      }

      if (email && verifyIntegration.email !== email) {
        console.error('❌ ERRO: Email não foi salvo corretamente!', {
          expected: email,
          saved: verifyIntegration.email,
        })
        throw new Error('Falha ao salvar email no banco de dados')
      }

      console.log('✅ Integração criada com sucesso:', {
        id: result[0]?.id,
        refreshTokenSaved: true,
        emailSaved: email ? verifyIntegration.email === email : 'N/A (email não fornecido)',
        savedEmail: verifyIntegration.email,
      })
    }

    // Setup watch channels for bidirectional sync (fire-and-forget)
    setupWatchChannelsForSalon(salonId).then((count) => {
      console.log('📡 Watch channels criados:', { salonId, count })
    }).catch((error) => {
      console.error('❌ Erro ao criar watch channels:', error)
    })

    // Redireciona para dashboard com sucesso
    console.log('🎉 Redirecionando para dashboard com sucesso')
    return NextResponse.redirect(
      new URL('/dashboard?success=' + encodeURIComponent('Google Calendar conectado com sucesso!'), baseUrl)
    )
  } catch (error: any) {
    console.error('❌ Erro no callback Google OAuth:', {
      message: error.message,
      stack: error.stack,
      name: error.name,
    })
    return NextResponse.redirect(
      new URL(
        '/dashboard?error=' + encodeURIComponent('Erro ao conectar Google Calendar: ' + (error.message || 'Erro desconhecido')),
        baseUrl
      )
    )
  }
}

