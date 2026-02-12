import * as dotenv from 'dotenv'
import postgres from 'postgres'

const env = dotenv.config({ path: '../../.env' })
const url = (env.parsed && env.parsed.DATABASE_URL) ? env.parsed.DATABASE_URL : process.env.DATABASE_URL
if (!url) {
  console.error('DATABASE_URL not set')
  process.exit(1)
}

const sql = postgres(url, { prepare: false, ssl: 'require' })

/**
 * Script para limpar profissionais extras de salões SOLO
 * Garante que apenas o owner exista como profissional em salões com tier SOLO
 */
async function main() {
  console.log('🧹 Iniciando limpeza de profissionais extras em salões SOLO')
  console.log('📊 Conectando ao banco:', url.replace(/:[^@]*@/, ':****@'))
  console.log('')

  await sql.begin(async (tx) => {
    // 1. Buscar todos os salões onde o owner tem tier SOLO
    const soloSalons = await tx`
      SELECT s.id as salon_id, s.owner_id, p.tier
      FROM salons s
      INNER JOIN profiles p ON p.id = s.owner_id
      WHERE p.tier = 'SOLO'
    `

    console.log(`📋 Encontrados ${soloSalons.length} salão(ões) com plano SOLO`)

    if (soloSalons.length === 0) {
      console.log('✅ Nenhum salão SOLO encontrado. Nada para limpar.')
      return
    }

    let totalRemoved = 0

    for (const salon of soloSalons) {
      const { salon_id, owner_id } = salon
      console.log(`\n🔍 Processando salão ${salon_id} (owner: ${owner_id})`)

      // 2. Buscar todos os profissionais do salão
      const professionals = await tx`
        SELECT id, user_id, name, email, salon_id
        FROM professionals
        WHERE salon_id = ${salon_id}
      `

      console.log(`   📊 Encontrados ${professionals.length} profissional(is) no salão`)

      // 3. Identificar profissionais que NÃO são o owner
      const extraProfessionals = professionals.filter(pro => pro.user_id !== owner_id)

      if (extraProfessionals.length === 0) {
        console.log(`   ✅ Nenhum profissional extra encontrado. Apenas o owner existe.`)
        continue
      }

      console.log(`   ⚠️  Encontrados ${extraProfessionals.length} profissional(is) extra(s) para remover:`)
      extraProfessionals.forEach(pro => {
        console.log(`      - ${pro.name} (${pro.email}) - ID: ${pro.id}`)
      })

      const extraProfessionalIds = extraProfessionals.map(p => p.id)

      // 4. Remover dados relacionados aos profissionais extras

      // 4.1. Schedule overrides
      console.log(`   🗑️  Deletando schedule_overrides...`)
      const overridesDeleted = await tx`
        DELETE FROM schedule_overrides 
        WHERE professional_id = ANY(${extraProfessionalIds})
      `
      console.log(`      ✅ ${overridesDeleted.count || 0} schedule overrides removidos`)

      // 4.2. Professional services
      console.log(`   🗑️  Deletando professional_services...`)
      const servicesDeleted = await tx`
        DELETE FROM professional_services 
        WHERE professional_id = ANY(${extraProfessionalIds})
      `
      console.log(`      ✅ ${servicesDeleted.count || 0} vínculos de serviços removidos`)

      // 4.3. Availability
      console.log(`   🗑️  Deletando availability...`)
      const availabilityDeleted = await tx`
        DELETE FROM availability 
        WHERE professional_id = ANY(${extraProfessionalIds})
      `
      console.log(`      ✅ ${availabilityDeleted.count || 0} horários de disponibilidade removidos`)

      // 4.4. Integrations (por profissional)
      // console.log(`   🗑️  Deletando integrations...`)
      // const integrationsDeleted = await tx`
      //   DELETE FROM integrations 
      //   WHERE professional_id = ANY(${extraProfessionalIds})
      // `
      // console.log(`      ✅ ${integrationsDeleted.count || 0} integrações removidas`)

      // 4.5. Appointments futuros (cancelar agendamentos futuros desses profissionais)
      console.log(`   🗑️  Cancelando appointments futuros...`)
      const appointmentsDeleted = await tx`
        UPDATE appointments 
        SET status = 'cancelled'
        WHERE professional_id = ANY(${extraProfessionalIds})
          AND date > NOW()
          AND status IN ('pending', 'confirmed')
      `
      console.log(`      ✅ ${appointmentsDeleted.count || 0} agendamentos futuros cancelados`)

      // 5. Remover os profissionais extras
      console.log(`   🗑️  Deletando profissionais extras...`)
      const professionalsDeleted = await tx`
        DELETE FROM professionals 
        WHERE id = ANY(${extraProfessionalIds})
      `
      console.log(`      ✅ ${professionalsDeleted.count || 0} profissional(is) removido(s)`)

      totalRemoved += extraProfessionals.length

      // 6. Garantir que existe um profissional para o owner
      const ownerProfessional = professionals.find(pro => pro.user_id === owner_id)
      if (!ownerProfessional) {
        console.log(`   ⚠️  Owner não tem profissional vinculado. Criando automaticamente...`)
        // Buscar dados do owner
        const [ownerProfile] = await tx`
          SELECT full_name, first_name, last_name, email, phone
          FROM profiles
          WHERE id = ${owner_id}
        `

        if (ownerProfile) {
          const professionalName = ownerProfile.full_name ||
            (ownerProfile.first_name && ownerProfile.last_name
              ? `${ownerProfile.first_name} ${ownerProfile.last_name}`.trim()
              : ownerProfile.first_name || ownerProfile.last_name || 'Profissional')

          await tx`
            INSERT INTO professionals (salon_id, user_id, name, email, phone, role, is_active, commission_rate)
            VALUES (
              ${salon_id},
              ${owner_id},
              ${professionalName},
              ${ownerProfile.email},
              ${ownerProfile.phone || null},
              'MANAGER',
              true,
              '0'
            )
          `
          console.log(`      ✅ Profissional do owner criado: ${professionalName}`)
        }
      } else {
        console.log(`   ✅ Owner já tem profissional vinculado: ${ownerProfessional.name}`)
      }
    }

    console.log('')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log(`✅ Limpeza concluída com sucesso!`)
    console.log(`📊 Total de profissionais removidos: ${totalRemoved}`)
    console.log(`📋 Total de salões processados: ${soloSalons.length}`)
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  })

  await sql.end({ timeout: 0 })
  console.log('')
  console.log('✨ Script finalizado!')
}

main().catch((err) => {
  console.error('❌ Erro ao limpar salões SOLO:', err)
  process.exit(1)
})
