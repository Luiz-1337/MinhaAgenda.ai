// Apaga profile(s) ÓRFÃO(S) por email — ou seja, registro em `profiles` que
// NÃO tem usuário correspondente em `auth.users` (conta incompleta, não loga).
//
// Segurança:
//  - Só apaga profiles SEM auth.users (nunca toca numa conta real que loga).
//  - PULA qualquer órfão que seja dono de salão (evita cascatear dados do salão).
//  - Desvincula professionals (FK sem cascade) antes de apagar.
//
// Uso (lê DATABASE_URL do .env da raiz):
//   pnpm --filter @repo/db exec node scripts/delete-orphan-profile.mjs
//   pnpm --filter @repo/db exec node scripts/delete-orphan-profile.mjs outro@email.com

import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import * as dotenv from 'dotenv'
import postgres from 'postgres'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..', '..', '..')
dotenv.config({ path: path.resolve(root, '.env.local'), override: false })
dotenv.config({ path: path.resolve(root, '.env'), override: false })
dotenv.config({ path: path.resolve(root, 'apps/web/.env.local'), override: false })

const url = process.env.DATABASE_URL
if (!url) {
  console.error('DATABASE_URL não definida (verifique o .env da raiz).')
  process.exit(1)
}

const email = process.argv[2] || 'cris.spettacolo@gmail.com'
const sql = postgres(url, { prepare: false, ssl: 'require' })

async function main() {
  // 1. Profiles com esse email que são ÓRFÃOS (sem auth.users).
  const orphans = await sql`
    SELECT p.id, p.email, p.full_name, p.system_role
    FROM profiles p
    LEFT JOIN auth.users a ON a.id = p.id
    WHERE p.email = ${email} AND a.id IS NULL
  `

  if (orphans.length === 0) {
    console.log(`Nenhum profile órfão para "${email}". Nada a apagar.`)
    await sql.end({ timeout: 0 })
    return
  }

  console.log(`Órfãos encontrados para "${email}":`)
  console.log(JSON.stringify(orphans, null, 2))

  let deleted = 0
  for (const o of orphans) {
    const ownedSalons = await sql`SELECT id, name FROM salons WHERE owner_id = ${o.id}`
    if (ownedSalons.length > 0) {
      console.log(`PULANDO ${o.id}: possui ${ownedSalons.length} salão(ões) — verifique manualmente.`)
      continue
    }

    try {
      await sql.begin(async (tx) => {
        await tx`UPDATE professionals SET user_id = NULL WHERE user_id = ${o.id}`
        await tx`DELETE FROM profiles WHERE id = ${o.id}`
      })
      deleted++
      console.log(`✅ Apagado profile órfão ${o.id} (${o.email})`)
    } catch (err) {
      console.log(`❌ Falhou ao apagar ${o.id}: ${err.message} (provável dado vinculado — agendamento/lead).`)
    }
  }

  console.log(`\nConcluído. ${deleted} profile(s) órfão(s) apagado(s).`)
  await sql.end({ timeout: 0 })
}

main().catch((err) => {
  console.error('erro:', err.message)
  process.exit(1)
})
