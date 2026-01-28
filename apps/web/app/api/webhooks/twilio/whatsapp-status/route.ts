/**
 * Webhook para callbacks de status da Twilio Senders API (WhatsApp)
 * Atualiza status (ONLINE, OFFLINE, PENDING_VERIFICATION, etc.) em whatsapp_number do agente.
 */

import { NextRequest } from "next/server"
import { validateRequest } from "twilio"
import { db, agents } from "@repo/db"
import { eq } from "drizzle-orm"
import { logger } from "@/lib/logger"

export async function POST(req: NextRequest) {
  let formDataObject: Record<string, string> = {}

  try {
    const contentType = req.headers.get("content-type") || ""
    const isForm = contentType.includes("application/x-www-form-urlencoded") || contentType.includes("multipart/form-data")

    if (isForm) {
      const formData = await req.formData()
      formData.forEach((value, key) => {
        formDataObject[key] = value.toString()
      })
    } else {
      try {
        const json = await req.json() as Record<string, unknown>
        for (const [k, v] of Object.entries(json)) {
          if (typeof v === "string") formDataObject[k] = v
          else if (v != null) formDataObject[k] = String(v)
        }
      } catch {
        return new Response("", { status: 200 })
      }
    }

    const isDev = process.env.NODE_ENV === "development"
    const skipValidation = isDev && process.env.TWILIO_SKIP_VALIDATION === "true"

    if (!skipValidation) {
      const authToken = process.env.TWILIO_AUTH_TOKEN
      const sig = req.headers.get("x-twilio-signature")
      if (!authToken || !sig) {
        logger.warn("whatsapp-status webhook: missing auth or signature")
        return new Response("", { status: 200 })
      }
      const url = new URL(req.url)
      const proto = req.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "")
      const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? url.host
      const publicUrl = `${proto}://${host}${url.pathname}${url.search}`
      if (!validateRequest(authToken, sig, publicUrl, formDataObject)) {
        logger.warn("whatsapp-status webhook: invalid Twilio signature")
        return new Response("Unauthorized", { status: 401 })
      }
    }

    const sid = formDataObject.Sid ?? formDataObject.SenderSid ?? formDataObject.sid
    const statusRaw = formDataObject.Status ?? formDataObject.EventStatus ?? formDataObject.status ?? ""

    if (!sid || typeof sid !== "string") {
      logger.warn({ keys: Object.keys(formDataObject) }, "whatsapp-status webhook: missing Sid/SenderSid")
      return new Response("", { status: 200 })
    }

    const u = statusRaw.toUpperCase()
    let status: "verified" | "pending_verification" | "verifying" | "failed"
    if (u === "ONLINE") status = "verified"
    else if (["PENDING_VERIFICATION", "CREATING"].includes(u)) status = "pending_verification"
    else if (u === "VERIFYING") status = "verifying"
    else status = "failed"

    const all = await db.query.agents.findMany({
      columns: { id: true, whatsappNumber: true },
    })

    for (const a of all) {
      const arr = Array.isArray(a.whatsappNumber) ? a.whatsappNumber : []
      const idx = arr.findIndex((e: { twilioSenderId?: string }) => e?.twilioSenderId === sid)
      if (idx === -1) continue

      const entry = arr[idx] as { phoneNumber?: string; status?: string; twilioSenderId?: string; connectedAt?: string; verifiedAt?: string }
      const updated = [...arr] as typeof entry[]
      updated[idx] = {
        ...entry,
        status,
        ...(status === "verified" ? { verifiedAt: new Date().toISOString() } : {}),
      }

      await db
        .update(agents)
        .set({
          whatsappNumber: entry?.phoneNumber ?? a.whatsappNumber,
          updatedAt: new Date(),
        })
        .where(eq(agents.id, a.id))

      logger.info({ agentId: a.id, sid: sid.slice(0, 10) + "...", status }, "whatsapp-status: agent updated")
      break
    }

    return new Response("", { status: 200 })
  } catch (err) {
    logger.error({ err }, "whatsapp-status webhook error")
    return new Response("", { status: 200 })
  }
}
