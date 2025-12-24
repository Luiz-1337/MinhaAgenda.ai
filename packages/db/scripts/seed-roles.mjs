import postgres from 'postgres'

const connectionString = 'postgresql://postgres.egrfxtrkcasiuypkxilr:n5c+RcNxT*!puv6@aws-0-us-west-2.pooler.supabase.com:6543/postgres'
const sql = postgres(connectionString, { ssl: 'require' })

const usersToCreate = [
  { email: 'owner@teste.com', role: 'OWNER', name: 'Owner User' },
  { email: 'manager@teste.com', role: 'MANAGER', name: 'Manager User' },
  { email: 'staff@teste.com', role: 'STAFF', name: 'Staff User' }
]

async function seed() {
  console.log('Iniciando seed via SQL direto...')

  // 1. Criar Owner
  const ownerData = usersToCreate.find(u => u.role === 'OWNER')
  let ownerId = await createUserIfNotExists(ownerData.email, ownerData.name)
  console.log(`Owner ID: ${ownerId}`)

  // 2. Criar Salão
  const salonSlug = 'salao-teste-business'
  // Check salon
  const [existingSalon] = await sql`SELECT id FROM public.salons WHERE slug = ${salonSlug}`
  let salonId

  if (existingSalon) {
    salonId = existingSalon.id
    console.log(`Salão já existe: ${salonId}`)
    // Atualiza owner se precisar
    await sql`UPDATE public.salons SET owner_id = ${ownerId} WHERE id = ${salonId}`
  } else {
    const [salon] = await sql`
      INSERT INTO public.salons (owner_id, name, slug, plan_tier, subscription_status)
      VALUES (${ownerId}, 'Salão Teste Business', ${salonSlug}, 'BUSINESS', 'ACTIVE')
      RETURNING id
    `
    salonId = salon.id
    console.log(`Salão criado: ${salonId}`)
  }

  // 3. Criar e vincular todos os usuários
  for (const userData of usersToCreate) {
    console.log(`Processando ${userData.role}...`)
    
    // Se for owner, já criamos ou recuperamos, mas a função é idempotente (retorna ID se existe)
    // Se for outros, cria agora
    const userId = (userData.role === 'OWNER') ? ownerId : await createUserIfNotExists(userData.email, userData.name)

    // Criar Profissional
    // Verifica vínculo
    const [existingPro] = await sql`SELECT id FROM public.professionals WHERE salon_id = ${salonId} AND user_id = ${userId}`
    
    if (!existingPro) {
      await sql`
        INSERT INTO public.professionals (salon_id, user_id, name, email, role, is_active)
        VALUES (${salonId}, ${userId}, ${userData.name}, ${userData.email}, ${userData.role}, true)
      `
      console.log(`Profissional ${userData.email} criado como ${userData.role}`)
    } else {
      console.log(`Profissional ${userData.email} já vinculado.`)
    }
  }

  console.log('Seed concluído com sucesso!')
  await sql.end()
}

async function createUserIfNotExists(email, name) {
  // Verifica se existe em auth.users
  const [existingUser] = await sql`SELECT id FROM auth.users WHERE email = ${email}`
  
  if (existingUser) {
    console.log(`Usuário ${email} já existe no Auth.`)
    // Garante profile
    await ensureProfile(existingUser.id, email, name)
    return existingUser.id
  }

  // Cria novo usuário
  console.log(`Criando usuário ${email} no Auth...`)
  const id = crypto.randomUUID()
  const encryptedPassword = await sql`SELECT crypt('teste123', gen_salt('bf')) as hash`
  const passwordHash = encryptedPassword[0].hash

  await sql`
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
      ${id},
      'authenticated',
      'authenticated',
      ${email},
      ${passwordHash},
      now(),
      '{"provider": "email", "providers": ["email"]}',
      ${sql.json({ full_name: name })},
      now(),
      now(),
      '',
      '',
      '',
      ''
    )
  `

  // Inserir em auth.identities
  // Identity ID é novo UUID
  const identityId = crypto.randomUUID()
  
  await sql`
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
      ${id},
      ${sql.json({ sub: id, email: email })},
      'email',
      ${id}, -- provider_id geralmente é o ID do user para email provider
      now(),
      now(),
      now()
    )
  `

  await ensureProfile(id, email, name)
  
  return id
}

async function ensureProfile(id, email, name) {
  await sql`
    INSERT INTO public.profiles (id, email, full_name, system_role, onboarding_completed)
    VALUES (${id}, ${email}, ${name}, 'user', true)
    ON CONFLICT (id) DO UPDATE SET 
      email = EXCLUDED.email,
      full_name = EXCLUDED.full_name,
      onboarding_completed = true
  `
}

seed().catch((err) => {
  console.error('Erro fatal:', err)
  process.exit(1)
})
