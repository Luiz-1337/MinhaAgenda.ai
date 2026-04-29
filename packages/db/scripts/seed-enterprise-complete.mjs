import * as dotenv from 'dotenv'
import { randomUUID } from 'node:crypto'
import postgres from 'postgres'

const env = dotenv.config({ path: '../../.env' })
const url = (env.parsed && env.parsed.DATABASE_URL) ? env.parsed.DATABASE_URL : process.env.DATABASE_URL
if (!url) {
  console.error('DATABASE_URL not set')
  process.exit(1)
}

const sql = postgres(url, { prepare: false, ssl: 'require' })

const OWNER_EMAIL = 'enterprise@teste.com'
const PASSWORD = 'teste123'
const FULL_NAME = 'Admin Enterprise'

async function main() {
  console.log('🏢 Iniciando seed completo para conta ENTERPRISE')
  console.log(`📧 Email: ${OWNER_EMAIL}`)
  console.log(`🔑 Senha: ${PASSWORD}`)
  console.log('📊 Conectando ao banco:', url.replace(/:[^@]*@/, ':****@'))
  console.log('')

  await sql.begin(async (tx) => {
    // ============================================================================
    // 1. PROFILE DO OWNER
    // ============================================================================
    let [ownerProfile] = await tx`
      SELECT id, email FROM profiles WHERE email = ${OWNER_EMAIL}
    `

    const ownerId = ownerProfile?.id ?? randomUUID()

    if (!ownerProfile) {
      console.log('👤 Criando profile do owner...')
      await tx`
        INSERT INTO profiles (id, email, system_role, tier, role, full_name, first_name, last_name, phone, onboarding_completed)
        VALUES (
          ${ownerId},
          ${OWNER_EMAIL},
          'admin',
          'ENTERPRISE',
          'OWNER',
          ${FULL_NAME},
          'Admin',
          'Enterprise',
          '+5511999000111',
          true
        )
      `
    } else {
      console.log(`✅ Profile já existe: ${ownerId}`)
      await tx`
        UPDATE profiles
        SET
          tier = 'ENTERPRISE',
          role = 'OWNER',
          system_role = 'admin',
          full_name = ${FULL_NAME},
          first_name = 'Admin',
          last_name = 'Enterprise',
          phone = '+5511999000111',
          onboarding_completed = true,
          updated_at = now()
        WHERE id = ${ownerId}
      `
    }

    // ============================================================================
    // 2. AUTH USER (Supabase)
    // ============================================================================
    const [existingAuthUser] = await tx`SELECT id FROM auth.users WHERE email = ${OWNER_EMAIL}`

    if (existingAuthUser) {
      console.log('⚠️  Auth user já existe, atualizando senha...')
      const [{ hash: passwordHash }] = await tx`
        SELECT crypt(${PASSWORD}, gen_salt('bf')) as hash
      `
      await tx`
        UPDATE auth.users SET encrypted_password = ${passwordHash}, updated_at = now()
        WHERE id = ${existingAuthUser.id}
      `
    } else {
      console.log('🔐 Criando auth user...')
      const [{ hash: passwordHash }] = await tx`
        SELECT crypt(${PASSWORD}, gen_salt('bf')) as hash
      `

      await tx`
        INSERT INTO auth.users (
          instance_id, id, aud, role, email, encrypted_password,
          email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
          created_at, updated_at, confirmation_token, email_change,
          email_change_token_new, recovery_token
        ) VALUES (
          '00000000-0000-0000-0000-000000000000',
          ${ownerId}, 'authenticated', 'authenticated', ${OWNER_EMAIL}, ${passwordHash},
          now(), '{"provider": "email", "providers": ["email"]}',
          ${tx.json({ full_name: FULL_NAME })},
          now(), now(), '', '', '', ''
        )
      `

      const identityId = randomUUID()
      await tx`
        INSERT INTO auth.identities (
          id, user_id, identity_data, provider, provider_id,
          last_sign_in_at, created_at, updated_at
        ) VALUES (
          ${identityId}, ${ownerId},
          ${tx.json({ sub: ownerId, email: OWNER_EMAIL })},
          'email', ${ownerId}, now(), now(), now()
        )
      `
    }
    console.log('✅ Auth user configurado')

    // Garantir que o profile tenha tier/role correto APÓS o auth trigger
    // (o trigger handle_new_user pode resetar valores para defaults)
    console.log('🔧 Garantindo tier ENTERPRISE e role OWNER no profile...')
    await tx`
      UPDATE profiles
      SET
        tier = 'ENTERPRISE',
        role = 'OWNER',
        system_role = 'admin',
        full_name = ${FULL_NAME},
        first_name = 'Admin',
        last_name = 'Enterprise',
        phone = '+5511999000111',
        onboarding_completed = true,
        updated_at = now()
      WHERE id = ${ownerId}
    `

    // ============================================================================
    // 3. SALÃO ENTERPRISE
    // ============================================================================
    console.log('🏪 Criando salão Enterprise...')

    const salonId = randomUUID()
    const workHours = {
      monday: { open: '08:00', close: '20:00' },
      tuesday: { open: '08:00', close: '20:00' },
      wednesday: { open: '08:00', close: '20:00' },
      thursday: { open: '08:00', close: '20:00' },
      friday: { open: '08:00', close: '21:00' },
      saturday: { open: '08:00', close: '18:00' },
      sunday: { open: '10:00', close: '16:00' }
    }

    const settings = {
      accepts_card: true,
      accepts_pix: true,
      parking: true,
      wifi: true,
      late_tolerance_minutes: 10,
      cancellation_policy_hours: 12,
      auto_confirm: true,
      send_reminders: true,
      reminder_hours_before: 24
    }

    await tx`
      INSERT INTO salons (id, owner_id, name, slug, whatsapp, address, phone, description, settings, work_hours, subscription_status)
      VALUES (
        ${salonId}, ${ownerId},
        'Rede Premium Hair',
        ${'rede-premium-hair-' + salonId.slice(0, 6)},
        '+5511999000111',
        'Av. Brigadeiro Faria Lima, 3477 - Itaim Bibi, São Paulo - SP',
        '+5511999000111',
        'Rede de salões premium com atendimento IA dedicado. Múltiplos agentes especializados atendendo via WhatsApp.',
        ${JSON.stringify(settings)}::jsonb,
        ${JSON.stringify(workHours)}::jsonb,
        'PAID'
      )
    `

    // Vincular profile ao salão
    await tx`UPDATE profiles SET salon_id = ${salonId} WHERE id = ${ownerId}`
    console.log(`✅ Salão criado: ${salonId}`)

    // ============================================================================
    // 4. PROFISSIONAIS (7 profissionais - Enterprise)
    // ============================================================================
    console.log('👨‍💼 Criando profissionais...')

    const proData = [
      { name: 'Carlos Mendes', email: 'carlos@enterprise.com', phone: '+5511998001001', role: 'MANAGER' },
      { name: 'Fernanda Oliveira', email: 'fernanda@enterprise.com', phone: '+5511998001002', role: 'STAFF' },
      { name: 'Rafael Costa', email: 'rafael@enterprise.com', phone: '+5511998001003', role: 'STAFF' },
      { name: 'Juliana Lima', email: 'juliana@enterprise.com', phone: '+5511998001004', role: 'STAFF' },
      { name: 'Thiago Souza', email: 'thiago@enterprise.com', phone: '+5511998001005', role: 'STAFF' },
      { name: 'Amanda Pereira', email: 'amanda@enterprise.com', phone: '+5511998001006', role: 'STAFF' },
      { name: 'Lucas Ferreira', email: 'lucas@enterprise.com', phone: '+5511998001007', role: 'STAFF' },
    ]

    const professionalIds = []
    for (const pro of proData) {
      // Check if profile already exists by email
      let [existingProfile] = await tx`
        SELECT id FROM profiles WHERE email = ${pro.email}
      `
      const proProfileId = existingProfile?.id ?? randomUUID()

      if (!existingProfile) {
        await tx`
          INSERT INTO profiles (id, email, system_role, full_name, phone)
          VALUES (${proProfileId}, ${pro.email}, 'user', ${pro.name}, ${pro.phone})
        `
      }

      const [{ id }] = await tx`
        INSERT INTO professionals (salon_id, user_id, name, email, phone, role, is_active)
        VALUES (${salonId}, ${proProfileId}, ${pro.name}, ${pro.email}, ${pro.phone}, ${pro.role}::professional_role, true)
        RETURNING id
      `
      professionalIds.push({ id, name: pro.name })
    }
    console.log(`✅ ${professionalIds.length} profissionais criados`)

    // ============================================================================
    // 5. SERVIÇOS
    // ============================================================================
    console.log('✂️ Criando serviços...')

    const servicesData = [
      { name: 'Corte Masculino', description: 'Corte moderno com técnicas profissionais', duration: 30, price: 55.00 },
      { name: 'Corte Feminino', description: 'Corte e modelagem feminina', duration: 45, price: 75.00 },
      { name: 'Corte + Barba', description: 'Combo corte e barba completa', duration: 50, price: 80.00 },
      { name: 'Barba Completa', description: 'Design e acabamento de barba', duration: 25, price: 40.00 },
      { name: 'Coloração', description: 'Coloração completa com produtos premium', duration: 120, price: 200.00 },
      { name: 'Mechas', description: 'Mechas com técnicas modernas', duration: 150, price: 250.00 },
      { name: 'Hidratação Capilar', description: 'Tratamento hidratante profundo', duration: 40, price: 70.00 },
      { name: 'Escova Progressiva', description: 'Alisamento progressivo premium', duration: 180, price: 300.00 },
      { name: 'Sobrancelha', description: 'Design de sobrancelhas', duration: 15, price: 25.00 },
      { name: 'Pacote Noivo', description: 'Corte + barba + sobrancelha + hidratação', duration: 90, price: 160.00 },
    ]

    const serviceIds = []
    for (const svc of servicesData) {
      const [{ id }] = await tx`
        INSERT INTO services (salon_id, name, description, duration, price, is_active)
        VALUES (${salonId}, ${svc.name}, ${svc.description}, ${svc.duration}, ${svc.price}, true)
        RETURNING id
      `
      serviceIds.push({ id, ...svc })
    }
    console.log(`✅ ${serviceIds.length} serviços criados`)

    // Associar serviços aos profissionais
    for (const pro of professionalIds) {
      // Cada profissional faz pelo menos 5 serviços
      const numServices = 5 + Math.floor(Math.random() * (serviceIds.length - 5))
      const shuffled = [...serviceIds].sort(() => Math.random() - 0.5)
      for (let i = 0; i < numServices; i++) {
        await tx`
          INSERT INTO professional_services (professional_id, service_id)
          VALUES (${pro.id}, ${shuffled[i].id})
          ON CONFLICT DO NOTHING
        `
      }
    }

    // ============================================================================
    // 6. DISPONIBILIDADE
    // ============================================================================
    console.log('📅 Criando disponibilidade...')

    for (const pro of professionalIds) {
      for (let day = 1; day <= 6; day++) {
        await tx`
          INSERT INTO availability (professional_id, day_of_week, start_time, end_time, is_break)
          VALUES
            (${pro.id}, ${day}, '09:00', '18:00', false),
            (${pro.id}, ${day}, '12:00', '13:00', true)
        `
      }
    }

    // ============================================================================
    // 7. AGENTES IA (4 agentes - 3 inclusos + 1 extra @ R$150/mês)
    // ============================================================================
    console.log('🤖 Criando agentes IA...')

    const agentsData = [
      {
        name: 'Atendimento Geral',
        tone: 'informal',
        systemPrompt: 'Você é o assistente virtual da Rede Premium Hair. Atenda os clientes de forma amigável e descontraída, ajudando com agendamentos, informações sobre serviços e preços. Seja proativo em sugerir serviços complementares.',
        isActive: true,
      },
      {
        name: 'Agendamentos VIP',
        tone: 'formal',
        systemPrompt: 'Você é o assistente VIP da Rede Premium Hair. Atenda clientes premium com formalidade e atenção especial. Priorize horários exclusivos e ofereça pacotes diferenciados. Sempre confirme disponibilidade antes de agendar.',
        isActive: false,
      },
      {
        name: 'Suporte Pós-Atendimento',
        tone: 'informal',
        systemPrompt: 'Você é o assistente de pós-atendimento da Rede Premium Hair. Seu foco é acompanhar a satisfação dos clientes após os serviços, coletar feedback, sugerir produtos de manutenção e incentivar reagendamentos.',
        isActive: false,
      },
      {
        name: 'Agente Extra - Campanhas',
        tone: 'informal',
        systemPrompt: 'Você é o assistente de campanhas da Rede Premium Hair. Divulgue promoções, novidades e pacotes especiais. Responda dúvidas sobre preços promocionais e incentive agendamentos durante campanhas ativas.',
        isActive: false,
      },
    ]

    const agentIds = []
    for (const agentData of agentsData) {
      const [{ id }] = await tx`
        INSERT INTO agents (salon_id, name, system_prompt, model, tone, is_active)
        VALUES (${salonId}, ${agentData.name}, ${agentData.systemPrompt}, 'gpt-5-mini', ${agentData.tone}, ${agentData.isActive})
        RETURNING id
      `
      agentIds.push({ id, name: agentData.name })
    }
    console.log(`✅ ${agentIds.length} agentes criados (3 inclusos + 1 extra @ R$150/mês)`)

    // ============================================================================
    // 8. CLIENTES
    // ============================================================================
    console.log('👤 Criando clientes...')

    const clientNames = [
      'Ricardo Almeida', 'Patrícia Santos', 'André Souza', 'Camila Rodrigues', 'Gabriel Lima',
      'Beatriz Martins', 'Guilherme Pereira', 'Larissa Ribeiro', 'Daniel Carvalho', 'Fernanda Dias',
      'Henrique Rocha', 'Mariana Silva', 'Roberto Costa', 'Isabela Mendes', 'Rodrigo Nunes',
    ]
    const clientPhones = [
      '+5511988001001', '+5511988001002', '+5511988001003', '+5511988001004', '+5511988001005',
      '+5511988001006', '+5511988001007', '+5511988001008', '+5511988001009', '+5511988001010',
      '+5511988001011', '+5511988001012', '+5511988001013', '+5511988001014', '+5511988001015',
    ]

    const customerIds = []
    for (let i = 0; i < clientNames.length; i++) {
      const [{ id }] = await tx`
        INSERT INTO customers (salon_id, name, phone)
        VALUES (${salonId}, ${clientNames[i]}, ${clientPhones[i]})
        ON CONFLICT (salon_id, phone) DO UPDATE SET name = excluded.name
        RETURNING id
      `
      customerIds.push({ id, name: clientNames[i], phone: clientPhones[i] })
    }
    console.log(`✅ ${customerIds.length} clientes criados`)

    // ============================================================================
    // 9. AGENDAMENTOS
    // ============================================================================
    console.log('📅 Criando agendamentos...')

    const now = new Date()
    let appointmentCount = 0

    // Passados (50 agendamentos)
    for (let i = 0; i < 50; i++) {
      const daysAgo = Math.floor(Math.random() * 60) + 1
      const date = new Date(now)
      date.setDate(date.getDate() - daysAgo)
      date.setHours(9 + Math.floor(Math.random() * 9), [0, 15, 30, 45][Math.floor(Math.random() * 4)], 0, 0)

      const service = serviceIds[Math.floor(Math.random() * serviceIds.length)]
      const endTime = new Date(date.getTime() + service.duration * 60000)
      const statuses = ['completed', 'completed', 'completed', 'completed', 'cancelled']

      await tx`
        INSERT INTO appointments (salon_id, professional_id, client_id, service_id, date, end_time, status)
        VALUES (
          ${salonId},
          ${professionalIds[Math.floor(Math.random() * professionalIds.length)].id},
          ${customerIds[Math.floor(Math.random() * customerIds.length)].id},
          ${service.id},
          ${date.toISOString()},
          ${endTime.toISOString()},
          ${statuses[Math.floor(Math.random() * statuses.length)]}::status
        )
      `
      appointmentCount++
    }

    // Futuros (30 agendamentos)
    for (let i = 0; i < 30; i++) {
      const daysAhead = Math.floor(Math.random() * 30) + 1
      const date = new Date(now)
      date.setDate(date.getDate() + daysAhead)
      date.setHours(9 + Math.floor(Math.random() * 9), [0, 15, 30, 45][Math.floor(Math.random() * 4)], 0, 0)

      const service = serviceIds[Math.floor(Math.random() * serviceIds.length)]
      const endTime = new Date(date.getTime() + service.duration * 60000)
      const statuses = ['confirmed', 'confirmed', 'confirmed', 'pending']

      await tx`
        INSERT INTO appointments (salon_id, professional_id, client_id, service_id, date, end_time, status)
        VALUES (
          ${salonId},
          ${professionalIds[Math.floor(Math.random() * professionalIds.length)].id},
          ${customerIds[Math.floor(Math.random() * customerIds.length)].id},
          ${service.id},
          ${date.toISOString()},
          ${endTime.toISOString()},
          ${statuses[Math.floor(Math.random() * statuses.length)]}::status
        )
      `
      appointmentCount++
    }
    console.log(`✅ ${appointmentCount} agendamentos criados`)

    // ============================================================================
    // 10. CHATS E MENSAGENS
    // ============================================================================
    console.log('💬 Criando chats...')

    const chatCustomers = customerIds.slice(0, 8)
    for (const customer of chatCustomers) {
      const [{ id: chatId }] = await tx`
        INSERT INTO chats (salon_id, client_phone, status, agent_id)
        VALUES (${salonId}, ${customer.phone}, 'active', ${agentIds[0].id})
        RETURNING id
      `

      await tx`
        INSERT INTO messages (chat_id, role, content) VALUES
          (${chatId}, 'user'::chat_message_role, 'Olá, quero agendar um horário.'),
          (${chatId}, 'assistant'::chat_message_role, 'Olá! Seja bem-vindo à Rede Premium Hair! Qual serviço você deseja?'),
          (${chatId}, 'user'::chat_message_role, 'Corte + barba, por favor.'),
          (${chatId}, 'assistant'::chat_message_role, 'Excelente escolha! Temos horários disponíveis esta semana. Qual dia funciona melhor para você?')
      `
    }
    console.log(`✅ ${chatCustomers.length} chats criados`)

    // ============================================================================
    // 11. ESTATÍSTICAS DE IA
    // ============================================================================
    console.log('📊 Criando estatísticas de IA...')

    for (let i = 0; i < 30; i++) {
      const date = new Date(now)
      date.setDate(date.getDate() - i)
      const credits = Math.floor(Math.random() * 300) + 50
      await tx`
        INSERT INTO ai_usage_stats (salon_id, date, model, credits)
        VALUES (${salonId}, ${date.toISOString().split('T')[0]}::date, 'gpt-5-mini', ${credits})
        ON CONFLICT (salon_id, date, model) DO UPDATE SET credits = excluded.credits
      `
    }

    // ============================================================================
    // RESUMO
    // ============================================================================
    console.log('')
    console.log('═══════════════════════════════════════════════════')
    console.log('🏢 CONTA ENTERPRISE CRIADA COM SUCESSO!')
    console.log('═══════════════════════════════════════════════════')
    console.log('')
    console.log('📋 Credenciais:')
    console.log(`   📧 Email:  ${OWNER_EMAIL}`)
    console.log(`   🔑 Senha:  ${PASSWORD}`)
    console.log('')
    console.log('📋 Dados criados:')
    console.log(`   🏪 Salão:          Rede Premium Hair (${salonId})`)
    console.log(`   👨‍💼 Profissionais:  ${professionalIds.length}`)
    console.log(`   ✂️  Serviços:       ${serviceIds.length}`)
    console.log(`   👤 Clientes:       ${customerIds.length}`)
    console.log(`   📅 Agendamentos:   ${appointmentCount}`)
    console.log(`   🤖 Agentes IA:     ${agentIds.length} (3 inclusos + 1 extra)`)
    console.log(`   💬 Chats:          ${chatCustomers.length}`)
    console.log('')
    console.log('🤖 Agentes:')
    for (const agent of agentIds) {
      console.log(`   - ${agent.name} (${agent.id})`)
    }
    console.log('')
    console.log('💰 Billing Enterprise:')
    console.log('   - 3 agentes inclusos no plano')
    console.log('   - 1 agente extra (R$ 150/mês)')
    console.log('   - Total extra: R$ 150/mês')
    console.log('')
    console.log('💡 Faça login em: http://localhost:3000/login')
  })

  await sql.end({ timeout: 0 })
}

main().catch((err) => {
  console.error('❌ Erro no seed:', err)
  process.exit(1)
})
