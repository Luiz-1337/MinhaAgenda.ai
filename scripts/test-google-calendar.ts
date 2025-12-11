/**
 * Script de teste rápido para integração Google Calendar
 * 
 * Uso:
 *   pnpm tsx scripts/test-google-calendar.ts <appointment-id>
 * 
 * Ou importe e use programaticamente
 */

import { createGoogleEvent } from '../apps/web/lib/google'

async function main() {
  const appointmentId = process.argv[2]

  if (!appointmentId) {
    console.error('❌ Erro: Forneça o ID do agendamento')
    console.log('\nUso: pnpm tsx scripts/test-google-calendar.ts <appointment-id>')
    process.exit(1)
  }

  console.log('🧪 Testando criação de evento no Google Calendar...')
  console.log(`📅 Appointment ID: ${appointmentId}\n`)

  try {
    const result = await createGoogleEvent(appointmentId)

    if (!result) {
      console.log('ℹ️  Salão não tem integração Google Calendar configurada')
      console.log('   Configure a integração primeiro acessando: /api/google/auth')
      process.exit(0)
    }

    console.log('✅ Evento criado com sucesso!')
    console.log(`   Event ID: ${result.eventId}`)
    if (result.htmlLink) {
      console.log(`   Link: ${result.htmlLink}`)
    }
    console.log('\n📌 Verifique seu Google Calendar para ver o evento')
  } catch (error: any) {
    console.error('❌ Erro ao criar evento:', error.message)
    console.error('\n💡 Verifique:')
    console.error('   1. Se a integração Google está configurada')
    console.error('   2. Se as variáveis de ambiente estão corretas')
    console.error('   3. Se os tokens não expiraram')
    process.exit(1)
  }
}

main()

