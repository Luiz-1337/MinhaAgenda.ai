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

const OWNER_EMAIL = 'pro@teste.com'
const DEFAULT_PASSWORD = 'teste123' // Senha padrão para login

/**
 * Cria ou verifica usuário no auth.users do Supabase
 */
async function createUserIfNotExists(tx, email, name, userId) {
  // Verifica se existe em auth.users
  const [existingUser] = await tx`SELECT id FROM auth.users WHERE email = ${email}`

  if (existingUser) {
    console.log(`   ✅ Usuário ${email} já existe no Auth.`)
    return existingUser.id
  }

  // Cria novo usuário
  console.log(`   🔐 Criando usuário ${email} no Auth...`)
  const encryptedPassword = await tx`SELECT crypt(${DEFAULT_PASSWORD}, gen_salt('bf')) as hash`
  const passwordHash = encryptedPassword[0].hash

  await tx`
    INSERT INTO auth.users (
      instance_id,
      id,
      aud,
      role,
      email,
      encrypted_password,
      email_confirmed_at,
      raw_app_meta_data,
      raw_user_meta_data,
      created_at,
      updated_at,
      confirmation_token,
      email_change,
      email_change_token_new,
      recovery_token
    ) VALUES (
      '00000000-0000-0000-0000-000000000000',
      ${userId},
      'authenticated',
      'authenticated',
      ${email},
      ${passwordHash},
      now(),
      '{"provider": "email", "providers": ["email"]}',
      ${tx.json({ full_name: name })},
      now(),
      now(),
      '',
      '',
      '',
      ''
    )
  `

  // Inserir em auth.identities
  const identityId = randomUUID()

  await tx`
    INSERT INTO auth.identities (
      id,
      user_id,
      identity_data,
      provider,
      provider_id,
      last_sign_in_at,
      created_at,
      updated_at
    ) VALUES (
      ${identityId},
      ${userId},
      ${tx.json({ sub: userId, email: email })},
      'email',
      ${userId},
      now(),
      now(),
      now()
    )
  `

  return userId
}

async function main() {
  console.log('🌱 Iniciando seed PRO completo para a conta:', OWNER_EMAIL)
  console.log('📊 Conectando ao banco:', url.replace(/:[^@]*@/, ':****@'))
  console.log('')

  await sql.begin(async (tx) => {
    // ============================================================================
    // 1. PERFIL OWNER PRO
    // ============================================================================
    console.log('👤 Criando perfil owner PRO...')

    let [ownerProfile] = await tx`
      SELECT id, email FROM profiles WHERE email = ${OWNER_EMAIL}
    `

    let ownerId
    if (!ownerProfile) {
      console.log(`⚠️  Profile ${OWNER_EMAIL} não encontrado. Criando...`)
      ownerId = randomUUID()

      // Criar usuário no auth.users primeiro
      await createUserIfNotExists(tx, OWNER_EMAIL, 'Maria Silva Santos', ownerId)

      await tx`
        INSERT INTO profiles (
          id, email, system_role, role, tier, full_name, first_name, last_name,
          phone, billing_address, billing_postal_code, billing_city, billing_state,
          billing_country, document_type, document_number, onboarding_completed
        )
        VALUES (
          ${ownerId}, 
          ${OWNER_EMAIL}, 
          'admin', 
          'OWNER', 
          'PRO', 
          'Maria Silva Santos',
          'Maria',
          'Silva Santos',
          '+5511999887766',
          'Av. Paulista, 1000 - Bela Vista',
          '01310-100',
          'São Paulo',
          'SP',
          'BR',
          'CPF',
          '12345678900',
          true
        )
      `
      ownerProfile = { id: ownerId, email: OWNER_EMAIL }
    } else {
      ownerId = ownerProfile.id

      // Verificar se existe no auth.users, se não, criar
      const [authUser] = await tx`SELECT id FROM auth.users WHERE email = ${OWNER_EMAIL}`
      if (!authUser) {
        await createUserIfNotExists(tx, OWNER_EMAIL, 'Maria Silva Santos', ownerId)
      }
      // Atualizar para PRO se já existir
      await tx`
        UPDATE profiles 
        SET 
          tier = 'PRO',
          role = 'OWNER',
          full_name = 'Maria Silva Santos',
          first_name = 'Maria',
          last_name = 'Silva Santos',
          phone = '+5511999887766',
          billing_address = 'Av. Paulista, 1000 - Bela Vista',
          billing_postal_code = '01310-100',
          billing_city = 'São Paulo',
          billing_state = 'SP',
          billing_country = 'BR',
          document_type = 'CPF',
          document_number = '12345678900',
          onboarding_completed = true,
          updated_at = now()
        WHERE id = ${ownerProfile.id}
      `
    }

    console.log(`✅ Owner PRO criado/atualizado: ${ownerId}`)
    console.log(`   📧 Email: ${OWNER_EMAIL}`)
    console.log(`   🔑 Senha: ${DEFAULT_PASSWORD}`)
    console.log('')

    // ============================================================================
    // 2. SALÃO 1: SALÃO PREMIUM
    // ============================================================================
    console.log('🏪 Criando Salão 1: Salão Premium...')

    const salon1Id = randomUUID()
    const workHours1 = {
      monday: { open: '08:00', close: '20:00' },
      tuesday: { open: '08:00', close: '20:00' },
      wednesday: { open: '08:00', close: '20:00' },
      thursday: { open: '08:00', close: '20:00' },
      friday: { open: '08:00', close: '21:00' },
      saturday: { open: '08:00', close: '19:00' },
      sunday: { open: '09:00', close: '17:00' }
    }

    const settings1 = {
      accepts_card: true,
      accepts_pix: true,
      parking: true,
      wifi: true,
      late_tolerance_minutes: 15,
      cancellation_policy_hours: 24,
      auto_confirm: false,
      send_reminders: true,
      reminder_hours_before: 24
    }

    await tx`
      INSERT INTO salons (id, owner_id, name, slug, whatsapp, address, phone, description, settings, work_hours, subscription_status)
      VALUES (
        ${salon1Id},
        ${ownerId},
        'Salão Premium',
        'salon-premium-pro',
        '+5511999887766',
        'Av. Paulista, 1578 - Bela Vista, São Paulo - SP, 01310-200',
        '+5511999887766',
        'Salão de beleza moderno e sofisticado no coração de São Paulo. Oferecemos cortes de cabelo, barba, tratamentos capilares, coloração e muito mais. Ambiente climatizado, estacionamento próprio e atendimento de excelência.',
        ${JSON.stringify(settings1)}::jsonb,
        ${JSON.stringify(workHours1)}::jsonb,
        'ACTIVE'
      )
      ON CONFLICT (slug) DO UPDATE SET
        name = excluded.name,
        description = excluded.description,
        settings = excluded.settings,
        work_hours = excluded.work_hours,
        subscription_status = 'ACTIVE'
    `

    // ============================================================================
    // 3. PRODUTOS SALÃO 1
    // ============================================================================
    console.log('🛍️  Criando produtos para Salão 1...')

    const products1 = [
      { name: 'Shampoo Profissional', description: 'Shampoo para todos os tipos de cabelo', price: 45.00 },
      { name: 'Condicionador Hidratante', description: 'Condicionador com hidratação profunda', price: 48.00 },
      { name: 'Máscara Capilar', description: 'Máscara de tratamento intensivo', price: 65.00 },
      { name: 'Óleo Capilar', description: 'Óleo nutritivo para pontas', price: 55.00 },
      { name: 'Pomada para Cabelo', description: 'Pomada modeladora profissional', price: 35.00 },
      { name: 'Gel Fixador', description: 'Gel de alta fixação', price: 28.00 },
      { name: 'Cera Modeladora', description: 'Cera para modelagem e textura', price: 42.00 },
      { name: 'Tônico Capilar', description: 'Tônico revitalizante', price: 38.00 },
      { name: 'Spray Termoprotetor', description: 'Proteção térmica para secador e chapinha', price: 52.00 },
      { name: 'Sérum Capilar', description: 'Sérum reparador e brilhante', price: 68.00 }
    ]

    const productIds1 = []
    for (const product of products1) {
      const [{ id }] = await tx`
        INSERT INTO products (salon_id, name, description, price, is_active)
        VALUES (${salon1Id}, ${product.name}, ${product.description}, ${product.price}, true)
        RETURNING id
      `
      productIds1.push({ id, name: product.name })
    }

    // ============================================================================
    // 4. SERVIÇOS SALÃO 1
    // ============================================================================
    console.log('✂️  Criando serviços para Salão 1...')

    const services1 = [
      { name: 'Corte Masculino', description: 'Corte moderno e estiloso com técnicas profissionais', duration: 30, price: 50.00 },
      { name: 'Corte Feminino', description: 'Corte e modelagem para mulheres', duration: 45, price: 70.00 },
      { name: 'Corte + Barba', description: 'Corte de cabelo completo + design e acabamento de barba', duration: 50, price: 80.00 },
      { name: 'Barba Completa', description: 'Design, corte e acabamento completo da barba', duration: 25, price: 40.00 },
      { name: 'Sobrancelha', description: 'Design e modelagem de sobrancelhas', duration: 15, price: 25.00 },
      { name: 'Corte + Barba + Sobrancelha', description: 'Pacote completo: corte, barba e sobrancelha', duration: 65, price: 95.00 },
      { name: 'Corte Infantil', description: 'Corte especializado para crianças', duration: 25, price: 35.00 },
      { name: 'Coloração Capilar', description: 'Coloração completa com técnicas profissionais', duration: 120, price: 200.00 },
      { name: 'Mechas', description: 'Aplicação de mechas com técnicas modernas', duration: 150, price: 250.00 },
      { name: 'Relaxamento Capilar', description: 'Tratamento para alisar e relaxar os fios', duration: 90, price: 180.00 },
      { name: 'Hidratação Capilar', description: 'Tratamento hidratante profundo para os cabelos', duration: 40, price: 70.00 },
      { name: 'Pigmentação de Barba', description: 'Técnica para dar mais volume e definição à barba', duration: 45, price: 90.00 },
      { name: 'Massagem Capilar', description: 'Massagem relaxante no couro cabeludo', duration: 20, price: 30.00 },
      { name: 'Escova Progressiva', description: 'Alisamento com escova progressiva', duration: 180, price: 320.00 },
      { name: 'Pacote Noivo', description: 'Pacote completo para noivos: corte, barba, sobrancelha e hidratação', duration: 90, price: 160.00 }
    ]

    const serviceIds1 = []
    for (const service of services1) {
      const [{ id }] = await tx`
        INSERT INTO services (salon_id, name, description, duration, price, is_active)
        VALUES (${salon1Id}, ${service.name}, ${service.description}, ${service.duration}, ${service.price}, true)
        RETURNING id
      `
      serviceIds1.push({ id, name: service.name, duration: service.duration, price: service.price })
    }

    // ============================================================================
    // 5. PROFISSIONAIS SALÃO 1
    // ============================================================================
    console.log('👨‍💼 Criando profissionais para Salão 1...')

    const pro1Ids = Array.from({ length: 4 }, () => randomUUID())

    await tx`
      INSERT INTO profiles (id, email, system_role, role, full_name, phone)
      VALUES 
        (${pro1Ids[0]}, 'carlos.mendes@salonpremium.com.br', 'user', 'PROFESSIONAL', 'Carlos Mendes', '+5511998776655'),
        (${pro1Ids[1]}, 'rafael.costa@salonpremium.com.br', 'user', 'PROFESSIONAL', 'Rafael Costa', '+5511997665544'),
        (${pro1Ids[2]}, 'thiago.oliveira@salonpremium.com.br', 'user', 'PROFESSIONAL', 'Thiago Oliveira', '+5511996554433'),
        (${pro1Ids[3]}, 'lucas.ferreira@salonpremium.com.br', 'user', 'PROFESSIONAL', 'Lucas Ferreira', '+5511995443322')
    `

    const professionals1 = [
      { profileId: pro1Ids[0], name: 'Carlos Mendes', email: 'carlos.mendes@salonpremium.com.br', phone: '+5511998776655' },
      { profileId: pro1Ids[1], name: 'Rafael Costa', email: 'rafael.costa@salonpremium.com.br', phone: '+5511997665544' },
      { profileId: pro1Ids[2], name: 'Thiago Oliveira', email: 'thiago.oliveira@salonpremium.com.br', phone: '+5511996554433' },
      { profileId: pro1Ids[3], name: 'Lucas Ferreira', email: 'lucas.ferreira@salonpremium.com.br', phone: '+5511995443322' }
    ]

    const professionalIds1 = []
    for (const pro of professionals1) {
      const [{ id }] = await tx`
        INSERT INTO professionals (salon_id, user_id, name, email, phone, role, is_active)
        VALUES (${salon1Id}, ${pro.profileId}, ${pro.name}, ${pro.email}, ${pro.phone}, 'STAFF', true)
        RETURNING id
      `
      professionalIds1.push({ id, name: pro.name })
    }

    // Associa serviços aos profissionais
    const proServices1 = [
      [0, 1, 2, 3, 4, 5, 6, 12, 14], // Carlos: cortes, barba, pacotes
      [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 13], // Rafael: tudo
      [0, 2, 3, 4, 5, 11, 12], // Thiago: cortes masculinos, barba, pigmentação
      [1, 7, 8, 9, 10, 13] // Lucas: feminino, coloração, tratamentos
    ]

    for (let i = 0; i < professionalIds1.length; i++) {
      for (const serviceIndex of proServices1[i]) {
        await tx`
          INSERT INTO professional_services (professional_id, service_id)
          VALUES (${professionalIds1[i].id}, ${serviceIds1[serviceIndex].id})
          ON CONFLICT DO NOTHING
        `
      }
    }

    // Disponibilidade dos profissionais
    // Carlos - Segunda a Sexta 9h-18h, Sábado 8h-17h, Domingo 9h-16h
    for (let day = 1; day <= 5; day++) {
      await tx`
        INSERT INTO availability (professional_id, day_of_week, start_time, end_time, is_break)
        VALUES (${professionalIds1[0].id}, ${day}, '09:00', '18:00', false)
      `
      await tx`
        INSERT INTO availability (professional_id, day_of_week, start_time, end_time, is_break)
        VALUES (${professionalIds1[0].id}, ${day}, '12:00', '13:00', true)
      `
    }
    await tx`
      INSERT INTO availability (professional_id, day_of_week, start_time, end_time, is_break)
      VALUES 
        (${professionalIds1[0].id}, 6, '08:00', '17:00', false),
        (${professionalIds1[0].id}, 6, '12:00', '13:00', true),
        (${professionalIds1[0].id}, 0, '09:00', '16:00', false),
        (${professionalIds1[0].id}, 0, '12:30', '13:30', true)
    `

    // Rafael - Terça a Sábado 10h-19h, Domingo 9h-17h
    for (let day = 2; day <= 6; day++) {
      await tx`
        INSERT INTO availability (professional_id, day_of_week, start_time, end_time, is_break)
        VALUES (${professionalIds1[1].id}, ${day}, '10:00', '19:00', false)
      `
      await tx`
        INSERT INTO availability (professional_id, day_of_week, start_time, end_time, is_break)
        VALUES (${professionalIds1[1].id}, ${day}, '13:00', '14:00', true)
      `
    }
    await tx`
      INSERT INTO availability (professional_id, day_of_week, start_time, end_time, is_break)
      VALUES 
        (${professionalIds1[1].id}, 0, '09:00', '17:00', false),
        (${professionalIds1[1].id}, 0, '13:00', '14:00', true)
    `

    // Thiago - Segunda, Quarta, Sexta 9h-18h, Sábado 8h-16h
    await tx`
      INSERT INTO availability (professional_id, day_of_week, start_time, end_time, is_break)
      VALUES 
        (${professionalIds1[2].id}, 1, '09:00', '18:00', false),
        (${professionalIds1[2].id}, 1, '12:30', '13:30', true),
        (${professionalIds1[2].id}, 3, '09:00', '18:00', false),
        (${professionalIds1[2].id}, 3, '12:30', '13:30', true),
        (${professionalIds1[2].id}, 5, '09:00', '18:00', false),
        (${professionalIds1[2].id}, 5, '12:30', '13:30', true),
        (${professionalIds1[2].id}, 6, '08:00', '16:00', false),
        (${professionalIds1[2].id}, 6, '12:00', '13:00', true)
    `

    // Lucas - Segunda a Sexta 10h-18h
    for (let day = 1; day <= 5; day++) {
      await tx`
        INSERT INTO availability (professional_id, day_of_week, start_time, end_time, is_break)
        VALUES (${professionalIds1[3].id}, ${day}, '10:00', '18:00', false)
      `
      await tx`
        INSERT INTO availability (professional_id, day_of_week, start_time, end_time, is_break)
        VALUES (${professionalIds1[3].id}, ${day}, '13:00', '14:00', true)
      `
    }

    // ============================================================================
    // 6. CLIENTES SALÃO 1
    // ============================================================================
    console.log('👤 Criando clientes para Salão 1...')

    const client1Ids = Array.from({ length: 15 }, () => randomUUID())
    const clientNames1 = [
      'Ricardo Almeida', 'Felipe Santos', 'André Souza', 'Bruno Rodrigues', 'Gabriel Lima',
      'Vinícius Martins', 'Guilherme Pereira', 'Eduardo Ribeiro', 'Daniel Carvalho', 'Marcos Dias',
      'Henrique Rocha', 'Fernando Silva', 'Roberto Costa', 'Paulo Mendes', 'Rodrigo Nunes'
    ]
    const clientPhones1 = [
      '+5511988776655', '+5511987665544', '+5511986554433', '+5511985443322', '+5511984332211',
      '+5511983221100', '+5511982110099', '+5511981009988', '+5511979998877', '+5511978887766',
      '+5511977776655', '+5511976665544', '+5511975554433', '+5511974443322', '+5511973332211'
    ]
    const clientEmails1 = [
      'ricardo.almeida@gmail.com', 'felipe.santos@hotmail.com', 'andre.souza@gmail.com', 'bruno.rodrigues@outlook.com', 'gabriel.lima@gmail.com',
      'vinicius.martins@hotmail.com', 'guilherme.pereira@gmail.com', 'eduardo.ribeiro@outlook.com', 'daniel.carvalho@gmail.com', 'marcos.dias@hotmail.com',
      'henrique.rocha@gmail.com', 'fernando.silva@outlook.com', 'roberto.costa@gmail.com', 'paulo.mendes@hotmail.com', 'rodrigo.nunes@gmail.com'
    ]

    for (let i = 0; i < client1Ids.length; i++) {
      await tx`
        INSERT INTO profiles (id, email, system_role, role, full_name, phone)
        VALUES (${client1Ids[i]}, ${clientEmails1[i]}, 'user', 'CLIENT', ${clientNames1[i]}, ${clientPhones1[i]})
        ON CONFLICT (id) DO NOTHING
      `
    }

    const customerIds1 = []
    for (let i = 0; i < client1Ids.length; i++) {
      const [{ id }] = await tx`
        INSERT INTO customers (salon_id, name, phone, email)
        VALUES (${salon1Id}, ${clientNames1[i]}, ${clientPhones1[i]}, ${clientEmails1[i]})
        ON CONFLICT (salon_id, phone) DO UPDATE SET name = excluded.name, email = excluded.email
        RETURNING id
      `
      customerIds1.push({ id, profileId: client1Ids[i], name: clientNames1[i], phone: clientPhones1[i] })
    }

    // ============================================================================
    // 7. AGENDAMENTOS SALÃO 1
    // ============================================================================
    console.log('📅 Criando agendamentos para Salão 1...')

    const now = new Date()
    const appointments1 = []

    // Agendamentos passados (últimos 60 dias) - 30 agendamentos
    for (let i = 1; i <= 30; i++) {
      const daysAgo = Math.floor(Math.random() * 60) + 1
      const date = new Date(now)
      date.setDate(date.getDate() - daysAgo)
      const hour = 9 + Math.floor(Math.random() * 9) // 9-17
      const minute = [0, 15, 30, 45][Math.floor(Math.random() * 4)]
      date.setHours(hour, minute, 0, 0)

      const proIndex = Math.floor(Math.random() * professionalIds1.length)
      let serviceIndex = Math.floor(Math.random() * serviceIds1.length)
      if (!proServices1[proIndex].includes(serviceIndex)) {
        serviceIndex = proServices1[proIndex][Math.floor(Math.random() * proServices1[proIndex].length)]
      }
      const clientIndex = Math.floor(Math.random() * customerIds1.length)

      const service = serviceIds1[serviceIndex]
      const endTime = new Date(date.getTime() + service.duration * 60 * 1000)

      const statuses = ['completed', 'completed', 'completed', 'completed', 'cancelled']
      const status = statuses[Math.floor(Math.random() * statuses.length)]

      appointments1.push({
        date,
        endTime,
        professionalId: professionalIds1[proIndex].id,
        serviceId: service.id,
        clientId: customerIds1[clientIndex].profileId,
        status,
        notes: status === 'cancelled' ? 'Cancelado pelo cliente' : null
      })
    }

    // Agendamentos futuros (próximos 60 dias) - 20 agendamentos
    for (let i = 1; i <= 20; i++) {
      const daysAhead = Math.floor(Math.random() * 60) + 1
      const date = new Date(now)
      date.setDate(date.getDate() + daysAhead)
      const hour = 9 + Math.floor(Math.random() * 9) // 9-17
      const minute = [0, 15, 30, 45][Math.floor(Math.random() * 4)]
      date.setHours(hour, minute, 0, 0)

      const proIndex = Math.floor(Math.random() * professionalIds1.length)
      let serviceIndex = Math.floor(Math.random() * serviceIds1.length)
      if (!proServices1[proIndex].includes(serviceIndex)) {
        serviceIndex = proServices1[proIndex][Math.floor(Math.random() * proServices1[proIndex].length)]
      }
      const clientIndex = Math.floor(Math.random() * customerIds1.length)

      const service = serviceIds1[serviceIndex]
      const endTime = new Date(date.getTime() + service.duration * 60 * 1000)

      const statuses = ['confirmed', 'confirmed', 'confirmed', 'pending']
      const status = statuses[Math.floor(Math.random() * statuses.length)]

      appointments1.push({
        date,
        endTime,
        professionalId: professionalIds1[proIndex].id,
        serviceId: service.id,
        clientId: customerIds1[clientIndex].profileId,
        status,
        notes: null
      })
    }

    for (const apt of appointments1) {
      if (isNaN(apt.date.getTime()) || isNaN(apt.endTime.getTime())) {
        continue
      }

      await tx`
        INSERT INTO appointments (salon_id, professional_id, client_id, service_id, date, end_time, status, notes)
        VALUES (
          ${salon1Id},
          ${apt.professionalId},
          ${apt.clientId},
          ${apt.serviceId},
          ${apt.date.toISOString()},
          ${apt.endTime.toISOString()},
          ${apt.status}::status,
          ${apt.notes}
        )
      `
    }

    // ============================================================================
    // 8. CHATS E MENSAGENS SALÃO 1
    // ============================================================================
    console.log('💬 Criando chats e mensagens para Salão 1...')

    const chatClients1 = customerIds1.slice(0, 8)

    for (const customer of chatClients1) {
      const [{ id: chatId }] = await tx`
        INSERT INTO chats (salon_id, client_phone, status)
        VALUES (${salon1Id}, ${customer.phone}, 'active')
        RETURNING id
      `

      const messages = [
        { role: 'user', content: 'Olá, gostaria de agendar um corte para esta semana.' },
        { role: 'assistant', content: 'Olá! Claro, tenho disponibilidade. Que dia e horário você prefere?' },
        { role: 'user', content: 'Prefiro quinta-feira à tarde, por volta das 15h.' },
        { role: 'assistant', content: 'Perfeito! Tenho horário disponível na quinta-feira às 15h. Qual serviço você deseja?' },
        { role: 'user', content: 'Corte + barba, por favor.' },
        { role: 'assistant', content: 'Ótimo! Agendado para quinta-feira às 15h - Corte + Barba.' }
      ]

      for (const msg of messages) {
        await tx`
          INSERT INTO messages (chat_id, role, content)
          VALUES (${chatId}, ${msg.role}::chat_message_role, ${msg.content})
        `
      }

      await tx`
        -- INSERT INTO chat_messages (salon_id, client_id, role, content)
        -- VALUES 
        --   (${salon1Id}, ${customer.profileId}, 'user', 'Olá, gostaria de agendar um corte para esta semana.'),
        --   (${salon1Id}, ${customer.profileId}, 'assistant', 'Olá! Claro, tenho disponibilidade. Que dia e horário você prefere?'),
        --   (${salon1Id}, ${customer.profileId}, 'user', 'Prefiro quinta-feira à tarde, por volta das 15h.'),
        --   (${salon1Id}, ${customer.profileId}, 'assistant', 'Perfeito! Tenho horário disponível na quinta-feira às 15h. Qual serviço você deseja?')
      `
    }

    // ============================================================================
    // 9. LEADS SALÃO 1
    // ============================================================================
    console.log('🎯 Criando leads para Salão 1...')

    const leadsData1 = [
      { phone: '+5511967776655', name: 'Roberto Santos', email: 'roberto.santos@gmail.com', source: 'instagram', status: 'new', notes: 'Interessado em corte + barba' },
      { phone: '+5511966665544', name: 'Daniel Alves', email: 'daniel.alves@hotmail.com', source: 'facebook', status: 'new', notes: 'Primeira vez no salão' },
      { phone: '+5511965554433', name: 'Eduardo Lima', email: 'eduardo.lima@gmail.com', source: 'google', status: 'recently_scheduled', notes: 'Agendou para próxima semana' },
      { phone: '+5511964443322', name: 'Fernando Rocha', email: 'fernando.rocha@outlook.com', source: 'indicacao', status: 'new', notes: 'Indicado por cliente existente' },
      { phone: '+5511963332211', name: 'Henrique Dias', email: 'henrique.dias@gmail.com', source: 'whatsapp', status: 'cold', notes: 'Não respondeu há mais de 30 dias' },
      { phone: '+5511962221100', name: 'Marcelo Pereira', email: 'marcelo.pereira@hotmail.com', source: 'instagram', status: 'new', notes: 'Interessado em coloração' },
      { phone: '+5511961110099', name: 'Sérgio Ramos', email: 'sergio.ramos@gmail.com', source: 'google', status: 'recently_scheduled', notes: 'Agendamento confirmado' },
      { phone: '+5511960009988', name: 'Antonio Moreira', email: 'antonio.moreira@outlook.com', source: 'whatsapp', status: 'new', notes: 'Solicitou orçamento' }
    ]

    for (const lead of leadsData1) {
      await tx`
        INSERT INTO leads (salon_id, phone_number, name, email, source, status, notes, last_contact_at)
        VALUES (
          ${salon1Id},
          ${lead.phone},
          ${lead.name},
          ${lead.email},
          ${lead.source},
          ${lead.status}::lead_status,
          ${lead.notes},
          ${lead.status === 'recently_scheduled' ? now.toISOString() : null}
        )
      `
    }

    // ============================================================================
    // 10. CAMPANHAS SALÃO 1
    // ============================================================================
    console.log('📢 Criando campanhas para Salão 1...')

    const campaign1Start = new Date(now)
    campaign1Start.setDate(campaign1Start.getDate() - 7)
    const campaign1End = new Date(now)
    campaign1End.setDate(campaign1End.getDate() + 21)

    const [{ id: campaign1Id }] = await tx`
      INSERT INTO campaigns (salon_id, name, description, status, starts_at, ends_at)
      VALUES (
        ${salon1Id},
        'Promoção de Verão',
        'Desconto de 20% em todos os serviços durante o verão',
        'active',
        ${campaign1Start.toISOString()},
        ${campaign1End.toISOString()}
      )
      RETURNING id
    `

    const campaign2Start = new Date(now)
    campaign2Start.setDate(campaign2Start.getDate() - 30)
    const campaign2End = new Date(now)
    campaign2End.setDate(campaign2End.getDate() - 1)

    const [{ id: campaign2Id }] = await tx`
      INSERT INTO campaigns (salon_id, name, description, status, starts_at, ends_at)
      VALUES (
        ${salon1Id},
        'Campanha de Boas Vindas',
        'Mensagem de boas vindas para novos clientes',
        'completed',
        ${campaign2Start.toISOString()},
        ${campaign2End.toISOString()}
      )
      RETURNING id
    `

    const customerIdsForCampaigns1 = await tx`
      SELECT id FROM customers WHERE salon_id = ${salon1Id} LIMIT 8
    `

    for (const customer of customerIdsForCampaigns1) {
      await tx`
        INSERT INTO campaign_recipients (campaign_id, customer_id)
        VALUES (${campaign1Id}, ${customer.id})
        ON CONFLICT DO NOTHING
      `
      if (Math.random() > 0.5) {
        await tx`
          INSERT INTO campaign_recipients (campaign_id, customer_id)
          VALUES (${campaign2Id}, ${customer.id})
          ON CONFLICT DO NOTHING
        `
      }
    }

    console.log('✅ Salão 1 criado com sucesso!')
    console.log('')

    // ============================================================================
    // 11. SALÃO 2: BELEZA & ESTILO
    // ============================================================================
    console.log('🏪 Criando Salão 2: Beleza & Estilo...')

    const salon2Id = randomUUID()
    const workHours2 = {
      monday: { open: '09:00', close: '19:00' },
      tuesday: { open: '09:00', close: '19:00' },
      wednesday: { open: '09:00', close: '19:00' },
      thursday: { open: '09:00', close: '19:00' },
      friday: { open: '09:00', close: '20:00' },
      saturday: { open: '08:00', close: '18:00' },
      sunday: { open: null, close: null }
    }

    const settings2 = {
      accepts_card: true,
      accepts_pix: true,
      parking: false,
      wifi: true,
      late_tolerance_minutes: 20,
      cancellation_policy_hours: 48,
      auto_confirm: true,
      send_reminders: true,
      reminder_hours_before: 48
    }

    await tx`
      INSERT INTO salons (id, owner_id, name, slug, whatsapp, address, phone, description, settings, work_hours, subscription_status)
      VALUES (
        ${salon2Id},
        ${ownerId},
        'Beleza & Estilo',
        'beleza-estilo-pro',
        '+5511999887755',
        'Rua Augusta, 2000 - Consolação, São Paulo - SP, 01413-000',
        '+5511999887755',
        'Salão especializado em beleza feminina e masculina. Oferecemos serviços completos de corte, coloração, tratamentos capilares, maquiagem e muito mais. Ambiente acolhedor e profissionais qualificados.',
        ${JSON.stringify(settings2)}::jsonb,
        ${JSON.stringify(workHours2)}::jsonb,
        'ACTIVE'
      )
      ON CONFLICT (slug) DO UPDATE SET
        name = excluded.name,
        description = excluded.description,
        settings = excluded.settings,
        work_hours = excluded.work_hours,
        subscription_status = 'ACTIVE'
    `

    // ============================================================================
    // 12. PRODUTOS SALÃO 2
    // ============================================================================
    console.log('🛍️  Criando produtos para Salão 2...')

    const products2 = [
      { name: 'Linha Profissional Shampoo', description: 'Shampoo profissional de alta qualidade', price: 52.00 },
      { name: 'Linha Profissional Condicionador', description: 'Condicionador profissional', price: 55.00 },
      { name: 'Kit Tratamento Completo', description: 'Kit com shampoo, condicionador e máscara', price: 150.00 },
      { name: 'Acessório Pente Profissional', description: 'Pente de qualidade profissional', price: 25.00 },
      { name: 'Escova Circular', description: 'Escova circular para modelagem', price: 45.00 },
      { name: 'Secador Profissional', description: 'Secador de cabelo profissional', price: 280.00 },
      { name: 'Chapinha Cerâmica', description: 'Chapinha com placas cerâmicas', price: 320.00 },
      { name: 'Kit Maquiagem Básico', description: 'Kit com produtos básicos de maquiagem', price: 180.00 },
      { name: 'Perfume Importado', description: 'Perfume importado de alta qualidade', price: 220.00 },
      { name: 'Creme para Barba', description: 'Creme hidratante para barba', price: 48.00 }
    ]

    const productIds2 = []
    for (const product of products2) {
      const [{ id }] = await tx`
        INSERT INTO products (salon_id, name, description, price, is_active)
        VALUES (${salon2Id}, ${product.name}, ${product.description}, ${product.price}, true)
        RETURNING id
      `
      productIds2.push({ id, name: product.name })
    }

    // ============================================================================
    // 13. SERVIÇOS SALÃO 2
    // ============================================================================
    console.log('✂️  Criando serviços para Salão 2...')

    const services2 = [
      { name: 'Corte Masculino Premium', description: 'Corte masculino com técnicas avançadas', duration: 35, price: 55.00 },
      { name: 'Corte Feminino Premium', description: 'Corte e modelagem feminina premium', duration: 50, price: 80.00 },
      { name: 'Corte + Barba Premium', description: 'Pacote completo premium', duration: 55, price: 90.00 },
      { name: 'Coloração Completa', description: 'Coloração completa com técnicas profissionais', duration: 130, price: 220.00 },
      { name: 'Mechas Californianas', description: 'Mechas californianas modernas', duration: 160, price: 280.00 },
      { name: 'Tratamento Capilar Intensivo', description: 'Tratamento profundo para cabelos danificados', duration: 60, price: 120.00 },
      { name: 'Escova Modelada', description: 'Escova com modelagem e finalização', duration: 45, price: 65.00 },
      { name: 'Penteado para Eventos', description: 'Penteado especial para eventos', duration: 90, price: 150.00 },
      { name: 'Maquiagem Completa', description: 'Maquiagem profissional completa', duration: 60, price: 100.00 },
      { name: 'Maquiagem para Noivas', description: 'Maquiagem especial para noivas', duration: 120, price: 250.00 },
      { name: 'Design de Sobrancelhas', description: 'Design e modelagem de sobrancelhas', duration: 20, price: 30.00 },
      { name: 'Hidratação Profunda', description: 'Hidratação profunda com produtos premium', duration: 50, price: 85.00 },
      { name: 'Relaxamento Capilar', description: 'Relaxamento com produtos de alta qualidade', duration: 100, price: 200.00 },
      { name: 'Pacote Beleza Completa', description: 'Pacote completo: corte, escova e maquiagem', duration: 120, price: 200.00 }
    ]

    const serviceIds2 = []
    for (const service of services2) {
      const [{ id }] = await tx`
        INSERT INTO services (salon_id, name, description, duration, price, is_active)
        VALUES (${salon2Id}, ${service.name}, ${service.description}, ${service.duration}, ${service.price}, true)
        RETURNING id
      `
      serviceIds2.push({ id, name: service.name, duration: service.duration, price: service.price })
    }

    // ============================================================================
    // 14. PROFISSIONAIS SALÃO 2
    // ============================================================================
    console.log('👨‍💼 Criando profissionais para Salão 2...')

    const pro2Ids = Array.from({ length: 3 }, () => randomUUID())

    await tx`
      INSERT INTO profiles (id, email, system_role, role, full_name, phone)
      VALUES 
        (${pro2Ids[0]}, 'ana.santos@belezaestilo.com.br', 'user', 'PROFESSIONAL', 'Ana Santos', '+5511998776644'),
        (${pro2Ids[1]}, 'julia.oliveira@belezaestilo.com.br', 'user', 'PROFESSIONAL', 'Julia Oliveira', '+5511997665533'),
        (${pro2Ids[2]}, 'maria.ferreira@belezaestilo.com.br', 'user', 'PROFESSIONAL', 'Maria Ferreira', '+5511996554422')
    `

    const professionals2 = [
      { profileId: pro2Ids[0], name: 'Ana Santos', email: 'ana.santos@belezaestilo.com.br', phone: '+5511998776644' },
      { profileId: pro2Ids[1], name: 'Julia Oliveira', email: 'julia.oliveira@belezaestilo.com.br', phone: '+5511997665533' },
      { profileId: pro2Ids[2], name: 'Maria Ferreira', email: 'maria.ferreira@belezaestilo.com.br', phone: '+5511996554422' }
    ]

    const professionalIds2 = []
    for (const pro of professionals2) {
      const [{ id }] = await tx`
        INSERT INTO professionals (salon_id, user_id, name, email, phone, role, is_active)
        VALUES (${salon2Id}, ${pro.profileId}, ${pro.name}, ${pro.email}, ${pro.phone}, 'STAFF', true)
        RETURNING id
      `
      professionalIds2.push({ id, name: pro.name })
    }

    // Associa serviços aos profissionais
    const proServices2 = [
      [0, 1, 2, 3, 4, 5, 6, 7, 10, 11, 12, 13], // Ana: tudo
      [1, 3, 4, 5, 6, 7, 8, 9, 11, 13], // Julia: feminino, coloração, maquiagem
      [0, 2, 3, 4, 5, 10, 11, 12] // Maria: cortes, tratamentos
    ]

    for (let i = 0; i < professionalIds2.length; i++) {
      for (const serviceIndex of proServices2[i]) {
        await tx`
          INSERT INTO professional_services (professional_id, service_id)
          VALUES (${professionalIds2[i].id}, ${serviceIds2[serviceIndex].id})
          ON CONFLICT DO NOTHING
        `
      }
    }

    // Disponibilidade dos profissionais
    // Ana - Segunda a Sexta 9h-18h, Sábado 8h-17h
    for (let day = 1; day <= 5; day++) {
      await tx`
        INSERT INTO availability (professional_id, day_of_week, start_time, end_time, is_break)
        VALUES (${professionalIds2[0].id}, ${day}, '09:00', '18:00', false)
      `
      await tx`
        INSERT INTO availability (professional_id, day_of_week, start_time, end_time, is_break)
        VALUES (${professionalIds2[0].id}, ${day}, '12:30', '13:30', true)
      `
    }
    await tx`
      INSERT INTO availability (professional_id, day_of_week, start_time, end_time, is_break)
      VALUES 
        (${professionalIds2[0].id}, 6, '08:00', '17:00', false),
        (${professionalIds2[0].id}, 6, '12:00', '13:00', true)
    `

    // Julia - Terça a Sábado 10h-19h
    for (let day = 2; day <= 6; day++) {
      await tx`
        INSERT INTO availability (professional_id, day_of_week, start_time, end_time, is_break)
        VALUES (${professionalIds2[1].id}, ${day}, '10:00', '19:00', false)
      `
      await tx`
        INSERT INTO availability (professional_id, day_of_week, start_time, end_time, is_break)
        VALUES (${professionalIds2[1].id}, ${day}, '13:00', '14:00', true)
      `
    }

    // Maria - Segunda, Quarta, Sexta 9h-18h, Sábado 8h-16h
    await tx`
      INSERT INTO availability (professional_id, day_of_week, start_time, end_time, is_break)
      VALUES 
        (${professionalIds2[2].id}, 1, '09:00', '18:00', false),
        (${professionalIds2[2].id}, 1, '12:30', '13:30', true),
        (${professionalIds2[2].id}, 3, '09:00', '18:00', false),
        (${professionalIds2[2].id}, 3, '12:30', '13:30', true),
        (${professionalIds2[2].id}, 5, '09:00', '18:00', false),
        (${professionalIds2[2].id}, 5, '12:30', '13:30', true),
        (${professionalIds2[2].id}, 6, '08:00', '16:00', false),
        (${professionalIds2[2].id}, 6, '12:00', '13:00', true)
    `

    // ============================================================================
    // 15. CLIENTES SALÃO 2
    // ============================================================================
    console.log('👤 Criando clientes para Salão 2...')

    const client2Ids = Array.from({ length: 12 }, () => randomUUID())
    const clientNames2 = [
      'Patricia Alves', 'Camila Costa', 'Fernanda Lima', 'Juliana Silva', 'Beatriz Santos',
      'Larissa Oliveira', 'Amanda Rodrigues', 'Mariana Pereira', 'Isabela Martins', 'Gabriela Souza',
      'Carolina Rocha', 'Vanessa Dias'
    ]
    const clientPhones2 = [
      '+5511988776644', '+5511987665533', '+5511986554422', '+5511985443311', '+5511984332200',
      '+5511983221199', '+5511982110088', '+5511981009977', '+5511979998866', '+5511978887755',
      '+5511977776644', '+5511976665533'
    ]
    const clientEmails2 = [
      'patricia.alves@gmail.com', 'camila.costa@hotmail.com', 'fernanda.lima@gmail.com', 'juliana.silva@outlook.com', 'beatriz.santos@gmail.com',
      'larissa.oliveira@hotmail.com', 'amanda.rodrigues@gmail.com', 'mariana.pereira@outlook.com', 'isabela.martins@gmail.com', 'gabriela.souza@hotmail.com',
      'carolina.rocha@gmail.com', 'vanessa.dias@outlook.com'
    ]

    for (let i = 0; i < client2Ids.length; i++) {
      await tx`
        INSERT INTO profiles (id, email, system_role, role, full_name, phone)
        VALUES (${client2Ids[i]}, ${clientEmails2[i]}, 'user', 'CLIENT', ${clientNames2[i]}, ${clientPhones2[i]})
        ON CONFLICT (id) DO NOTHING
      `
    }

    const customerIds2 = []
    for (let i = 0; i < client2Ids.length; i++) {
      const [{ id }] = await tx`
        INSERT INTO customers (salon_id, name, phone, email)
        VALUES (${salon2Id}, ${clientNames2[i]}, ${clientPhones2[i]}, ${clientEmails2[i]})
        ON CONFLICT (salon_id, phone) DO UPDATE SET name = excluded.name, email = excluded.email
        RETURNING id
      `
      customerIds2.push({ id, profileId: client2Ids[i], name: clientNames2[i], phone: clientPhones2[i] })
    }

    // ============================================================================
    // 16. AGENDAMENTOS SALÃO 2
    // ============================================================================
    console.log('📅 Criando agendamentos para Salão 2...')

    const appointments2 = []

    // Agendamentos passados (últimos 60 dias) - 25 agendamentos
    for (let i = 1; i <= 25; i++) {
      const daysAgo = Math.floor(Math.random() * 60) + 1
      const date = new Date(now)
      date.setDate(date.getDate() - daysAgo)
      const hour = 9 + Math.floor(Math.random() * 9) // 9-17
      const minute = [0, 15, 30, 45][Math.floor(Math.random() * 4)]
      date.setHours(hour, minute, 0, 0)

      const proIndex = Math.floor(Math.random() * professionalIds2.length)
      let serviceIndex = Math.floor(Math.random() * serviceIds2.length)
      if (!proServices2[proIndex].includes(serviceIndex)) {
        serviceIndex = proServices2[proIndex][Math.floor(Math.random() * proServices2[proIndex].length)]
      }
      const clientIndex = Math.floor(Math.random() * customerIds2.length)

      const service = serviceIds2[serviceIndex]
      const endTime = new Date(date.getTime() + service.duration * 60 * 1000)

      const statuses = ['completed', 'completed', 'completed', 'completed', 'cancelled']
      const status = statuses[Math.floor(Math.random() * statuses.length)]

      appointments2.push({
        date,
        endTime,
        professionalId: professionalIds2[proIndex].id,
        serviceId: service.id,
        clientId: customerIds2[clientIndex].profileId,
        status,
        notes: status === 'cancelled' ? 'Cancelado pelo cliente' : null
      })
    }

    // Agendamentos futuros (próximos 60 dias) - 15 agendamentos
    for (let i = 1; i <= 15; i++) {
      const daysAhead = Math.floor(Math.random() * 60) + 1
      const date = new Date(now)
      date.setDate(date.getDate() + daysAhead)
      const hour = 9 + Math.floor(Math.random() * 9) // 9-17
      const minute = [0, 15, 30, 45][Math.floor(Math.random() * 4)]
      date.setHours(hour, minute, 0, 0)

      const proIndex = Math.floor(Math.random() * professionalIds2.length)
      let serviceIndex = Math.floor(Math.random() * serviceIds2.length)
      if (!proServices2[proIndex].includes(serviceIndex)) {
        serviceIndex = proServices2[proIndex][Math.floor(Math.random() * proServices2[proIndex].length)]
      }
      const clientIndex = Math.floor(Math.random() * customerIds2.length)

      const service = serviceIds2[serviceIndex]
      const endTime = new Date(date.getTime() + service.duration * 60 * 1000)

      const statuses = ['confirmed', 'confirmed', 'confirmed', 'pending']
      const status = statuses[Math.floor(Math.random() * statuses.length)]

      appointments2.push({
        date,
        endTime,
        professionalId: professionalIds2[proIndex].id,
        serviceId: service.id,
        clientId: customerIds2[clientIndex].profileId,
        status,
        notes: null
      })
    }

    for (const apt of appointments2) {
      if (isNaN(apt.date.getTime()) || isNaN(apt.endTime.getTime())) {
        continue
      }

      await tx`
        INSERT INTO appointments (salon_id, professional_id, client_id, service_id, date, end_time, status, notes)
        VALUES (
          ${salon2Id},
          ${apt.professionalId},
          ${apt.clientId},
          ${apt.serviceId},
          ${apt.date.toISOString()},
          ${apt.endTime.toISOString()},
          ${apt.status}::status,
          ${apt.notes}
        )
      `
    }

    // ============================================================================
    // 17. CHATS E MENSAGENS SALÃO 2
    // ============================================================================
    console.log('💬 Criando chats e mensagens para Salão 2...')

    const chatClients2 = customerIds2.slice(0, 6)

    for (const customer of chatClients2) {
      const [{ id: chatId }] = await tx`
        INSERT INTO chats (salon_id, client_phone, status)
        VALUES (${salon2Id}, ${customer.phone}, 'active')
        RETURNING id
      `

      const messages = [
        { role: 'user', content: 'Olá, gostaria de agendar uma coloração.' },
        { role: 'assistant', content: 'Olá! Claro, temos disponibilidade. Que dia você prefere?' },
        { role: 'user', content: 'Prefiro na próxima semana, quarta-feira.' },
        { role: 'assistant', content: 'Perfeito! Tenho horário disponível na quarta-feira às 14h. Qual tipo de coloração você deseja?' },
        { role: 'user', content: 'Coloração completa, por favor.' },
        { role: 'assistant', content: 'Ótimo! Agendado para quarta-feira às 14h - Coloração Completa.' }
      ]

      for (const msg of messages) {
        await tx`
          INSERT INTO messages (chat_id, role, content)
          VALUES (${chatId}, ${msg.role}::chat_message_role, ${msg.content})
        `
      }

      await tx`
        -- INSERT INTO chat_messages (salon_id, client_id, role, content)
        -- VALUES 
        --   (${salon2Id}, ${customer.profileId}, 'user', 'Olá, gostaria de agendar uma coloração.'),
        --   (${salon2Id}, ${customer.profileId}, 'assistant', 'Olá! Claro, temos disponibilidade. Que dia você prefere?'),
        --   (${salon2Id}, ${customer.profileId}, 'user', 'Prefiro na próxima semana, quarta-feira.'),
        --   (${salon2Id}, ${customer.profileId}, 'assistant', 'Perfeito! Tenho horário disponível na quarta-feira às 14h. Qual tipo de coloração você deseja?')
      `
    }

    // ============================================================================
    // 18. LEADS SALÃO 2
    // ============================================================================
    console.log('🎯 Criando leads para Salão 2...')

    const leadsData2 = [
      { phone: '+5511965554433', name: 'Renata Silva', email: 'renata.silva@gmail.com', source: 'instagram', status: 'new', notes: 'Interessada em mechas' },
      { phone: '+5511964443322', name: 'Cristina Alves', email: 'cristina.alves@hotmail.com', source: 'facebook', status: 'new', notes: 'Primeira vez no salão' },
      { phone: '+5511963332211', name: 'Luciana Costa', email: 'luciana.costa@gmail.com', source: 'google', status: 'recently_scheduled', notes: 'Agendou para próxima semana' },
      { phone: '+5511962221100', name: 'Sandra Lima', email: 'sandra.lima@outlook.com', source: 'indicacao', status: 'new', notes: 'Indicada por cliente existente' },
      { phone: '+5511961110099', name: 'Monica Santos', email: 'monica.santos@gmail.com', source: 'whatsapp', status: 'cold', notes: 'Não respondeu há mais de 30 dias' },
      { phone: '+5511960009988', name: 'Tatiana Oliveira', email: 'tatiana.oliveira@hotmail.com', source: 'instagram', status: 'new', notes: 'Interessada em maquiagem para noivas' }
    ]

    for (const lead of leadsData2) {
      await tx`
        INSERT INTO leads (salon_id, phone_number, name, email, source, status, notes, last_contact_at)
        VALUES (
          ${salon2Id},
          ${lead.phone},
          ${lead.name},
          ${lead.email},
          ${lead.source},
          ${lead.status}::lead_status,
          ${lead.notes},
          ${lead.status === 'recently_scheduled' ? now.toISOString() : null}
        )
      `
    }

    // ============================================================================
    // 19. CAMPANHAS SALÃO 2
    // ============================================================================
    console.log('📢 Criando campanhas para Salão 2...')

    const campaign3Start = new Date(now)
    campaign3Start.setDate(campaign3Start.getDate() - 5)
    const campaign3End = new Date(now)
    campaign3End.setDate(campaign3End.getDate() + 25)

    const [{ id: campaign3Id }] = await tx`
      INSERT INTO campaigns (salon_id, name, description, status, starts_at, ends_at)
      VALUES (
        ${salon2Id},
        'Promoção Primavera',
        'Desconto de 15% em todos os serviços de coloração',
        'active',
        ${campaign3Start.toISOString()},
        ${campaign3End.toISOString()}
      )
      RETURNING id
    `

    const campaign4Start = new Date(now)
    campaign4Start.setDate(campaign4Start.getDate() - 25)
    const campaign4End = new Date(now)
    campaign4End.setDate(campaign4End.getDate() - 2)

    const [{ id: campaign4Id }] = await tx`
      INSERT INTO campaigns (salon_id, name, description, status, starts_at, ends_at)
      VALUES (
        ${salon2Id},
        'Campanha de Fidelidade',
        'Programa de fidelidade para clientes frequentes',
        'completed',
        ${campaign4Start.toISOString()},
        ${campaign4End.toISOString()}
      )
      RETURNING id
    `

    const customerIdsForCampaigns2 = await tx`
      SELECT id FROM customers WHERE salon_id = ${salon2Id} LIMIT 6
    `

    for (const customer of customerIdsForCampaigns2) {
      await tx`
        INSERT INTO campaign_recipients (campaign_id, customer_id)
        VALUES (${campaign3Id}, ${customer.id})
        ON CONFLICT DO NOTHING
      `
      if (Math.random() > 0.5) {
        await tx`
          INSERT INTO campaign_recipients (campaign_id, customer_id)
          VALUES (${campaign4Id}, ${customer.id})
          ON CONFLICT DO NOTHING
        `
      }
    }

    console.log('✅ Salão 2 criado com sucesso!')
    console.log('')

    // ============================================================================
    // 20. INTEGRAÇÕES GOOGLE CALENDAR
    // ============================================================================
    console.log('🔗 Criando integrações Google Calendar...')

    // Integração Salão 1
    await tx`
      INSERT INTO salon_integrations (salon_id, provider, refresh_token, access_token, expires_at, email)
      VALUES (
        ${salon1Id},
        'google',
        'refresh_token_demo_salon1',
        'access_token_demo_salon1',
        ${Math.floor(Date.now() / 1000) + 3600},
        'salonpremium@gmail.com'
      )
      ON CONFLICT (salon_id, provider) DO UPDATE SET
        refresh_token = excluded.refresh_token,
        access_token = excluded.access_token,
        expires_at = excluded.expires_at
    `

    // Integração Salão 2
    await tx`
      INSERT INTO salon_integrations (salon_id, provider, refresh_token, access_token, expires_at, email)
      VALUES (
        ${salon2Id},
        'google',
        'refresh_token_demo_salon2',
        'access_token_demo_salon2',
        ${Math.floor(Date.now() / 1000) + 3600},
        'belezaestilo@gmail.com'
      )
      ON CONFLICT (salon_id, provider) DO UPDATE SET
        refresh_token = excluded.refresh_token,
        access_token = excluded.access_token,
        expires_at = excluded.expires_at
    `

    // Integrações por profissional - Salão 1
    for (const pro of professionalIds1) {
      // await tx`
      //   INSERT INTO integrations (provider, salon_id, professional_id, access_token, refresh_token, token_type, scope, expires_at)
      //   VALUES (
      //     'google',
      //     ${salon1Id},
      //     ${pro.id},
      //     'access_token_demo',
      //     'refresh_token_demo',
      //     'Bearer',
      //     'https://www.googleapis.com/auth/calendar',
      //     ${new Date(Date.now() + 3600000).toISOString()}
      //   )
      // `
    }

    // Integrações por profissional - Salão 2
    for (const pro of professionalIds2) {
      await tx`
        -- INSERT INTO integrations (provider, salon_id, professional_id, access_token, refresh_token, token_type, scope, expires_at)
        -- VALUES (
        --   'google',
        --   ${salon2Id},
        --   ${pro.id},
        --   'access_token_demo',
        --   'refresh_token_demo',
        --   'Bearer',
        --   'https://www.googleapis.com/auth/calendar',
        --   ${new Date(Date.now() + 3600000).toISOString()}
        -- )
      `
    }

    // ============================================================================
    // 21. ESTATÍSTICAS DE IA
    // ============================================================================
    console.log('📊 Criando estatísticas de IA...')

    const models = ['gpt-5.4-mini-2026-03-17', 'gpt-4o', 'gpt-4.1']

    // Estatísticas Salão 1 - últimos 30 dias
    for (let i = 0; i < 30; i++) {
      const date = new Date(now)
      date.setDate(date.getDate() - i)

      for (const model of models) {
        const credits = Math.floor(Math.random() * 150) + 20
        await tx`
          INSERT INTO ai_usage_stats (salon_id, date, model, credits)
          VALUES (${salon1Id}, ${date.toISOString().split('T')[0]}::date, ${model}, ${credits})
          ON CONFLICT (salon_id, date, model) DO UPDATE SET credits = excluded.credits
        `
      }
    }

    // Estatísticas Salão 2 - últimos 30 dias
    for (let i = 0; i < 30; i++) {
      const date = new Date(now)
      date.setDate(date.getDate() - i)

      for (const model of models) {
        const credits = Math.floor(Math.random() * 150) + 20
        await tx`
          INSERT INTO ai_usage_stats (salon_id, date, model, credits)
          VALUES (${salon2Id}, ${date.toISOString().split('T')[0]}::date, ${model}, ${credits})
          ON CONFLICT (salon_id, date, model) DO UPDATE SET credits = excluded.credits
        `
      }
    }

    // Estatísticas por agente - Salão 1
    const agents = ['scheduling_agent', 'customer_service_agent', 'marketing_agent']
    for (const agent of agents) {
      const totalCredits = Math.floor(Math.random() * 8000) + 2000
      await tx`
        INSERT INTO agent_stats (salon_id, agent_name, total_credits)
        VALUES (${salon1Id}, ${agent}, ${totalCredits})
        ON CONFLICT (salon_id, agent_name) DO UPDATE SET total_credits = excluded.total_credits
      `
    }

    // Estatísticas por agente - Salão 2
    for (const agent of agents) {
      const totalCredits = Math.floor(Math.random() * 8000) + 2000
      await tx`
        INSERT INTO agent_stats (salon_id, agent_name, total_credits)
        VALUES (${salon2Id}, ${agent}, ${totalCredits})
        ON CONFLICT (salon_id, agent_name) DO UPDATE SET total_credits = excluded.total_credits
      `
    }

    // ============================================================================
    // 22. SCHEDULE OVERRIDES
    // ============================================================================
    console.log('⏰ Criando exceções de horário...')

    const overrideReasons = ['Férias', 'Consulta médica', 'Treinamento', 'Evento pessoal', 'Folga']

    // Overrides Salão 1
    for (let i = 0; i < 5; i++) {
      const daysAhead = Math.floor(Math.random() * 30) + 1
      const date = new Date(now)
      date.setDate(date.getDate() + daysAhead)
      date.setHours(9, 0, 0, 0)

      const endDate = new Date(date)
      endDate.setHours(18, 0, 0, 0)

      const proIndex = Math.floor(Math.random() * professionalIds1.length)
      const reason = overrideReasons[Math.floor(Math.random() * overrideReasons.length)]

      await tx`
        INSERT INTO schedule_overrides (salon_id, professional_id, start_time, end_time, reason)
        VALUES (${salon1Id}, ${professionalIds1[proIndex].id}, ${date.toISOString()}, ${endDate.toISOString()}, ${reason})
      `
    }

    // Overrides Salão 2
    for (let i = 0; i < 4; i++) {
      const daysAhead = Math.floor(Math.random() * 30) + 1
      const date = new Date(now)
      date.setDate(date.getDate() + daysAhead)
      date.setHours(9, 0, 0, 0)

      const endDate = new Date(date)
      endDate.setHours(18, 0, 0, 0)

      const proIndex = Math.floor(Math.random() * professionalIds2.length)
      const reason = overrideReasons[Math.floor(Math.random() * overrideReasons.length)]

      await tx`
        INSERT INTO schedule_overrides (salon_id, professional_id, start_time, end_time, reason)
        VALUES (${salon2Id}, ${professionalIds2[proIndex].id}, ${date.toISOString()}, ${endDate.toISOString()}, ${reason})
      `
    }

    console.log('')
    console.log('✅ Seed PRO completo finalizado com sucesso!')
    console.log('')
    console.log('📋 Resumo:')
    console.log(`   👤 Owner PRO: ${ownerId}`)
    console.log(`   🏪 Salões: 2`)
    console.log(`      - Salão 1 (Salão Premium): ${salon1Id}`)
    console.log(`      - Salão 2 (Beleza & Estilo): ${salon2Id}`)
    console.log(`   🛍️  Produtos: ${products1.length + products2.length} (${products1.length} + ${products2.length})`)
    console.log(`   ✂️  Serviços: ${services1.length + services2.length} (${services1.length} + ${services2.length})`)
    console.log(`   👨‍💼 Profissionais: ${professionalIds1.length + professionalIds2.length} (${professionalIds1.length} + ${professionalIds2.length})`)
    console.log(`   👤 Clientes: ${customerIds1.length + customerIds2.length} (${customerIds1.length} + ${customerIds2.length})`)
    console.log(`   📅 Agendamentos: ${appointments1.length + appointments2.length} (${appointments1.length} + ${appointments2.length})`)
    console.log(`   💬 Chats: ${chatClients1.length + chatClients2.length} (${chatClients1.length} + ${chatClients2.length})`)
    console.log(`   🎯 Leads: ${leadsData1.length + leadsData2.length} (${leadsData1.length} + ${leadsData2.length})`)
    console.log(`   📢 Campanhas: 4 (2 + 2)`)
    console.log(`   🔗 Integrações: Google Calendar configurado para ambos os salões`)
    console.log(`   📊 Estatísticas: Dados de IA dos últimos 30 dias para ambos os salões`)
  })

  await sql.end({ timeout: 0 })
}

main().catch((err) => {
  console.error('❌ Erro no seed:', err)
  process.exit(1)
})

