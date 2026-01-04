import postgres from 'postgres'

const connectionString = 'postgresql://postgres.egrfxtrkcasiuypkxilr:n5c+RcNxT*!puv6@aws-0-us-west-2.pooler.supabase.com:6543/postgres'
const sql = postgres(connectionString, { ssl: 'require' })

async function checkPgcrypto() {
  try {
    const [result] = await sql`SELECT crypt('teste123', gen_salt('bf')) as hash`
    console.log('Hash gerado:', result.hash)
  } catch (err) {
    console.error('Erro pgcrypto:', err.message)
    // Tenta habilitar
    try {
        await sql`CREATE EXTENSION IF NOT EXISTS pgcrypto`
        console.log('Extensão pgcrypto habilitada.')
        const [result] = await sql`SELECT crypt('teste123', gen_salt('bf')) as hash`
        console.log('Hash gerado após habilitar:', result.hash)
    } catch (e) {
        console.error('Falha ao habilitar pgcrypto:', e.message)
    }
  } finally {
    await sql.end()
  }
}

checkPgcrypto()






