import postgres from 'postgres'

const connectionString = 'postgresql://postgres.egrfxtrkcasiuypkxilr:n5c+RcNxT*!puv6@aws-0-us-west-2.pooler.supabase.com:6543/postgres'
const sql = postgres(connectionString, { ssl: 'require' })

async function checkAuthAccess() {
  try {
    const result = await sql`SELECT count(*) FROM auth.users`
    console.log('Acesso ao auth.users OK:', result)
    return true
  } catch (err) {
    console.error('Sem acesso ao auth.users:', err.message)
    return false
  } finally {
    await sql.end()
  }
}

checkAuthAccess()




