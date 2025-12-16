#!/usr/bin/env tsx

/**
 * Script para verificar a integração do Google Calendar no banco de dados
 * 
 * Uso:
 *   pnpm tsx scripts/check-google-integration.ts [salonId]
 */

import * as dotenv from 'dotenv'
import { resolve } from 'path'
import { db, salonIntegrations, salons } from '../packages/db/src/index'
import { eq } from 'drizzle-orm'

// Carrega variáveis de ambiente
const rootPath = resolve(__dirname, '..')
dotenv.config({ path: resolve(rootPath, '.env.local'), override: false })
dotenv.config({ path: resolve(rootPath, '.env'), override: false })
dotenv.config({ path: resolve(rootPath, 'apps/web/.env.local'), override: false })

async function main() {
  const salonIdArg = process.argv[2]

  console.log('🔍 Verificando integrações do Google Calendar no banco de dados...\n')

  if (salonIdArg) {
    // Verifica integração específica
    console.log(`📋 Verificando integração para salão: ${salonIdArg}\n`)

    const salon = await db.query.salons.findFirst({
      where: eq(salons.id, salonIdArg),
      columns: { id: true, name: true, ownerId: true },
    })

    if (!salon) {
      console.error(`❌ Salão ${salonIdArg} não encontrado!`)
      process.exit(1)
    }

    console.log('✅ Salão encontrado:', {
      id: salon.id,
      name: salon.name,
      ownerId: salon.ownerId,
    })

    const integration = await db.query.salonIntegrations.findFirst({
      where: eq(salonIntegrations.salonId, salonIdArg),
    })

    if (!integration) {
      console.log('\n❌ Nenhuma integração encontrada para este salão!')
      console.log('💡 Solução: Reconecte o Google Calendar através da interface web.')
      process.exit(1)
    }

    console.log('\n✅ Integração encontrada:', {
      id: integration.id,
      salonId: integration.salonId,
      provider: integration.provider,
      email: integration.email,
      hasRefreshToken: !!integration.refreshToken,
      refreshTokenLength: integration.refreshToken?.length || 0,
      refreshTokenPrefix: integration.refreshToken?.substring(0, 20) + '...',
      hasAccessToken: !!integration.accessToken,
      expiresAt: integration.expiresAt ? new Date(integration.expiresAt * 1000).toISOString() : null,
      createdAt: integration.createdAt?.toISOString(),
      updatedAt: integration.updatedAt?.toISOString(),
    })

    // Verifica se o token está expirado
    if (integration.expiresAt) {
      const now = Date.now()
      const expiresAt = integration.expiresAt * 1000
      const isExpired = expiresAt < now
      const minutesUntilExpiry = Math.floor((expiresAt - now) / 1000 / 60)

      if (isExpired) {
        console.log('\n⚠️ Token de acesso expirado! O sistema tentará fazer refresh automaticamente.')
      } else {
        console.log(`\n✅ Token de acesso válido por mais ${minutesUntilExpiry} minutos`)
      }
    }
  } else {
    // Lista todas as integrações
    console.log('📋 Listando todas as integrações do Google Calendar:\n')

    const allIntegrations = await db.query.salonIntegrations.findMany()

    if (allIntegrations.length === 0) {
      console.log('❌ Nenhuma integração encontrada no banco de dados!')
      process.exit(0)
    }

    console.log(`✅ Encontradas ${allIntegrations.length} integração(ões):\n`)

    for (const integration of allIntegrations) {
      // Busca nome do salão
      const salon = await db.query.salons.findFirst({
        where: eq(salons.id, integration.salonId),
        columns: { name: true },
      })

      console.log('📦 Integração:', {
        id: integration.id,
        salonId: integration.salonId,
        salonName: salon?.name || 'N/A',
        provider: integration.provider,
        email: integration.email,
        hasRefreshToken: !!integration.refreshToken,
        hasAccessToken: !!integration.accessToken,
        expiresAt: integration.expiresAt ? new Date(integration.expiresAt * 1000).toISOString() : null,
        updatedAt: integration.updatedAt?.toISOString(),
      })
      console.log('')
    }
  }

  process.exit(0)
}

main().catch((error) => {
  console.error('❌ Erro:', error)
  process.exit(1)
})

