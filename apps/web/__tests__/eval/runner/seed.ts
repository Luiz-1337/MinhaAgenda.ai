/**
 * Test-context lifecycle for the eval suite.
 *
 * The eval assumes a salon, agent, professional and service already exist
 * in the DB (created via the normal onboarding flow — see README). What
 * this module does:
 *
 *   - Verifies those IDs exist and resolve correctly.
 *   - Creates a fresh customer + chat for the simulated phone, OR reuses
 *     them after cleanup.
 *   - Cleans up appointments/messages/chats created during a run.
 *
 * It NEVER deletes salons, professionals, services or agents.
 */

import {
  db,
  appointments,
  chats,
  customers,
  messages,
  professionals,
  services,
  salons,
  agents,
  and,
  eq,
  inArray,
} from "@repo/db"
import type { EvalEnv } from "./env"

export interface EvalSeed {
  env: EvalEnv
  agentId: string
  customerId: string
  chatId: string
}

async function ensureFixturesExist(env: EvalEnv): Promise<{ agentId: string }> {
  const salon = await db.query.salons.findFirst({
    where: eq(salons.id, env.salonId),
    columns: { id: true, subscriptionStatus: true },
  })
  if (!salon) {
    throw new Error(`EVAL_SALON_ID=${env.salonId} not found`)
  }
  if (salon.subscriptionStatus === "CANCELED") {
    throw new Error(
      `EVAL_SALON_ID=${env.salonId} has subscriptionStatus=CANCELED — the bot will refuse to respond. Use an ACTIVE/TRIAL salon.`
    )
  }

  const prof = await db.query.professionals.findFirst({
    where: and(
      eq(professionals.id, env.professionalId),
      eq(professionals.salonId, env.salonId)
    ),
    columns: { id: true, isActive: true },
  })
  if (!prof) {
    throw new Error(
      `EVAL_PROFESSIONAL_ID=${env.professionalId} not found in salon ${env.salonId}`
    )
  }
  if (!prof.isActive) {
    throw new Error(`EVAL_PROFESSIONAL_ID=${env.professionalId} is inactive`)
  }

  const svc = await db.query.services.findFirst({
    where: and(
      eq(services.id, env.serviceId),
      eq(services.salonId, env.salonId)
    ),
    columns: { id: true, isActive: true },
  })
  if (!svc) {
    throw new Error(
      `EVAL_SERVICE_ID=${env.serviceId} not found in salon ${env.salonId}`
    )
  }
  if (!svc.isActive) {
    throw new Error(`EVAL_SERVICE_ID=${env.serviceId} is inactive`)
  }

  const agent = await db.query.agents.findFirst({
    where: and(eq(agents.salonId, env.salonId), eq(agents.isActive, true)),
    columns: { id: true },
  })
  if (!agent) {
    throw new Error(
      `No active agent for salon ${env.salonId}. Create one via the panel first.`
    )
  }

  return { agentId: agent.id }
}

/**
 * Resolves (or recreates) the test customer + chat. Returns identifiers
 * needed to run a conversation.
 */
export async function prepareConversationContext(
  env: EvalEnv,
  customerName: string | null
): Promise<EvalSeed> {
  const { agentId } = await ensureFixturesExist(env)

  // Normalize phone to digits-only for the customers.phone column (per chat.service convention).
  const normalizedPhone = env.clientPhone.replace(/\D/g, "")
  const customerDisplayName =
    customerName?.trim() || "Cliente Eval"

  // Upsert customer
  let customer = await db.query.customers.findFirst({
    where: and(
      eq(customers.salonId, env.salonId),
      eq(customers.phone, normalizedPhone)
    ),
    columns: { id: true, name: true },
  })
  if (!customer) {
    await db
      .insert(customers)
      .values({
        salonId: env.salonId,
        phone: normalizedPhone,
        name: customerDisplayName,
      })
      .onConflictDoNothing({ target: [customers.salonId, customers.phone] })
    customer = await db.query.customers.findFirst({
      where: and(
        eq(customers.salonId, env.salonId),
        eq(customers.phone, normalizedPhone)
      ),
      columns: { id: true, name: true },
    })
  } else if (customer.name !== customerDisplayName) {
    await db
      .update(customers)
      .set({ name: customerDisplayName, updatedAt: new Date() })
      .where(eq(customers.id, customer.id))
  }
  if (!customer) {
    throw new Error("Failed to create/find eval customer")
  }

  // Active chat for the conversation. Force a fresh one each run by closing
  // any existing active chat first.
  await db
    .update(chats)
    .set({ status: "completed", updatedAt: new Date() })
    .where(
      and(
        eq(chats.salonId, env.salonId),
        eq(chats.clientPhone, env.clientPhone),
        eq(chats.status, "active")
      )
    )

  const [newChat] = await db
    .insert(chats)
    .values({
      salonId: env.salonId,
      clientPhone: env.clientPhone,
      status: "active",
      agentId,
    })
    .returning({ id: chats.id })

  if (!newChat) {
    throw new Error("Failed to create eval chat")
  }

  return {
    env,
    agentId,
    customerId: customer.id,
    chatId: newChat.id,
  }
}

/**
 * Removes everything the eval created for this seed: messages, the chat,
 * and any appointments booked during the conversation. Idempotent.
 */
export async function cleanupConversationContext(seed: EvalSeed): Promise<void> {
  // Delete appointments for this customer in this salon (safety net — only
  // appointments created during eval will exist for the eval phone).
  await db
    .delete(appointments)
    .where(
      and(
        eq(appointments.salonId, seed.env.salonId),
        eq(appointments.clientId, seed.customerId)
      )
    )

  // Delete messages of the chat
  await db.delete(messages).where(eq(messages.chatId, seed.chatId))

  // Delete the chat itself
  await db.delete(chats).where(eq(chats.id, seed.chatId))

  // Also sweep any other chats this eval phone may have left behind
  const stragglers = await db.query.chats.findMany({
    where: and(
      eq(chats.salonId, seed.env.salonId),
      eq(chats.clientPhone, seed.env.clientPhone)
    ),
    columns: { id: true },
  })
  if (stragglers.length > 0) {
    const ids = stragglers.map((c) => c.id)
    await db.delete(messages).where(inArray(messages.chatId, ids))
    await db.delete(chats).where(inArray(chats.id, ids))
  }
}
