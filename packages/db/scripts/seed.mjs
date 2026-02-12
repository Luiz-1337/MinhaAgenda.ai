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

async function main() {
  console.log('seeding to', url.replace(/:[^@]*@/, ':****@'))

  await sql.begin(async (tx) => {
    const ownerId = randomUUID()
    const proUserId = randomUUID()
    const clientId = randomUUID()

    await tx`
      insert into profiles (id, email, system_role, user_tier, full_name, phone)
      values (${ownerId}, 'owner@demo.com', 'admin', null, 'Owner Demo', '+5511999990000')
    `

    await tx`
      insert into profiles (id, email, system_role, user_tier, full_name, phone)
      values (${proUserId}, 'pro@demo.com', 'user', 'professional', 'Pro Demo', '+5511988880000')
    `

    await tx`
      insert into profiles (id, email, system_role, user_tier, full_name, phone)
      values (${clientId}, 'client@demo.com', 'user', 'standard', 'Client Demo', '+5511977770000')
    `

    const [salonRow] = await tx`
      insert into salons (owner_id, name, slug, address, phone, description, settings)
      values (${ownerId}, 'Demo Salon', 'demo-salon', 'Av. Paulista, 1000', '+551130000000', 'Salon seed', '{"accepts_card":true,"parking":false,"late_tolerance_minutes":10}'::jsonb)
      on conflict (slug) do update set name = excluded.name
      returning id
    `
    const salonId = salonRow.id

    const [{ id: serviceCorteId }] = await tx`
      insert into services (salon_id, name, description, duration, price, is_active)
      values (${salonId}, 'Corte Masculino', 'Corte padrão', 30, 50.00, true)
      returning id
    `
    const [{ id: serviceBarbaId }] = await tx`
      insert into services (salon_id, name, description, duration, price, is_active)
      values (${salonId}, 'Barba', 'Design de barba', 20, 35.00, true)
      returning id
    `

    const [{ id: professionalId }] = await tx`
      insert into professionals (salon_id, user_id, name, email, is_active)
      values (${salonId}, ${proUserId}, 'Pro Demo', 'pro@demo.com', true)
      returning id
    `


    await tx`
      insert into availability (professional_id, day_of_week, start_time, end_time, is_break)
      values (${professionalId}, 1, '09:00', '17:00', false),
             (${professionalId}, 3, '09:00', '17:00', false)
    `

    const now = new Date()
    const start = new Date(now.getTime() + 24 * 60 * 60 * 1000)
    const end = new Date(start.getTime() + 30 * 60 * 1000)

    const [{ id: appointmentId }] = await tx`
      insert into appointments (salon_id, professional_id, client_id, service_id, date, end_time, status, notes)
      values (${salonId}, ${professionalId}, ${clientId}, ${serviceCorteId}, ${start.toISOString()}, ${end.toISOString()}, 'confirmed', 'via seed')
      returning id
    `

    await tx`
      insert into professional_services (professional_id, service_id)
      values (${professionalId}, ${serviceCorteId}), (${professionalId}, ${serviceBarbaId})
    `

    const overrideStart = new Date(start.getTime())
    overrideStart.setHours(13, 0, 0, 0)
    const overrideEnd = new Date(start.getTime())
    overrideEnd.setHours(16, 0, 0, 0)
    await tx`
      insert into schedule_overrides (salon_id, professional_id, start_time, end_time, reason)
      values (${salonId}, ${professionalId}, ${overrideStart.toISOString()}, ${overrideEnd.toISOString()}, 'consulta médica')
    `

    // integrations removed
    // await tx`
    //   insert into integrations (provider, salon_id, professional_id, access_token, token_type, scope)
    //   values ('google', ${salonId}, ${professionalId}, 'seed-access-token', 'Bearer', 'calendar.readonly')
    // `

    // Cria chat usando a tabela chats atual
    const [{ id: chatId }] = await tx`
      insert into chats (salon_id, client_phone, status)
      values (${salonId}, '+5511977770000', 'active')
      returning id
    `

    // Cria mensagens usando chatMessages (tabela atual para mensagens do salão)
    // await tx`
    //   insert into chat_messages (salon_id, client_id, role, content)
    //   values (${salonId}, ${clientId}, 'user', 'Olá, gostaria de agendar um corte.'),
    //          (${salonId}, ${clientId}, 'assistant', 'Claro! Tenho horário amanhã às 10h.')
    // `

    // Também cria mensagens na tabela messages (relacionada ao chat)
    await tx`
      insert into messages (chat_id, role, content)
      values (${chatId}, 'user', 'Olá, gostaria de agendar um corte.'),
             (${chatId}, 'assistant', 'Claro! Tenho horário amanhã às 10h.')
    `

    // Removido: criação de salon_customers (tabela removida)
    // Clientes agora são criados diretamente na tabela customers
    const salonCustomerId = null

    const [{ id: leadId }] = await tx`
      insert into leads (salon_id, profile_id, phone_number, external_id, name, email, source, status, notes)
      values (${salonId}, ${clientId}, '+5511980000000', 'lead-001', 'Lead Demo', 'lead@demo.com', 'web', 'new', 'Lead criado pelo seed')
      returning id
    `

    const [{ id: campaignId }] = await tx`
      insert into campaigns (salon_id, name, description, status, starts_at)
      values (${salonId}, 'Boas Vindas', 'Campanha de boas vindas', 'active', now())
      returning id
    `

    await tx`
      insert into campaign_recipients (campaign_id, salon_customer_id, lead_id, profile_id)
      values (${campaignId}, ${salonCustomerId}, ${leadId}, ${clientId})
    `

    console.log('seed-ok', { ownerId, proUserId, clientId, salonId, professionalId, serviceCorteId, appointmentId, chatId, salonCustomerId, leadId, campaignId })
  })

  await sql.end({ timeout: 0 })
}

main().catch((err) => {
  console.error('seed-error', err)
  process.exit(1)
})
