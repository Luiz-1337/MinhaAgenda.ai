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

// ID fixo do salão
const SALON_ID = 'dcf42567-9d88-4b39-ac02-41a3da762691'

async function main() {
  console.log('🌱 Iniciando seed completo para o salão:', SALON_ID)
  console.log('📊 Conectando ao banco:', url.replace(/:[^@]*@/, ':****@'))

  await sql.begin(async (tx) => {
    // ============================================================================
    // 1. PERFIS (Owner, Profissionais, Clientes)
    // ============================================================================
    console.log('👥 Criando perfis...')

    const ownerId = randomUUID()
    const pro1Id = randomUUID()
    const pro2Id = randomUUID()
    const pro3Id = randomUUID()
    const client1Id = randomUUID()
    const client2Id = randomUUID()
    const client3Id = randomUUID()
    const client4Id = randomUUID()
    const client5Id = randomUUID()
    const client6Id = randomUUID()
    const client7Id = randomUUID()
    const client8Id = randomUUID()
    const client9Id = randomUUID()
    const client10Id = randomUUID()

    // Owner do salão
    await tx`
      insert into profiles (id, email, system_role, user_tier, full_name, phone)
      values (${ownerId}, 'carlos.santos@barbeariapremium.com.br', 'admin', 'professional', 'Carlos Santos', '+5511999887766')
    `

    // Profissionais
    await tx`
      insert into profiles (id, email, system_role, user_tier, full_name, phone)
      values 
        (${pro1Id}, 'joao.silva@barbeariapremium.com.br', 'user', 'professional', 'João Silva', '+5511998776655'),
        (${pro2Id}, 'pedro.oliveira@barbeariapremium.com.br', 'user', 'professional', 'Pedro Oliveira', '+5511997665544'),
        (${pro3Id}, 'marcos.ferreira@barbeariapremium.com.br', 'user', 'professional', 'Marcos Ferreira', '+5511996554433')
    `

    // Clientes
    await tx`
      insert into profiles (id, email, system_role, user_tier, full_name, phone)
      values 
        (${client1Id}, 'ricardo.mendes@gmail.com', 'user', 'standard', 'Ricardo Mendes', '+5511988776655'),
        (${client2Id}, 'felipe.costa@hotmail.com', 'user', 'standard', 'Felipe Costa', '+5511987665544'),
        (${client3Id}, 'andre.souza@gmail.com', 'user', 'standard', 'André Souza', '+5511986554433'),
        (${client4Id}, 'lucas.rodrigues@outlook.com', 'user', 'standard', 'Lucas Rodrigues', '+5511985443322'),
        (${client5Id}, 'gabriel.almeida@gmail.com', 'user', 'standard', 'Gabriel Almeida', '+5511984332211'),
        (${client6Id}, 'rafael.lima@hotmail.com', 'user', 'standard', 'Rafael Lima', '+5511983221100'),
        (${client7Id}, 'bruno.martins@gmail.com', 'user', 'standard', 'Bruno Martins', '+5511982110099'),
        (${client8Id}, 'thiago.pereira@outlook.com', 'user', 'standard', 'Thiago Pereira', '+5511981009988'),
        (${client9Id}, 'vinicius.ribeiro@gmail.com', 'user', 'standard', 'Vinícius Ribeiro', '+5511979998877'),
        (${client10Id}, 'guilherme.carvalho@hotmail.com', 'user', 'standard', 'Guilherme Carvalho', '+5511978887766')
    `

    // ============================================================================
    // 2. SALÃO
    // ============================================================================
    console.log('🏪 Criando salão...')

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
      insert into salons (id, owner_id, name, slug, whatsapp, address, phone, description, settings, work_hours)
      values (
        ${SALON_ID},
        ${ownerId},
        'Barbearia Premium',
        'barbearia-premium',
        '+5511999887766',
        'Av. Paulista, 1578 - Bela Vista, São Paulo - SP, 01310-200',
        '+5511999887766',
        'Barbearia moderna e sofisticada no coração de São Paulo. Oferecemos cortes de cabelo, barba, tratamentos capilares e muito mais. Ambiente climatizado, estacionamento próprio e atendimento de excelência.',
        ${JSON.stringify(settings)}::jsonb,
        ${JSON.stringify(workHours)}::jsonb
      )
      on conflict (id) do update set
        name = excluded.name,
        description = excluded.description,
        settings = excluded.settings,
        work_hours = excluded.work_hours
    `

    // ============================================================================
    // 3. SERVIÇOS
    // ============================================================================
    console.log('✂️ Criando serviços...')

    const services = [
      { name: 'Corte Masculino', description: 'Corte moderno e estiloso com técnicas profissionais', duration: 30, price: 45.00 },
      { name: 'Corte + Barba', description: 'Corte de cabelo completo + design e acabamento de barba', duration: 50, price: 70.00 },
      { name: 'Barba Completa', description: 'Design, corte e acabamento completo da barba', duration: 25, price: 35.00 },
      { name: 'Sobrancelha', description: 'Design e modelagem de sobrancelhas', duration: 15, price: 20.00 },
      { name: 'Corte + Barba + Sobrancelha', description: 'Pacote completo: corte, barba e sobrancelha', duration: 60, price: 85.00 },
      { name: 'Corte Infantil', description: 'Corte especializado para crianças', duration: 25, price: 30.00 },
      { name: 'Relaxamento Capilar', description: 'Tratamento para alisar e relaxar os fios', duration: 90, price: 150.00 },
      { name: 'Hidratação Capilar', description: 'Tratamento hidratante profundo para os cabelos', duration: 40, price: 60.00 },
      { name: 'Pigmentação de Barba', description: 'Técnica para dar mais volume e definição à barba', duration: 45, price: 80.00 },
      { name: 'Massagem Capilar', description: 'Massagem relaxante no couro cabeludo', duration: 20, price: 25.00 }
    ]

    const serviceIds = []
    for (const service of services) {
      const [{ id }] = await tx`
        insert into services (salon_id, name, description, duration, price, is_active)
        values (${SALON_ID}, ${service.name}, ${service.description}, ${service.duration}, ${service.price}, true)
        returning id
      `
      serviceIds.push({ id, name: service.name, duration: service.duration })
    }

    // ============================================================================
    // 4. PROFISSIONAIS
    // ============================================================================
    console.log('👨‍💼 Criando profissionais...')

    const professionals = [
      { profileId: pro1Id, name: 'João Silva', email: 'joao.silva@barbeariapremium.com.br', phone: '+5511998776655' },
      { profileId: pro2Id, name: 'Pedro Oliveira', email: 'pedro.oliveira@barbeariapremium.com.br', phone: '+5511997665544' },
      { profileId: pro3Id, name: 'Marcos Ferreira', email: 'marcos.ferreira@barbeariapremium.com.br', phone: '+5511996554433' }
    ]

    const professionalIds = []
    for (const pro of professionals) {
      const [{ id }] = await tx`
        insert into professionals (salon_id, user_id, name, email, phone, is_active)
        values (${SALON_ID}, ${pro.profileId}, ${pro.name}, ${pro.email}, ${pro.phone}, true)
        returning id
      `
      professionalIds.push({ id, name: pro.name })
    }

    // Associa todos os serviços a todos os profissionais
    for (const pro of professionalIds) {
      for (const service of serviceIds) {
        await tx`
          insert into professional_services (professional_id, service_id)
          values (${pro.id}, ${service.id})
          on conflict do nothing
        `
      }
    }

    // ============================================================================
    // 5. DISPONIBILIDADE DOS PROFISSIONAIS
    // ============================================================================
    console.log('📅 Criando disponibilidade...')

    // João Silva - Segunda a Sexta 9h-18h, Sábado 8h-17h
    for (let day = 1; day <= 5; day++) {
      await tx`
        insert into availability (professional_id, day_of_week, start_time, end_time, is_break)
        values (${professionalIds[0].id}, ${day}, '09:00', '18:00', false)
      `
    }
    await tx`
      insert into availability (professional_id, day_of_week, start_time, end_time, is_break)
      values (${professionalIds[0].id}, 6, '08:00', '17:00', false)
    `
    // Almoço de João (Segunda a Sexta 12h-13h)
    for (let day = 1; day <= 5; day++) {
      await tx`
        insert into availability (professional_id, day_of_week, start_time, end_time, is_break)
        values (${professionalIds[0].id}, ${day}, '12:00', '13:00', true)
      `
    }

    // Pedro Oliveira - Terça a Sábado 10h-19h
    for (let day = 2; day <= 6; day++) {
      await tx`
        insert into availability (professional_id, day_of_week, start_time, end_time, is_break)
        values (${professionalIds[1].id}, ${day}, '10:00', '19:00', false)
      `
    }
    // Almoço de Pedro (Terça a Sábado 13h-14h)
    for (let day = 2; day <= 6; day++) {
      await tx`
        insert into availability (professional_id, day_of_week, start_time, end_time, is_break)
        values (${professionalIds[1].id}, ${day}, '13:00', '14:00', true)
      `
    }

    // Marcos Ferreira - Segunda, Quarta, Sexta 9h-18h, Sábado 8h-16h
    await tx`
      insert into availability (professional_id, day_of_week, start_time, end_time, is_break)
      values 
        (${professionalIds[2].id}, 1, '09:00', '18:00', false),
        (${professionalIds[2].id}, 3, '09:00', '18:00', false),
        (${professionalIds[2].id}, 5, '09:00', '18:00', false),
        (${professionalIds[2].id}, 6, '08:00', '16:00', false)
    `
    // Almoço de Marcos
    await tx`
      insert into availability (professional_id, day_of_week, start_time, end_time, is_break)
      values 
        (${professionalIds[2].id}, 1, '12:30', '13:30', true),
        (${professionalIds[2].id}, 3, '12:30', '13:30', true),
        (${professionalIds[2].id}, 5, '12:30', '13:30', true),
        (${professionalIds[2].id}, 6, '12:00', '13:00', true)
    `

    // ============================================================================
    // 6. CLIENTES
    // ============================================================================
    console.log('👤 Criando clientes...')

    const customers = [
      { profileId: client1Id, name: 'Ricardo Mendes', phone: '+5511988776655' },
      { profileId: client2Id, name: 'Felipe Costa', phone: '+5511987665544' },
      { profileId: client3Id, name: 'André Souza', phone: '+5511986554433' },
      { profileId: client4Id, name: 'Lucas Rodrigues', phone: '+5511985443322' },
      { profileId: client5Id, name: 'Gabriel Almeida', phone: '+5511984332211' },
      { profileId: client6Id, name: 'Rafael Lima', phone: '+5511983221100' },
      { profileId: client7Id, name: 'Bruno Martins', phone: '+5511982110099' },
      { profileId: client8Id, name: 'Thiago Pereira', phone: '+5511981009988' },
      { profileId: client9Id, name: 'Vinícius Ribeiro', phone: '+5511979998877' },
      { profileId: client10Id, name: 'Guilherme Carvalho', phone: '+5511978887766' }
    ]

    const customerIds = []
    for (const customer of customers) {
      const [{ id }] = await tx`
        insert into customers (salon_id, name, phone)
        values (${SALON_ID}, ${customer.name}, ${customer.phone})
        on conflict (salon_id, phone) do update set name = excluded.name
        returning id
      `
      customerIds.push({ id, profileId: customer.profileId, name: customer.name, phone: customer.phone })
    }

    // ============================================================================
    // 7. SALON CUSTOMERS (com informações adicionais)
    // ============================================================================
    // Removido: criação de salon_customers (tabela removida)
    // Clientes agora são criados diretamente na tabela customers

    // ============================================================================
    // 8. AGENDAMENTOS (passados e futuros)
    // ============================================================================
    console.log('📅 Criando agendamentos...')

    const now = new Date()
    const appointments = []

    // Agendamentos passados (últimos 30 dias)
    for (let i = 1; i <= 20; i++) {
      const daysAgo = Math.floor(Math.random() * 30) + 1
      const date = new Date(now)
      date.setDate(date.getDate() - daysAgo)
      const hour = 9 + Math.floor(Math.random() * 8) // 9-16
      const minute = [0, 15, 30, 45][Math.floor(Math.random() * 4)]
      date.setHours(hour, minute, 0, 0)

      const proIndex = Math.floor(Math.random() * professionalIds.length)
      const serviceIndex = Math.floor(Math.random() * serviceIds.length)
      const clientIndex = Math.floor(Math.random() * customerIds.length)

      const service = serviceIds[serviceIndex]
      if (!service || !service.duration) {
        console.warn('⚠️ Serviço inválido, pulando agendamento')
        continue
      }
      const endTime = new Date(date.getTime() + service.duration * 60 * 1000)

      const statuses = ['completed', 'completed', 'completed', 'cancelled']
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

    // Agendamentos futuros (próximos 30 dias)
    for (let i = 1; i <= 15; i++) {
      const daysAhead = Math.floor(Math.random() * 30) + 1
      const date = new Date(now)
      date.setDate(date.getDate() + daysAhead)
      const hour = 9 + Math.floor(Math.random() * 8) // 9-16
      const minute = [0, 15, 30, 45][Math.floor(Math.random() * 4)]
      date.setHours(hour, minute, 0, 0)

      const proIndex = Math.floor(Math.random() * professionalIds.length)
      const serviceIndex = Math.floor(Math.random() * serviceIds.length)
      const clientIndex = Math.floor(Math.random() * customerIds.length)

      const service = serviceIds[serviceIndex]
      if (!service || !service.duration) {
        console.warn('⚠️ Serviço inválido, pulando agendamento')
        continue
      }
      const endTime = new Date(date.getTime() + service.duration * 60 * 1000)

      const statuses = ['confirmed', 'confirmed', 'pending']
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
      // Valida se as datas são válidas
      if (isNaN(apt.date.getTime()) || isNaN(apt.endTime.getTime())) {
        console.warn('⚠️ Agendamento com data inválida ignorado:', apt)
        continue
      }

      await tx`
        insert into appointments (salon_id, professional_id, client_id, service_id, date, end_time, status, notes)
        values (
          ${SALON_ID},
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
    // 9. SCHEDULE OVERRIDES (exceções de horário)
    // ============================================================================
    console.log('⏰ Criando exceções de horário...')

    // Alguns overrides para os próximos dias
    const overrideReasons = [
      'Férias',
      'Consulta médica',
      'Treinamento',
      'Evento pessoal',
      'Folga'
    ]

    for (let i = 0; i < 5; i++) {
      const daysAhead = Math.floor(Math.random() * 14) + 1
      const date = new Date(now)
      date.setDate(date.getDate() + daysAhead)
      date.setHours(9, 0, 0, 0)

      const endDate = new Date(date)
      endDate.setHours(18, 0, 0, 0)

      const proIndex = Math.floor(Math.random() * professionalIds.length)
      const reason = overrideReasons[Math.floor(Math.random() * overrideReasons.length)]

      await tx`
        insert into schedule_overrides (salon_id, professional_id, start_time, end_time, reason)
        values (
          ${SALON_ID},
          ${professionalIds[proIndex].id},
          ${date.toISOString()},
          ${endDate.toISOString()},
          ${reason}
        )
      `
    }

    // ============================================================================
    // 10. CHATS E MENSAGENS
    // ============================================================================
    console.log('💬 Criando chats e mensagens...')

    const chatClients = customerIds.slice(0, 7)

    for (const customer of chatClients) {
      const [{ id: chatId }] = await tx`
        insert into chats (salon_id, client_phone, status)
        values (${SALON_ID}, ${customer.phone}, 'active')
        returning id
      `

      // Mensagens na tabela messages
      const messages = [
        { role: 'user', content: 'Olá, gostaria de agendar um corte para esta semana.' },
        { role: 'assistant', content: 'Olá! Claro, tenho disponibilidade. Que dia e horário você prefere?' },
        { role: 'user', content: 'Prefiro quinta-feira à tarde, por volta das 15h.' },
        { role: 'assistant', content: 'Perfeito! Tenho horário disponível na quinta-feira às 15h. Qual serviço você deseja?' }
      ]

      for (const msg of messages) {
        await tx`
          insert into messages (chat_id, role, content)
          values (${chatId}, ${msg.role}::chat_message_role, ${msg.content})
        `
      }

      // Mensagens na tabela chat_messages
      // await tx`
      //   insert into chat_messages (salon_id, client_id, role, content)
      //   values 
      //     (${SALON_ID}, ${customer.profileId}, 'user', 'Olá, gostaria de agendar um corte para esta semana.'),
      //     (${SALON_ID}, ${customer.profileId}, 'assistant', 'Olá! Claro, tenho disponibilidade. Que dia e horário você prefere?'),
      //     (${SALON_ID}, ${customer.profileId}, 'user', 'Prefiro quinta-feira à tarde, por volta das 15h.'),
      //     (${SALON_ID}, ${customer.profileId}, 'assistant', 'Perfeito! Tenho horário disponível na quinta-feira às 15h. Qual serviço você deseja?')
      // `
    }

    // ============================================================================
    // 11. LEADS
    // ============================================================================
    console.log('🎯 Criando leads...')

    const leadsData = [
      { phone: '+5511977776655', name: 'Roberto Santos', email: 'roberto.santos@gmail.com', source: 'instagram', status: 'new', notes: 'Interessado em corte + barba' },
      { phone: '+5511976665544', name: 'Daniel Alves', email: 'daniel.alves@hotmail.com', source: 'facebook', status: 'new', notes: 'Primeira vez no salão' },
      { phone: '+5511975554433', name: 'Eduardo Lima', email: 'eduardo.lima@gmail.com', source: 'google', status: 'recently_scheduled', notes: 'Agendou para próxima semana' },
      { phone: '+5511974443322', name: 'Fernando Rocha', email: 'fernando.rocha@outlook.com', source: 'indicacao', status: 'new', notes: 'Indicado por cliente existente' },
      { phone: '+5511973332211', name: 'Henrique Dias', email: 'henrique.dias@gmail.com', source: 'whatsapp', status: 'cold', notes: 'Não respondeu há mais de 30 dias' }
    ]

    for (const lead of leadsData) {
      await tx`
        insert into leads (salon_id, phone_number, name, email, source, status, notes, last_contact_at)
        values (
          ${SALON_ID},
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
    // 12. CAMPANHAS
    // ============================================================================
    console.log('📢 Criando campanhas...')

    const campaign1Start = new Date(now)
    campaign1Start.setDate(campaign1Start.getDate() - 7)
    const campaign1End = new Date(now)
    campaign1End.setDate(campaign1End.getDate() + 7)

    const [{ id: campaign1Id }] = await tx`
      insert into campaigns (salon_id, name, description, status, starts_at, ends_at)
      values (
        ${SALON_ID},
        'Promoção de Verão',
        'Desconto de 20% em todos os serviços durante o verão',
        'active',
        ${campaign1Start.toISOString()},
        ${campaign1End.toISOString()}
      )
      returning id
    `

    const campaign2Start = new Date(now)
    campaign2Start.setDate(campaign2Start.getDate() - 30)
    const campaign2End = new Date(now)
    campaign2End.setDate(campaign2End.getDate() - 1)

    const [{ id: campaign2Id }] = await tx`
      insert into campaigns (salon_id, name, description, status, starts_at, ends_at)
      values (
        ${SALON_ID},
        'Campanha de Boas Vindas',
        'Mensagem de boas vindas para novos clientes',
        'completed',
        ${campaign2Start.toISOString()},
        ${campaign2End.toISOString()}
      )
      returning id
    `

    // Adiciona destinatários às campanhas
    const salonCustomerIds = await tx`
      select id from customers where salon_id = ${SALON_ID} limit 5
    `

    for (const sc of salonCustomerIds) {
      await tx`
        insert into campaign_recipients (campaign_id, salon_customer_id)
        values (${campaign1Id}, ${sc.id})
        on conflict do nothing
      `
    }

    // ============================================================================
    // 13. INTEGRAÇÕES
    // ============================================================================
    console.log('🔗 Criando integrações...')

    await tx`
      insert into salon_integrations (salon_id, provider, refresh_token, access_token, expires_at, email)
      values (
        ${SALON_ID},
        'google',
        'refresh_token_demo',
        'access_token_demo',
        ${Math.floor(Date.now() / 1000) + 3600},
        'barbeariapremium@gmail.com'
      )
      on conflict (salon_id) do update set
        refresh_token = excluded.refresh_token,
        access_token = excluded.access_token
    `

    // Integrações por profissional
    for (const pro of professionalIds) {
      await tx`
        insert into integrations (provider, salon_id, professional_id, access_token, refresh_token, token_type, scope, expires_at)
        values (
          'google',
          ${SALON_ID},
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
    // 14. ESTATÍSTICAS DE IA
    // ============================================================================
    console.log('📊 Criando estatísticas de IA...')

    const models = ['gpt-5-mini', 'gpt-4o', 'gpt-4.1']

    // Estatísticas dos últimos 30 dias
    for (let i = 0; i < 30; i++) {
      const date = new Date(now)
      date.setDate(date.getDate() - i)

      for (const model of models) {
        const credits = Math.floor(Math.random() * 100) + 10
        await tx`
          insert into ai_usage_stats (salon_id, date, model, credits)
          values (${SALON_ID}, ${date.toISOString().split('T')[0]}::date, ${model}, ${credits})
          on conflict (salon_id, date, model) do update set credits = excluded.credits
        `
      }
    }

    // Estatísticas por agente
    const agents = ['scheduling_agent', 'customer_service_agent', 'marketing_agent']
    for (const agent of agents) {
      const totalCredits = Math.floor(Math.random() * 5000) + 1000
      await tx`
        insert into agent_stats (salon_id, agent_name, total_credits)
        values (${SALON_ID}, ${agent}, ${totalCredits})
        on conflict (salon_id, agent_name) do update set total_credits = excluded.total_credits
      `
    }

    console.log('✅ Seed completo finalizado com sucesso!')
    console.log('📋 Resumo:')
    console.log(`   - Salão: ${SALON_ID}`)
    console.log(`   - Profissionais: ${professionalIds.length}`)
    console.log(`   - Serviços: ${serviceIds.length}`)
    console.log(`   - Clientes: ${customerIds.length}`)
    console.log(`   - Agendamentos: ${appointments.length}`)
    console.log(`   - Chats: ${chatClients.length}`)
    console.log(`   - Leads: ${leadsData.length}`)
    console.log(`   - Campanhas: 2`)
  })

  await sql.end({ timeout: 0 })
}

main().catch((err) => {
  console.error('❌ Erro no seed:', err)
  process.exit(1)
})

