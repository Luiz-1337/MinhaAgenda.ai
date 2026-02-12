import * as dotenv from 'dotenv'
import postgres from 'postgres'

const env = dotenv.config({ path: '../../.env' })
const url = (env.parsed && env.parsed.DATABASE_URL) ? env.parsed.DATABASE_URL : process.env.DATABASE_URL
if (!url) {
  console.error('DATABASE_URL not set')
  process.exit(1)
}

const sql = postgres(url, { prepare: false, ssl: 'require' })

const EMAIL = 'solo@teste.com'

async function main() {
  console.log('🧹 Iniciando limpeza da conta:', EMAIL)
  console.log('📊 Conectando ao banco:', url.replace(/:[^@]*@/, ':****@'))
  console.log('')

  await sql.begin(async (tx) => {
    // Buscar o profile pelo email
    const [profile] = await tx`
      SELECT id, email FROM profiles WHERE email = ${EMAIL}
    `

    if (!profile) {
      console.log(`⚠️  Profile com email ${EMAIL} não encontrado.`)
      console.log('✅ Nada para limpar.')
      return
    }

    const profileId = profile.id
    console.log(`✅ Profile encontrado: ${profileId}`)
    console.log('')

    // Buscar todos os salões do owner
    const salons = await tx`
      SELECT id FROM salons WHERE owner_id = ${profileId}
    `
    const salonIds = salons.map(s => s.id)
    console.log(`📋 Encontrados ${salonIds.length} salão(ões) do owner`)

    if (salonIds.length > 0) {
      // Deletar dados relacionados aos salões em ordem (respeitando FKs)

      // 1. Schedule overrides
      console.log('🗑️  Deletando schedule_overrides...')
      await tx`
        DELETE FROM schedule_overrides 
        WHERE salon_id = ANY(${salonIds})
      `

      // 2. Professional services
      console.log('🗑️  Deletando professional_services...')
      await tx`
        DELETE FROM professional_services 
        WHERE professional_id IN (
          SELECT id FROM professionals WHERE salon_id = ANY(${salonIds})
        )
      `

      // 3. Campaign recipients
      console.log('🗑️  Deletando campaign_recipients...')
      await tx`
        DELETE FROM campaign_recipients 
        WHERE campaign_id IN (
          SELECT id FROM campaigns WHERE salon_id = ANY(${salonIds})
        )
      `

      // 4. Campaigns
      console.log('🗑️  Deletando campaigns...')
      await tx`
        DELETE FROM campaigns WHERE salon_id = ANY(${salonIds})
      `

      // 5. Messages (depende de chats)
      console.log('🗑️  Deletando messages...')
      await tx`
        DELETE FROM messages 
        WHERE chat_id IN (
          SELECT id FROM chats WHERE salon_id = ANY(${salonIds})
        )
      `

      // 6. Chat messages
      // console.log('🗑️  Deletando chat_messages...')
      // await tx`
      //   DELETE FROM chat_messages WHERE salon_id = ANY(${salonIds})
      // `

      // 7. Chats
      console.log('🗑️  Deletando chats...')
      await tx`
        DELETE FROM chats WHERE salon_id = ANY(${salonIds})
      `

      // 8. Appointments
      console.log('🗑️  Deletando appointments...')
      await tx`
        DELETE FROM appointments WHERE salon_id = ANY(${salonIds})
      `

      // 9. Availability
      console.log('🗑️  Deletando availability...')
      await tx`
        DELETE FROM availability 
        WHERE professional_id IN (
          SELECT id FROM professionals WHERE salon_id = ANY(${salonIds})
        )
      `

      // 10. Integrations (por profissional)
      // console.log('🗑️  Deletando integrations...')
      // await tx`
      //   DELETE FROM integrations 
      //   WHERE salon_id = ANY(${salonIds})
      //      OR professional_id IN (
      //     SELECT id FROM professionals WHERE salon_id = ANY(${salonIds})
      //   )
      // `

      // 11. Salon integrations
      console.log('🗑️  Deletando salon_integrations...')
      await tx`
        DELETE FROM salon_integrations WHERE salon_id = ANY(${salonIds})
      `

      // 12. Leads
      console.log('🗑️  Deletando leads...')
      await tx`
        DELETE FROM leads WHERE salon_id = ANY(${salonIds})
      `

      // 13. Customers
      console.log('🗑️  Deletando customers...')
      await tx`
        DELETE FROM customers WHERE salon_id = ANY(${salonIds})
      `

      // 14. Embeddings
      console.log('🗑️  Deletando embeddings...')
      await tx`
        DELETE FROM embeddings 
        WHERE agent_id IN (
          SELECT id FROM agents WHERE salon_id = ANY(${salonIds})
        )
      `

      // 15. Agent knowledge base
      console.log('🗑️  Deletando agent_knowledge_base...')
      await tx`
        DELETE FROM agent_knowledge_base 
        WHERE agent_id IN (
          SELECT id FROM agents WHERE salon_id = ANY(${salonIds})
        )
      `

      // 16. Agents
      console.log('🗑️  Deletando agents...')
      await tx`
        DELETE FROM agents WHERE salon_id = ANY(${salonIds})
      `

      // 17. Agent stats
      console.log('🗑️  Deletando agent_stats...')
      await tx`
        DELETE FROM agent_stats WHERE salon_id = ANY(${salonIds})
      `

      // 18. AI usage stats
      console.log('🗑️  Deletando ai_usage_stats...')
      await tx`
        DELETE FROM ai_usage_stats WHERE salon_id = ANY(${salonIds})
      `

      // 19. Professionals
      console.log('🗑️  Deletando professionals...')
      await tx`
        DELETE FROM professionals WHERE salon_id = ANY(${salonIds})
      `

      // 20. Services
      console.log('🗑️  Deletando services...')
      await tx`
        DELETE FROM services WHERE salon_id = ANY(${salonIds})
      `

      // 21. Salons
      console.log('🗑️  Deletando salons...')
      await tx`
        DELETE FROM salons WHERE id = ANY(${salonIds})
      `
    }

    // Deletar outros dados relacionados ao profile (não relacionados a salões)

    // Leads (que podem não ter salon_id)
    console.log('🗑️  Deletando leads do profile...')
    await tx`
      DELETE FROM leads WHERE profile_id = ${profileId}
    `

    // Payments
    console.log('🗑️  Deletando payments...')
    await tx`
      DELETE FROM payments WHERE user_id = ${profileId}
    `

    // Campaign recipients por profile_id
    console.log('🗑️  Deletando campaign_recipients do profile...')
    await tx`
      DELETE FROM campaign_recipients WHERE profile_id = ${profileId}
    `

    // Chat messages por client_id
    // console.log('🗑️  Deletando chat_messages do profile...')
    // await tx`
    //   DELETE FROM chat_messages WHERE client_id = ${profileId}
    // `

    // Appointments como client
    console.log('🗑️  Deletando appointments como client...')
    await tx`
      DELETE FROM appointments WHERE client_id = ${profileId}
    `

    // Limpar o profile, mantendo apenas id e email
    console.log('🧹 Limpando dados do profile (mantendo apenas id e email)...')
    await tx`
      UPDATE profiles 
      SET 
        full_name = NULL,
        first_name = NULL,
        last_name = NULL,
        phone = NULL,
        billing_address = NULL,
        billing_postal_code = NULL,
        billing_city = NULL,
        billing_state = NULL,
        billing_country = NULL,
        billing_address_complement = NULL,
        document_type = NULL,
        document_number = NULL,
        google_access_token = NULL,
        google_refresh_token = NULL,
        calendar_sync_enabled = false,
        onboarding_completed = false,
        system_role = 'user',
        role = 'CLIENT',
        tier = 'SOLO',
        salon_id = NULL,
        updated_at = now()
      WHERE id = ${profileId}
    `

    console.log('')
    console.log('✅ Limpeza concluída com sucesso!')
    console.log(`✅ Profile ${profileId} mantido com apenas id e email.`)
    console.log(`✅ Usuário no auth.users mantido (login ainda funciona).`)
  })

  await sql.end({ timeout: 0 })
  console.log('')
  console.log('✨ Limpeza finalizada!')
  console.log('💡 Execute o seed para popular dados completos.')
}

main().catch((err) => {
  console.error('❌ Erro ao limpar conta:', err)
  process.exit(1)
})

