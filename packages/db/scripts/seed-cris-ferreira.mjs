/**
 * Seed do salão de TESTE "Cris Ferreira / Spettacolo" para o harness de replay.
 *
 * Espelha o estilo de seed-solo-complete.mjs (postgres.js, SQL cru, transação).
 * Cria um salão fiel ao salão real das conversas reais usadas nas simulações:
 * serviços/preços da tabela (PDF), profissionais (Cris, Micaella, Alana, ...),
 * disponibilidade por dia-da-semana e um agente "Cathe".
 *
 * IDEMPOTENTE: se já existir um salão com slug 'cris-ferreira-test', apaga tudo
 * dele primeiro (appointments → salão em cascata) e recria do zero.
 *
 * Unidades (Aclimação x Campo Belo): o schema NÃO tem conceito de unidade. Por
 * decisão de projeto, as regras de unidade-por-dia vivem no system_prompt do
 * agente + na description do salão (o bot CONVERSA/roteia unidades; as tools só
 * validam dia-da-semana). O bot é instruído a registrar a unidade em notes ao
 * agendar. Enforcement de agenda por unidade = mudança de schema futura.
 *
 * Uso:
 *   node packages/db/scripts/seed-cris-ferreira.mjs
 *   # ou: pnpm --filter @repo/db seed:cris
 *
 * Env opcional:
 *   SEED_CORTE_PRICE=480   # PDF diz 400; as conversas citam 480. Default: 400.
 */

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

const SLUG = 'cris-ferreira-test'
const OWNER_EMAIL = 'cris.ferreira@replay.test'
const CLIENT_PHONE = '5500900000002' // telefone fake do cliente simulado (marker)
const CORTE_PRICE = Number(process.env.SEED_CORTE_PRICE ?? 400)

// day_of_week: o runtime usa getDay() => 0=Dom ... 6=Sáb. (Seg=1, Ter=2, ... Sáb=6)
const TUE = 2, WED = 3, THU = 4, FRI = 5, SAT = 6
const WEEK_TUE_SAT = [TUE, WED, THU, FRI, SAT] // toda a equipe trabalha de terça a sábado
const COLOR_DAYS = [TUE, WED, FRI, SAT] // Cris/coloração/mechas: Ter/Qua/Sex/Sáb (Cris não atende quintas)

// ---------------------------------------------------------------------------
// Catálogo de serviços (tabela de serviços do salão / PDF)
// duration em minutos; range => price_min/price_max (price = min como âncora NOT NULL)
// ---------------------------------------------------------------------------
const SERVICES = [
  { key: 'corte', name: 'Corte', duration: 150, price: CORTE_PRICE, type: 'fixed',
    description: 'Corte com finalização inclusa. Disponível todos os dias de atendimento.' },
  { key: 'coloracao_raiz', name: 'Coloração de raiz (retoque dos brancos)', duration: 120, price: 480, type: 'fixed',
    description: 'Cobertura dos brancos / retoque de raiz. Finalização inclusa. Dias: Ter/Qua/Sex/Sáb.' },
  { key: 'tonalizacao', name: 'Tonalização', duration: 120, price: 280, type: 'fixed',
    description: 'Tonalização (coloração Cadiveu/Wella R$280; Inoa/Keune R$320). Todos os dias.' },
  { key: 'mechas', name: 'Reflexo / Mechas / Luzes / Morena Iluminada', duration: 420, price: 1400, type: 'range', priceMin: 1400, priceMax: 1600,
    description: 'Iluminado: curtos/médios R$1400, longos R$1600 (incluso tratamento e finalização). Dias: Ter/Qua/Sex/Sáb. Clientes novas não são atendidas para mechas aos sábados.' },
  { key: 'progressiva', name: 'Selagem / Plástica nos fios / Progressiva / Escova de Cristal', duration: 180, price: 600, type: 'range', priceMin: 600, priceMax: 800,
    description: 'Alisamento/selagem: curtos/médios R$600, longos R$800. Todos os dias.' },
  { key: 'escova', name: 'Escova / Finalização', duration: 60, price: 250, type: 'fixed',
    description: 'Escova / finalização. Dias: Ter/Qua/Sex/Sáb.' },
  { key: 'devolucao_contraste', name: 'Devolução de contraste', duration: 60, price: 150, type: 'fixed',
    description: 'Devolução de contraste. Todos os dias.' },
  { key: 'abertura_fundo', name: 'Abertura de fundo', duration: 420, price: 600, type: 'fixed',
    description: 'Abertura de fundo. Dias: Ter/Qua/Sex/Sáb. Clientes novas não são atendidas aos sábados.' },
  { key: 'laminacao', name: 'Laminação', duration: 180, price: 500, type: 'fixed',
    description: 'Laminação. Dias: Ter/Qua/Sex/Sáb.' },
  { key: 'tratamento', name: 'Protocolo de tratamento / Hidratação', duration: 120, price: 150, type: 'range', priceMin: 150, priceMax: 600,
    description: 'Tratamentos e hidratações. Preço depende da avaliação da Cris. Costuma ser vendido em pacote de 5 sessões (1x por mês).' },
  { key: 'coloracao_total', name: 'Coloração no cabelo todo', duration: 180, price: 1100, type: 'fixed',
    description: 'Coloração no cabelo todo. R$1100.' },
  { key: 'babyliss', name: 'Babyliss', duration: 60, price: 350, type: 'range', priceMin: 350, priceMax: 450,
    description: 'Babyliss / modelagem. R$350 a R$450.' },
  { key: 'escova_simples', name: 'Escova simples', duration: 60, price: 70, type: 'fixed',
    description: 'Escova simples. R$70.' },
  { key: 'manicure', name: 'Manicure (mão)', duration: 45, price: 60, type: 'fixed',
    description: 'Manicure / mão. Todos os dias.' },
  { key: 'pe', name: 'Pé (pedicure)', duration: 45, price: 60, type: 'fixed',
    description: 'Pedicure / pé. Todos os dias.' },
  { key: 'esmaltacao_gel', name: 'Esmaltação em gel', duration: 90, price: 120, type: 'fixed',
    description: 'Esmaltação em gel. R$120.' },
]

// ---------------------------------------------------------------------------
// Profissionais (capabilities por chave de serviço; especialista = oferta primeiro)
// ---------------------------------------------------------------------------
const PROFESSIONALS = [
  {
    key: 'cris', name: 'Cris', role: 'OWNER', isOwner: true,
    email: 'cris@replay.test', phone: '+5511000000010',
    days: COLOR_DAYS, // Cris não atende quintas
    services: ['corte', 'mechas', 'coloracao_raiz', 'coloracao_total', 'tonalizacao', 'escova'],
    specialist: ['corte', 'mechas'],
    unitNote: 'Cris atende na Aclimação somente aos sábados; durante a semana, no Campo Belo.',
  },
  {
    key: 'micaella', name: 'Micaella', role: 'STAFF',
    email: 'micaella@replay.test', phone: '+5511000000011',
    days: WEEK_TUE_SAT,
    services: ['coloracao_raiz', 'progressiva', 'tonalizacao', 'escova', 'tratamento'],
    specialist: ['coloracao_raiz', 'progressiva'],
    unitNote: 'Micaella atende principalmente no Campo Belo (eventualmente Aclimação).',
  },
  {
    key: 'alana', name: 'Alana', role: 'STAFF',
    email: 'alana@replay.test', phone: '+5511000000012',
    days: WEEK_TUE_SAT,
    services: ['manicure', 'pe', 'esmaltacao_gel'],
    specialist: ['esmaltacao_gel'],
    unitNote: 'Alana atende no Campo Belo.',
  },
  {
    key: 'amanda', name: 'Amanda', role: 'STAFF',
    email: 'amanda@replay.test', phone: '+5511000000013',
    days: COLOR_DAYS,
    services: ['coloracao_raiz', 'tonalizacao'],
    specialist: [],
    unitNote: 'Amanda atende no Campo Belo.',
  },
  {
    key: 'edinalva', name: 'Edinalva', role: 'STAFF',
    email: 'edinalva@replay.test', phone: '+5511000000014',
    days: WEEK_TUE_SAT,
    services: ['pe', 'manicure'],
    specialist: ['pe'],
    unitNote: '',
  },
  {
    key: 'marcelie', name: 'Marcelie', role: 'STAFF',
    email: 'marcelie@replay.test', phone: '+5511000000015',
    days: WEEK_TUE_SAT,
    services: ['manicure', 'pe', 'esmaltacao_gel'],
    specialist: [],
    unitNote: '',
  },
  {
    key: 'giuliana', name: 'Giuliana', role: 'STAFF',
    email: 'giuliana@replay.test', phone: '+5511000000016',
    days: WEEK_TUE_SAT,
    services: ['manicure', 'pe'],
    specialist: [],
    unitNote: '',
  },
]

// ---------------------------------------------------------------------------
// System prompt do agente "Cathe" (sufixo específico do salão — onde mora a
// fidelidade das regras de unidade/dia que o schema não representa).
// ---------------------------------------------------------------------------
const AGENT_SYSTEM_PROMPT = `Você é a Cathe, secretária do salão Cris Ferreira (Spettacolo). Tom informal, acolhedor, mensagens curtas, em português do Brasil.

UNIDADES (o sistema agenda por profissional/horário; confirme SEMPRE a unidade na conversa e registre a unidade escolhida no campo de observações/notes ao agendar):
- Aclimação: Rua Coronel Diogo, 364.
- Campo Belo: Rua João de Sousa Dias, 368.
- Eventualmente Nações Unidas (apenas em casos excepcionais).

REGRA DA CRIS: a Cris atende na Aclimação SOMENTE aos sábados; durante a semana ela atende no Campo Belo. A equipe (Micaella, Alana, Amanda, etc.) atende de terça a sábado, normalmente no Campo Belo.

HORÁRIOS: atendimento de terça a sábado, das 9h às 17h. Fechado domingo e segunda.

REGRAS DE SERVIÇO:
- Coloração de raiz, reflexo/mechas/luzes, escova/finalização, laminação e abertura de fundo: somente terça, quarta, sexta e sábado.
- Corte, progressiva/selagem, tonalização, tratamentos e manicure/pé: todos os dias de atendimento.
- Clientes NOVAS não fazem mechas nem abertura de fundo aos sábados.
- A Cris não atende às quintas (somente a equipe).
- Tratamentos/hidratações dependem de avaliação da Cris (preço variável) e costumam ser pacote de 5 sessões (1x por mês).
- Preços já incluem finalização quando indicado.

ATENDIMENTO: para cliente nova, pergunte o nome e se é a primeira vez com a Cris. Faça uma pergunta por vez. Nunca invente preço, horário, serviço ou profissional — consulte sempre pelas ferramentas.`

async function main() {
  console.log('🌱 Seed do salão de TESTE: Cris Ferreira / Spettacolo')
  console.log('📊 Banco:', url.replace(/:[^@]*@/, ':****@'))
  console.log('')

  await sql.begin(async (tx) => {
    // -----------------------------------------------------------------------
    // 0. Idempotência: apaga o salão de teste anterior (se existir)
    // -----------------------------------------------------------------------
    const existing = await tx`SELECT id FROM salons WHERE slug = ${SLUG}`
    if (existing.length > 0) {
      const oldId = existing[0].id
      console.log(`♻️  Salão '${SLUG}' já existe (${oldId}). Removendo para recriar...`)
      // profiles.salon_id referencia salons (sem cascade) → soltar antes de apagar
      await tx`UPDATE profiles SET salon_id = NULL WHERE salon_id = ${oldId}`
      // appointments referenciam salons SEM cascade → apagar antes
      await tx`DELETE FROM appointments WHERE salon_id = ${oldId}`
      // o resto (services, professionals, availability, professional_services,
      // agents, customers, chats, messages) cai em cascata ao apagar o salão
      await tx`DELETE FROM salons WHERE id = ${oldId}`
    }

    // -----------------------------------------------------------------------
    // 1. Owner profile
    // -----------------------------------------------------------------------
    let [owner] = await tx`SELECT id FROM profiles WHERE email = ${OWNER_EMAIL}`
    if (!owner) {
      const ownerId = randomUUID()
      await tx`
        INSERT INTO profiles (id, email, system_role, role, tier, full_name, phone, onboarding_completed)
        VALUES (${ownerId}, ${OWNER_EMAIL}, 'user', 'OWNER'::profile_role, 'PRO'::subscription_tier,
                'Cris Ferreira', '+5511000000001', true)
      `
      owner = { id: ownerId }
    } else {
      await tx`
        UPDATE profiles
        SET role = 'OWNER'::profile_role, tier = 'PRO'::subscription_tier,
            full_name = 'Cris Ferreira', onboarding_completed = true, updated_at = now()
        WHERE id = ${owner.id}
      `
    }
    const ownerId = owner.id
    console.log(`✅ Owner: ${ownerId}`)

    // -----------------------------------------------------------------------
    // 2. Salão
    // -----------------------------------------------------------------------
    const salonId = randomUUID()
    const workHours = {
      monday: { open: null, close: null },
      tuesday: { open: '09:00', close: '17:00' },
      wednesday: { open: '09:00', close: '17:00' },
      thursday: { open: '09:00', close: '17:00' },
      friday: { open: '09:00', close: '17:00' },
      saturday: { open: '09:00', close: '17:00' },
      sunday: { open: null, close: null },
    }
    const settings = {
      accepts_card: true,
      accepts_pix: true,
      late_tolerance_minutes: 15,
      cancellation_policy_hours: 24,
      auto_confirm: false,
      send_reminders: true,
      reminder_hours_before: 24,
    }
    const description = [
      'Salão Cris Ferreira (Spettacolo). Atendimento de terça a sábado, das 9h às 17h.',
      'Duas unidades: Aclimação (Rua Coronel Diogo, 364) e Campo Belo (Rua João de Sousa Dias, 368).',
      'A Cris atende na Aclimação somente aos sábados; durante a semana, no Campo Belo.',
    ].join(' ')

    await tx`
      INSERT INTO salons (id, owner_id, name, slug, whatsapp, address, phone, description,
                          settings, work_hours, subscription_status)
      VALUES (
        ${salonId}, ${ownerId},
        'Cris Ferreira / Spettacolo (Replay Test)',
        ${SLUG},
        '+5511000000001',
        'Rua Coronel Diogo, 364 - Aclimação, São Paulo - SP',
        '+5511000000001',
        ${description},
        ${JSON.stringify(settings)}::jsonb,
        ${JSON.stringify(workHours)}::jsonb,
        'ACTIVE'::subscription_status
      )
    `
    await tx`UPDATE profiles SET salon_id = ${salonId} WHERE id = ${ownerId}`
    console.log(`✅ Salão: ${salonId} (${SLUG})`)

    // -----------------------------------------------------------------------
    // 3. Serviços
    // -----------------------------------------------------------------------
    const serviceIdByKey = {}
    for (const svc of SERVICES) {
      const [{ id }] = await tx`
        INSERT INTO services (salon_id, name, description, duration, price, price_type, price_min, price_max, is_active)
        VALUES (
          ${salonId}, ${svc.name}, ${svc.description}, ${svc.duration},
          ${svc.price}, ${svc.type},
          ${svc.priceMin ?? null}, ${svc.priceMax ?? null}, true
        )
        RETURNING id
      `
      serviceIdByKey[svc.key] = id
    }
    console.log(`✅ Serviços: ${Object.keys(serviceIdByKey).length}`)

    // -----------------------------------------------------------------------
    // 4. Profissionais + professional_services + availability
    // -----------------------------------------------------------------------
    const proIdByKey = {}
    for (const pro of PROFESSIONALS) {
      const serviceIds = pro.services.map((k) => serviceIdByKey[k]).filter(Boolean)
      const [{ id: proId }] = await tx`
        INSERT INTO professionals (salon_id, user_id, person_key, role, name, email, phone, service_ids, is_active)
        VALUES (
          ${salonId},
          ${pro.isOwner ? ownerId : null},
          ${randomUUID()},
          ${pro.role}::professional_role,
          ${pro.name}, ${pro.email}, ${pro.phone},
          ${JSON.stringify(serviceIds)}::jsonb,
          true
        )
        RETURNING id
      `
      proIdByKey[pro.key] = proId

      // capabilities (professional_services)
      for (const k of pro.services) {
        const serviceId = serviceIdByKey[k]
        if (!serviceId) continue
        const isSpecialist = pro.specialist.includes(k)
        await tx`
          INSERT INTO professional_services (professional_id, service_id, is_specialist)
          VALUES (${proId}, ${serviceId}, ${isSpecialist})
          ON CONFLICT DO NOTHING
        `
      }

      // disponibilidade por dia da semana (sem linha de almoço — serviços de
      // 6-7h ficariam sem slot; é um desvio consciente da realidade)
      for (const day of pro.days) {
        await tx`
          INSERT INTO availability (professional_id, day_of_week, start_time, end_time, is_break)
          VALUES (${proId}, ${day}, '09:00', '17:00', false)
        `
      }
    }
    console.log(`✅ Profissionais: ${Object.keys(proIdByKey).length}`)

    // -----------------------------------------------------------------------
    // 5. Agente "Cathe" (único ativo)
    // -----------------------------------------------------------------------
    const [{ id: agentId }] = await tx`
      INSERT INTO agents (salon_id, name, system_prompt, model, tone, is_active)
      VALUES (${salonId}, 'Cathe', ${AGENT_SYSTEM_PROMPT}, 'gpt-5.4-mini-2026-03-17', 'informal', true)
      RETURNING id
    `
    console.log(`✅ Agente: ${agentId} (Cathe)`)

    // -----------------------------------------------------------------------
    // 6. Saída (copiável para o .env da raiz)
    // -----------------------------------------------------------------------
    const crisId = proIdByKey['cris']
    const corteId = serviceIdByKey['corte']

    console.log('')
    console.log('=== Cris Ferreira REPLAY seed concluído ===')
    console.log('# Cole no .env da RAIZ do monorepo:')
    console.log(`REPLAY_SALON_ID=${salonId}`)
    console.log(`REPLAY_SALON_SLUG=${SLUG}`)
    console.log(`REPLAY_AGENT_ID=${agentId}            # Cathe`)
    console.log(`REPLAY_PROFESSIONAL_ID=${crisId}     # Cris (default)`)
    console.log(`REPLAY_SERVICE_ID=${corteId}         # Corte (default)`)
    console.log(`REPLAY_CLIENT_PHONE=${CLIENT_PHONE}`)
    console.log('# Aliases para a suíte de eval existente (env.ts lê EVAL_*):')
    console.log(`EVAL_SALON_ID=${salonId}`)
    console.log(`EVAL_PROFESSIONAL_ID=${crisId}`)
    console.log(`EVAL_SERVICE_ID=${corteId}`)
    console.log('')
    console.log('# Profissionais:')
    for (const pro of PROFESSIONALS) {
      console.log(`#   ${pro.name.padEnd(10)} = ${proIdByKey[pro.key]}`)
    }
    console.log('# Serviços (id  duração  preço  nome):')
    for (const svc of SERVICES) {
      console.log(`#   ${serviceIdByKey[svc.key]}  ${String(svc.duration).padStart(3)}min  R$${svc.price}  ${svc.name}`)
    }
  })

  await sql.end({ timeout: 0 })
  console.log('\n✅ Done.')
}

main().catch((err) => {
  console.error('❌ Erro no seed:', err)
  process.exit(1)
})
