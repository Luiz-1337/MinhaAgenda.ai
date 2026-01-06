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

const EMAIL = 'pro@teste.com'
const PASSWORD = 'teste123'
const FULL_NAME = 'Maria Silva Santos'

async function main() {
  console.log('🔐 Criando usuário de autenticação...')
  console.log(`📧 Email: ${EMAIL}`)
  console.log(`🔑 Senha: ${PASSWORD}`)
  console.log('')

  await sql.begin(async (tx) => {
    // 1. Buscar o profile existente
    const [profile] = await tx`
      SELECT id, email, full_name FROM profiles WHERE email = ${EMAIL}
    `

    if (!profile) {
      console.error(`❌ Profile com email ${EMAIL} não encontrado!`)
      console.error('   Execute o seed primeiro ou crie o profile manualmente.')
      process.exit(1)
    }

    console.log(`✅ Profile encontrado: ${profile.id}`)
    console.log(`   Nome: ${profile.full_name || FULL_NAME}`)
    console.log('')

    // 2. Verificar se já existe no auth.users
    const [existingUser] = await tx`SELECT id FROM auth.users WHERE email = ${EMAIL}`
    
    if (existingUser) {
      console.log(`⚠️  Usuário ${EMAIL} já existe no Auth.`)
      console.log(`   ID: ${existingUser.id}`)
      console.log('')
      console.log('💡 Para redefinir a senha, você pode:')
      console.log('   1. Usar a funcionalidade de recuperação de senha')
      console.log('   2. Ou deletar o usuário e executar este script novamente')
      return
    }

    // 3. Criar hash da senha
    console.log('🔐 Gerando hash da senha...')
    const [{ hash: passwordHash }] = await tx`
      SELECT crypt(${PASSWORD}, gen_salt('bf')) as hash
    `

    // 4. Criar usuário no auth.users
    console.log('👤 Criando usuário no auth.users...')
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
        ${profile.id},
        'authenticated',
        'authenticated',
        ${EMAIL},
        ${passwordHash},
        now(),
        '{"provider": "email", "providers": ["email"]}',
        ${tx.json({ full_name: profile.full_name || FULL_NAME })},
        now(),
        now(),
        '',
        '',
        '',
        ''
      )
    `

    // 5. Criar identity
    console.log('🆔 Criando identity...')
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
        ${profile.id},
        ${tx.json({ sub: profile.id, email: EMAIL })},
        'email',
        ${profile.id},
        now(),
        now(),
        now()
      )
    `

    console.log('')
    console.log('✅ Usuário de autenticação criado com sucesso!')
    console.log('')
    console.log('📋 Credenciais:')
    console.log(`   📧 Email: ${EMAIL}`)
    console.log(`   🔑 Senha: ${PASSWORD}`)
    console.log(`   🆔 User ID: ${profile.id}`)
    console.log('')
    console.log('💡 Agora você pode fazer login com essas credenciais.')
  })

  await sql.end({ timeout: 0 })
}

main().catch((err) => {
  console.error('❌ Erro ao criar usuário:', err)
  process.exit(1)
})

