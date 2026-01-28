/**
 * Lista os WhatsApp Senders da conta Twilio via API.
 * Útil para conferir se o Senders API está criando e onde a conta está.
 *
 * Uso: pnpm exec dotenv -e .env -- tsx scripts/list-twilio-senders.ts
 */

import "dotenv/config"
import twilio from "twilio"

const accountSid = process.env.TWILIO_ACCOUNT_SID
const authToken = process.env.TWILIO_AUTH_TOKEN

if (!accountSid || !authToken) {
  console.error("Defina TWILIO_ACCOUNT_SID e TWILIO_AUTH_TOKEN no .env")
  process.exit(1)
}

const client = twilio(accountSid, authToken)

async function main() {
  console.log("Account SID (primeiros 8):", accountSid.slice(0, 8) + "...")
  console.log("Listando WhatsApp Senders via GET /v2/Channels/Senders?Channel=whatsapp ...\n")

  try {
    // List usa channel=whatsapp como query
    const list = await client.messaging.v2.channelsSenders.list({ channel: "whatsapp" } as any)
    if (!list || list.length === 0) {
      console.log("Nenhum Sender encontrado.")
      console.log("\n--- IMPORTANTE ---")
      console.log("O primeiro WhatsApp Sender precisa ser criado pelo Self Sign-up no Console:")
      console.log("  https://console.twilio.com/us1/develop/sms/senders/whatsapp-senders")
      console.log("  ou: Messaging > Senders > WhatsApp Senders > WhatsApp Self Sign-up")
      console.log("\nSó após ter o primeiro Sender é que a Senders API (botão Conectar) funciona para números adicionais.")
      return
    }
    console.log(`Encontrados ${list.length} Sender(s):\n`)
    for (const s of list) {
      console.log(`  SID: ${(s as any).sid}`)
      console.log(`  sender_id: ${(s as any).senderId ?? (s as any).sender_id}`)
      console.log(`  status: ${(s as any).status}`)
      console.log("  ---")
    }
  } catch (e: any) {
    console.error("Erro ao listar:", e?.message || e)
    if (e?.code) console.error("Código Twilio:", e.code)
  }
}

main()
