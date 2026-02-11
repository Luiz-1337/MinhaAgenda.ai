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

const OWNER_EMAIL = 'solo@teste.com'

async function main() {
  console.log('🌱 Iniciando seed completo para a conta:', OWNER_EMAIL)
  console.log('📊 Conectando ao banco:', url.replace(/:[^@]*@/, ':****@'))
  console.log('')

  await sql.begin(async (tx) => {
    // Buscar ou criar o profile do owner
    let [ownerProfile] = await tx`
      SELECT id, email FROM profiles WHERE email = ${OWNER_EMAIL}
    `

    if (!ownerProfile) {
      console.log(`⚠️  Profile ${OWNER_EMAIL} não encontrado. Criando...`)
      const ownerId = randomUUID()
      await tx`
        INSERT INTO profiles (id, email, system_role, tier, full_name, phone, onboarding_completed)
        VALUES (${ownerId}, ${OWNER_EMAIL}, 'admin', 'SOLO', 'Dono do Salão', '+5511999887766', false)
      `
      ownerProfile = { id: ownerId, email: OWNER_EMAIL }
    }

    const ownerId = ownerProfile.id
    console.log(`✅ Owner encontrado: ${ownerId}`)

    // Atualizar o profile do owner
    await tx`
      UPDATE profiles 
      SET 
        full_name = 'João Silva',
        phone = '+5511999887766',
        system_role = 'admin',
        updated_at = now()
      WHERE id = ${ownerId}
    `

    // ============================================================================
    // 1. PERFIS (Profissionais e Clientes)
    // ============================================================================
    console.log('👥 Criando perfis de profissionais e clientes...')

    const pro1Id = randomUUID()
    const pro2Id = randomUUID()
    const pro3Id = randomUUID()
    const pro4Id = randomUUID()

    // Clientes (20 clientes)
    const clientIds = Array.from({ length: 20 }, () => randomUUID())

    // Profissionais
    await tx`
      INSERT INTO profiles (id, email, system_role, full_name, phone)
      VALUES 
        (${pro1Id}, 'carlos.barber@salonpremium.com.br', 'user', 'Carlos Mendes', '+5511998776655'),
        (${pro2Id}, 'rafael.barber@salonpremium.com.br', 'user', 'Rafael Costa', '+5511997665544'),
        (${pro3Id}, 'thiago.barber@salonpremium.com.br', 'user', 'Thiago Oliveira', '+5511996554433'),
        (${pro4Id}, 'lucas.barber@salonpremium.com.br', 'user', 'Lucas Ferreira', '+5511995443322')
    `

    // Clientes
    const clientNames = [
      'Ricardo Almeida', 'Felipe Santos', 'André Souza', 'Bruno Rodrigues', 'Gabriel Lima',
      'Vinícius Martins', 'Guilherme Pereira', 'Eduardo Ribeiro', 'Daniel Carvalho', 'Marcos Dias',
      'Henrique Rocha', 'Fernando Silva', 'Roberto Costa', 'Paulo Mendes', 'Rodrigo Nunes',
      'Leandro Araújo', 'Fabio Torres', 'Gustavo Ramos', 'Diego Moreira', 'Igor Gomes'
    ]
    const clientPhones = [
      '+5511988776655', '+5511987665544', '+5511986554433', '+5511985443322', '+5511984332211',
      '+5511983221100', '+5511982110099', '+5511981009988', '+5511979998877', '+5511978887766',
      '+5511977776655', '+5511976665544', '+5511975554433', '+5511974443322', '+5511973332211',
      '+5511972221100', '+5511971110099', '+5511970009988', '+5511969998877', '+5511968887766'
    ]
    const clientEmails = [
      'ricardo.almeida@gmail.com', 'felipe.santos@hotmail.com', 'andre.souza@gmail.com', 'bruno.rodrigues@outlook.com', 'gabriel.lima@gmail.com',
      'vinicius.martins@hotmail.com', 'guilherme.pereira@gmail.com', 'eduardo.ribeiro@outlook.com', 'daniel.carvalho@gmail.com', 'marcos.dias@hotmail.com',
      'henrique.rocha@gmail.com', 'fernando.silva@outlook.com', 'roberto.costa@gmail.com', 'paulo.mendes@hotmail.com', 'rodrigo.nunes@gmail.com',
      'leandro.araujo@outlook.com', 'fabio.torres@gmail.com', 'gustavo.ramos@hotmail.com', 'diego.moreira@gmail.com', 'igor.gomes@outlook.com'
    ]

    for (let i = 0; i < clientIds.length; i++) {
      await tx`
        INSERT INTO profiles (id, email, system_role, full_name, phone)
        VALUES (${clientIds[i]}, ${clientEmails[i]}, 'user', ${clientNames[i]}, ${clientPhones[i]})
      `
    }

    // ============================================================================
    // 2. SALÃO
    // ============================================================================
    console.log('🏪 Criando salão...')

    const salonId = randomUUID()
    const workHours = {
      monday: { open: '09:00', close: '19:00' },
      tuesday: { open: '09:00', close: '19:00' },
      wednesday: { open: '09:00', close: '19:00' },
      thursday: { open: '09:00', close: '19:00' },
      friday: { open: '09:00', close: '20:00' },
      saturday: { open: '08:00', close: '18:00' },
      sunday: { open: null, close: null }
    }

    const settings = {
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
        ${salonId},
        ${ownerId},
        'Salão Premium',
        'salon-premium',
        '+5511999887766',
        'Av. Paulista, 1578 - Bela Vista, São Paulo - SP, 01310-200',
        '+5511999887766',
        'Salão de beleza moderno e sofisticado no coração de São Paulo. Oferecemos cortes de cabelo, barba, tratamentos capilares, coloração e muito mais. Ambiente climatizado, estacionamento próprio e atendimento de excelência.',
        ${JSON.stringify(settings)}::jsonb,
        ${JSON.stringify(workHours)}::jsonb,
        'ACTIVE'
      )
    `

    // Atualizar o profile com o salon_id
    await tx`
      UPDATE profiles SET salon_id = ${salonId} WHERE id = ${ownerId}
    `

    // ============================================================================
    // 3. SERVIÇOS
    // ============================================================================
    console.log('✂️ Criando serviços...')

    const services = [
      { name: 'Corte Masculino', description: 'Corte moderno e estiloso com técnicas profissionais', duration: 30, price: 45.00 },
      { name: 'Corte Feminino', description: 'Corte e modelagem para mulheres', duration: 45, price: 60.00 },
      { name: 'Corte + Barba', description: 'Corte de cabelo completo + design e acabamento de barba', duration: 50, price: 70.00 },
      { name: 'Barba Completa', description: 'Design, corte e acabamento completo da barba', duration: 25, price: 35.00 },
      { name: 'Sobrancelha', description: 'Design e modelagem de sobrancelhas', duration: 15, price: 20.00 },
      { name: 'Corte + Barba + Sobrancelha', description: 'Pacote completo: corte, barba e sobrancelha', duration: 60, price: 85.00 },
      { name: 'Corte Infantil', description: 'Corte especializado para crianças', duration: 25, price: 30.00 },
      { name: 'Coloração Capilar', description: 'Coloração completa com técnicas profissionais', duration: 120, price: 180.00 },
      { name: 'Mechas', description: 'Aplicação de mechas com técnicas modernas', duration: 150, price: 220.00 },
      { name: 'Relaxamento Capilar', description: 'Tratamento para alisar e relaxar os fios', duration: 90, price: 150.00 },
      { name: 'Hidratação Capilar', description: 'Tratamento hidratante profundo para os cabelos', duration: 40, price: 60.00 },
      { name: 'Pigmentação de Barba', description: 'Técnica para dar mais volume e definição à barba', duration: 45, price: 80.00 },
      { name: 'Massagem Capilar', description: 'Massagem relaxante no couro cabeludo', duration: 20, price: 25.00 },
      { name: 'Escova Progressiva', description: 'Alisamento com escova progressiva', duration: 180, price: 280.00 },
      { name: 'Pacote Noivo', description: 'Pacote completo para noivos: corte, barba, sobrancelha e hidratação', duration: 90, price: 150.00 }
    ]

    const serviceIds = []
    for (const service of services) {
      const [{ id }] = await tx`
        INSERT INTO services (salon_id, name, description, duration, price, is_active)
        VALUES (${salonId}, ${service.name}, ${service.description}, ${service.duration}, ${service.price}, true)
        RETURNING id
      `
      serviceIds.push({ id, name: service.name, duration: service.duration, price: service.price })
    }

    // ============================================================================
    // 4. PROFISSIONAIS
    // ============================================================================
    console.log('👨‍💼 Criando profissionais...')

    const professionals = [
      { profileId: pro1Id, name: 'Carlos Mendes', email: 'carlos.barber@salonpremium.com.br', phone: '+5511998776655' },
      { profileId: pro2Id, name: 'Rafael Costa', email: 'rafael.barber@salonpremium.com.br', phone: '+5511997665544' },
      { profileId: pro3Id, name: 'Thiago Oliveira', email: 'thiago.barber@salonpremium.com.br', phone: '+5511996554433' },
      { profileId: pro4Id, name: 'Lucas Ferreira', email: 'lucas.barber@salonpremium.com.br', phone: '+5511995443322' }
    ]

    const professionalIds = []
    for (const pro of professionals) {
      const [{ id }] = await tx`
        INSERT INTO professionals (salon_id, user_id, name, email, phone, is_active)
        VALUES (${salonId}, ${pro.profileId}, ${pro.name}, ${pro.email}, ${pro.phone}, true)
        RETURNING id
      `
      professionalIds.push({ id, name: pro.name })
    }

    // Associa serviços aos profissionais (não todos fazem todos os serviços)
    const proServices = [
      [0, 1, 2, 3, 4, 5, 6, 12, 14], // Carlos: cortes, barba, pacotes
      [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 13], // Rafael: tudo
      [0, 2, 3, 4, 5, 11, 12], // Thiago: cortes masculinos, barba, pigmentação
      [1, 7, 8, 9, 10, 13] // Lucas: feminino, coloração, tratamentos
    ]

    for (let i = 0; i < professionalIds.length; i++) {
      for (const serviceIndex of proServices[i]) {
        await tx`
          INSERT INTO professional_services (professional_id, service_id)
          VALUES (${professionalIds[i].id}, ${serviceIds[serviceIndex].id})
          ON CONFLICT DO NOTHING
        `
      }
    }

    // ============================================================================
    // 5. DISPONIBILIDADE DOS PROFISSIONAIS
    // ============================================================================
    console.log('📅 Criando disponibilidade...')

    // Carlos - Segunda a Sexta 9h-18h, Sábado 8h-17h
    for (let day = 1; day <= 5; day++) {
      await tx`
        INSERT INTO availability (professional_id, day_of_week, start_time, end_time, is_break)
        VALUES (${professionalIds[0].id}, ${day}, '09:00', '18:00', false)
      `
      await tx`
        INSERT INTO availability (professional_id, day_of_week, start_time, end_time, is_break)
        VALUES (${professionalIds[0].id}, ${day}, '12:00', '13:00', true)
      `
    }
    await tx`
      INSERT INTO availability (professional_id, day_of_week, start_time, end_time, is_break)
      VALUES (${professionalIds[0].id}, 6, '08:00', '17:00', false), (${professionalIds[0].id}, 6, '12:00', '13:00', true)
    `

    // Rafael - Terça a Sábado 10h-19h
    for (let day = 2; day <= 6; day++) {
      await tx`
        INSERT INTO availability (professional_id, day_of_week, start_time, end_time, is_break)
        VALUES (${professionalIds[1].id}, ${day}, '10:00', '19:00', false)
      `
      await tx`
        INSERT INTO availability (professional_id, day_of_week, start_time, end_time, is_break)
        VALUES (${professionalIds[1].id}, ${day}, '13:00', '14:00', true)
      `
    }

    // Thiago - Segunda, Quarta, Sexta 9h-18h, Sábado 8h-16h
    await tx`
      INSERT INTO availability (professional_id, day_of_week, start_time, end_time, is_break)
      VALUES 
        (${professionalIds[2].id}, 1, '09:00', '18:00', false),
        (${professionalIds[2].id}, 1, '12:30', '13:30', true),
        (${professionalIds[2].id}, 3, '09:00', '18:00', false),
        (${professionalIds[2].id}, 3, '12:30', '13:30', true),
        (${professionalIds[2].id}, 5, '09:00', '18:00', false),
        (${professionalIds[2].id}, 5, '12:30', '13:30', true),
        (${professionalIds[2].id}, 6, '08:00', '16:00', false),
        (${professionalIds[2].id}, 6, '12:00', '13:00', true)
    `

    // Lucas - Segunda a Sexta 10h-18h
    for (let day = 1; day <= 5; day++) {
      await tx`
        INSERT INTO availability (professional_id, day_of_week, start_time, end_time, is_break)
        VALUES (${professionalIds[3].id}, ${day}, '10:00', '18:00', false)
      `
      await tx`
        INSERT INTO availability (professional_id, day_of_week, start_time, end_time, is_break)
        VALUES (${professionalIds[3].id}, ${day}, '13:00', '14:00', true)
      `
    }

    // ============================================================================
    // 6. CLIENTES
    // ============================================================================
    console.log('👤 Criando clientes...')

    const customerIds = []
    for (let i = 0; i < clientIds.length; i++) {
      const [{ id }] = await tx`
        INSERT INTO customers (salon_id, name, phone, email)
        VALUES (${salonId}, ${clientNames[i]}, ${clientPhones[i]}, ${clientEmails[i]})
        ON CONFLICT (salon_id, phone) DO UPDATE SET name = excluded.name, email = excluded.email
        RETURNING id
      `
      customerIds.push({ id, profileId: clientIds[i], name: clientNames[i], phone: clientPhones[i] })
    }

    // ============================================================================
    // 7. AGENDAMENTOS (passados e futuros)
    // ============================================================================
    console.log('📅 Criando agendamentos...')

    const now = new Date()
    const appointments = []

    // Agendamentos passados (últimos 60 dias) - 40 agendamentos
    for (let i = 1; i <= 40; i++) {
      const daysAgo = Math.floor(Math.random() * 60) + 1
      const date = new Date(now)
      date.setDate(date.getDate() - daysAgo)
      const hour = 9 + Math.floor(Math.random() * 9) // 9-17
      const minute = [0, 15, 30, 45][Math.floor(Math.random() * 4)]
      date.setHours(hour, minute, 0, 0)

      const proIndex = Math.floor(Math.random() * professionalIds.length)
      let serviceIndex = Math.floor(Math.random() * serviceIds.length)
      // Garantir que o profissional oferece o serviço
      if (!proServices[proIndex].includes(serviceIndex)) {
        serviceIndex = proServices[proIndex][Math.floor(Math.random() * proServices[proIndex].length)]
      }
      const clientIndex = Math.floor(Math.random() * customerIds.length)

      const service = serviceIds[serviceIndex]
      const endTime = new Date(date.getTime() + service.duration * 60 * 1000)

      const statuses = ['completed', 'completed', 'completed', 'completed', 'cancelled']
      const status = statuses[Math.floor(Math.random() * statuses.length)]

      appointments.push({
        date,
        endTime,
        professionalId: professionalIds[proIndex].id,
        serviceId: service.id,
        clientId: customerIds[clientIndex].profileId,
        status,
        notes: status === 'cancelled' ? 'Cancelado pelo cliente' : null
      })
    }

    // Agendamentos futuros (próximos 60 dias) - 30 agendamentos
    for (let i = 1; i <= 30; i++) {
      const daysAhead = Math.floor(Math.random() * 60) + 1
      const date = new Date(now)
      date.setDate(date.getDate() + daysAhead)
      const hour = 9 + Math.floor(Math.random() * 9) // 9-17
      const minute = [0, 15, 30, 45][Math.floor(Math.random() * 4)]
      date.setHours(hour, minute, 0, 0)

      const proIndex = Math.floor(Math.random() * professionalIds.length)
      let serviceIndex = Math.floor(Math.random() * serviceIds.length)
      if (!proServices[proIndex].includes(serviceIndex)) {
        serviceIndex = proServices[proIndex][Math.floor(Math.random() * proServices[proIndex].length)]
      }
      const clientIndex = Math.floor(Math.random() * customerIds.length)

      const service = serviceIds[serviceIndex]
      const endTime = new Date(date.getTime() + service.duration * 60 * 1000)

      const statuses = ['confirmed', 'confirmed', 'confirmed', 'pending']
      const status = statuses[Math.floor(Math.random() * statuses.length)]

      appointments.push({
        date,
        endTime,
        professionalId: professionalIds[proIndex].id,
        serviceId: service.id,
        clientId: customerIds[clientIndex].profileId,
        status,
        notes: null
      })
    }

    for (const apt of appointments) {
      if (isNaN(apt.date.getTime()) || isNaN(apt.endTime.getTime())) {
        continue
      }

      await tx`
        INSERT INTO appointments (salon_id, professional_id, client_id, service_id, date, end_time, status, notes)
        VALUES (
          ${salonId},
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
    // 8. SCHEDULE OVERRIDES (exceções de horário)
    // ============================================================================
    console.log('⏰ Criando exceções de horário...')

    const overrideReasons = ['Férias', 'Consulta médica', 'Treinamento', 'Evento pessoal', 'Folga']
    for (let i = 0; i < 8; i++) {
      const daysAhead = Math.floor(Math.random() * 30) + 1
      const date = new Date(now)
      date.setDate(date.getDate() + daysAhead)
      date.setHours(9, 0, 0, 0)

      const endDate = new Date(date)
      endDate.setHours(18, 0, 0, 0)

      const proIndex = Math.floor(Math.random() * professionalIds.length)
      const reason = overrideReasons[Math.floor(Math.random() * overrideReasons.length)]

      await tx`
        INSERT INTO schedule_overrides (salon_id, professional_id, start_time, end_time, reason)
        VALUES (${salonId}, ${professionalIds[proIndex].id}, ${date.toISOString()}, ${endDate.toISOString()}, ${reason})
      `
    }

    // ============================================================================
    // 9. CHATS E MENSAGENS
    // ============================================================================
    console.log('💬 Criando chats e mensagens...')

    const chatClients = customerIds.slice(0, 12)

    for (const customer of chatClients) {
      const [{ id: chatId }] = await tx`
        INSERT INTO chats (salon_id, client_phone, status)
        VALUES (${salonId}, ${customer.phone}, 'active')
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
        INSERT INTO chat_messages (salon_id, client_id, role, content)
        VALUES 
          (${salonId}, ${customer.profileId}, 'user', 'Olá, gostaria de agendar um corte para esta semana.'),
          (${salonId}, ${customer.profileId}, 'assistant', 'Olá! Claro, tenho disponibilidade. Que dia e horário você prefere?'),
          (${salonId}, ${customer.profileId}, 'user', 'Prefiro quinta-feira à tarde, por volta das 15h.'),
          (${salonId}, ${customer.profileId}, 'assistant', 'Perfeito! Tenho horário disponível na quinta-feira às 15h. Qual serviço você deseja?')
      `
    }

    // ============================================================================
    // 10. LEADS
    // ============================================================================
    console.log('🎯 Criando leads...')

    const leadsData = [
      { phone: '+5511967776655', name: 'Roberto Santos', email: 'roberto.santos@gmail.com', source: 'instagram', status: 'new', notes: 'Interessado em corte + barba' },
      { phone: '+5511966665544', name: 'Daniel Alves', email: 'daniel.alves@hotmail.com', source: 'facebook', status: 'new', notes: 'Primeira vez no salão' },
      { phone: '+5511965554433', name: 'Eduardo Lima', email: 'eduardo.lima@gmail.com', source: 'google', status: 'recently_scheduled', notes: 'Agendou para próxima semana' },
      { phone: '+5511964443322', name: 'Fernando Rocha', email: 'fernando.rocha@outlook.com', source: 'indicacao', status: 'new', notes: 'Indicado por cliente existente' },
      { phone: '+5511963332211', name: 'Henrique Dias', email: 'henrique.dias@gmail.com', source: 'whatsapp', status: 'cold', notes: 'Não respondeu há mais de 30 dias' },
      { phone: '+5511962221100', name: 'Marcelo Pereira', email: 'marcelo.pereira@hotmail.com', source: 'instagram', status: 'new', notes: 'Interessado em coloração' },
      { phone: '+5511961110099', name: 'Sérgio Ramos', email: 'sergio.ramos@gmail.com', source: 'google', status: 'recently_scheduled', notes: 'Agendamento confirmado' },
      { phone: '+5511960009988', name: 'Antonio Moreira', email: 'antonio.moreira@outlook.com', source: 'whatsapp', status: 'new', notes: 'Solicitou orçamento' },
      { phone: '+5511959998877', name: 'Julio Gomes', email: 'julio.gomes@gmail.com', source: 'facebook', status: 'cold', notes: 'Sem contato há 45 dias' },
      { phone: '+5511958887766', name: 'Adriano Nunes', email: 'adriano.nunes@hotmail.com', source: 'instagram', status: 'new', notes: 'Cliente potencial' }
    ]

    for (const lead of leadsData) {
      await tx`
        INSERT INTO leads (salon_id, phone_number, name, email, source, status, notes, last_contact_at)
        VALUES (
          ${salonId},
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
    // 11. CAMPANHAS
    // ============================================================================
    console.log('📢 Criando campanhas...')

    const campaign1Start = new Date(now)
    campaign1Start.setDate(campaign1Start.getDate() - 7)
    const campaign1End = new Date(now)
    campaign1End.setDate(campaign1End.getDate() + 21)

    const [{ id: campaign1Id }] = await tx`
      INSERT INTO campaigns (salon_id, name, description, status, starts_at, ends_at)
      VALUES (
        ${salonId},
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
        ${salonId},
        'Campanha de Boas Vindas',
        'Mensagem de boas vindas para novos clientes',
        'completed',
        ${campaign2Start.toISOString()},
        ${campaign2End.toISOString()}
      )
      RETURNING id
    `

    const campaign3Start = new Date(now)
    campaign3Start.setDate(campaign3Start.getDate() + 14)
    const campaign3End = new Date(now)
    campaign3End.setDate(campaign3End.getDate() + 45)

    const [{ id: campaign3Id }] = await tx`
      INSERT INTO campaigns (salon_id, name, description, status, starts_at, ends_at)
      VALUES (
        ${salonId},
        'Promoção Dia dos Namorados',
        'Pacote especial para casais com desconto',
        'active',
        ${campaign3Start.toISOString()},
        ${campaign3End.toISOString()}
      )
      RETURNING id
    `

    // Adicionar destinatários às campanhas
    const customerIdsForCampaigns = await tx`
      SELECT id FROM customers WHERE salon_id = ${salonId} LIMIT 8
    `

    for (const customer of customerIdsForCampaigns) {
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

    // ============================================================================
    // 12. INTEGRAÇÕES
    // ============================================================================
    console.log('🔗 Criando integrações...')

    await tx`
      INSERT INTO salon_integrations (salon_id, provider, refresh_token, access_token, expires_at, email)
      VALUES (
        ${salonId},
        'google',
        'refresh_token_demo',
        'access_token_demo',
        ${Math.floor(Date.now() / 1000) + 3600},
        'salonpremium@gmail.com'
      )
      ON CONFLICT (salon_id) DO UPDATE SET
        refresh_token = excluded.refresh_token,
        access_token = excluded.access_token
    `

    // Integrações por profissional
    for (const pro of professionalIds) {
      await tx`
        INSERT INTO integrations (provider, salon_id, professional_id, access_token, refresh_token, token_type, scope, expires_at)
        VALUES (
          'google',
          ${salonId},
          ${pro.id},
          'access_token_demo',
          'refresh_token_demo',
          'Bearer',
          'https://www.googleapis.com/auth/calendar',
          ${new Date(Date.now() + 3600000).toISOString()}
        )
      `
    }

    // ============================================================================
    // 13. ESTATÍSTICAS DE IA
    // ============================================================================
    console.log('📊 Criando estatísticas de IA...')

    const models = ['gpt-5-mini', 'gpt-4o', 'gpt-4.1']

    // Estatísticas dos últimos 30 dias
    for (let i = 0; i < 30; i++) {
      const date = new Date(now)
      date.setDate(date.getDate() - i)

      for (const model of models) {
        const credits = Math.floor(Math.random() * 150) + 20
        await tx`
          INSERT INTO ai_usage_stats (salon_id, date, model, credits)
          VALUES (${salonId}, ${date.toISOString().split('T')[0]}::date, ${model}, ${credits})
          ON CONFLICT (salon_id, date, model) DO UPDATE SET credits = excluded.credits
        `
      }
    }

    // Estatísticas por agente
    const agents = ['scheduling_agent', 'customer_service_agent', 'marketing_agent']
    for (const agent of agents) {
      const totalCredits = Math.floor(Math.random() * 8000) + 2000
      await tx`
        INSERT INTO agent_stats (salon_id, agent_name, total_credits)
        VALUES (${salonId}, ${agent}, ${totalCredits})
        ON CONFLICT (salon_id, agent_name) DO UPDATE SET total_credits = excluded.total_credits
      `
    }

    console.log('')
    console.log('✅ Seed completo finalizado com sucesso!')
    console.log('📋 Resumo:')
    console.log(`   - Salão: ${salonId}`)
    console.log(`   - Profissionais: ${professionalIds.length}`)
    console.log(`   - Serviços: ${serviceIds.length}`)
    console.log(`   - Clientes: ${customerIds.length}`)
    console.log(`   - Agendamentos: ${appointments.length}`)
    console.log(`   - Chats: ${chatClients.length}`)
    console.log(`   - Leads: ${leadsData.length}`)
    console.log(`   - Campanhas: 3`)
  })

  await sql.end({ timeout: 0 })
}

main().catch((err) => {
  console.error('❌ Erro no seed:', err)
  process.exit(1)
})

