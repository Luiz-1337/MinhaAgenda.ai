import {
  and,
  campaigns,
  campaignMessages,
  chats,
  db,
  eq,
  messages,
  recoveryFlows,
  recoverySteps,
  sql,
} from '../index'

export interface MarketingDispatcherResult {
  queuedCount: number
  sentCount: number
  failedCount: number
}

export type SendMarketingMessage = (
  to: string,
  body: string,
  salonId: string
) => Promise<void>

function normalizeToE164(phone: string): string | null {
  const cleaned = phone.trim().replace(/^whatsapp:/i, '')
  if (cleaned.startsWith('+')) {
    return cleaned
  }

  const digits = cleaned.replace(/\D/g, '')
  if (!digits) {
    return null
  }

  if (digits.length >= 12 && digits.startsWith('55')) {
    return `+${digits}`
  }

  if (digits.length >= 10 && digits.length <= 11) {
    return `+55${digits}`
  }

  return null
}

async function ensureRecoveryCampaign(flow: typeof recoveryFlows.$inferSelect): Promise<string> {
  const existing = await db.execute(sql`
    select ${campaigns.id} as id
    from ${campaigns}
    where ${campaigns.salonId} = ${flow.salonId}
      and (${campaigns.segmentationCriteria} ->> 'recovery_flow_id') = ${flow.id}
    limit 1
  `)

  const existingId = existing[0]?.id
  if (existingId) {
    return String(existingId)
  }

  const [created] = await db
    .insert(campaigns)
    .values({
      salonId: flow.salonId,
      name: `Recovery Flow: ${flow.name}`,
      description: 'Auto-generated recovery campaign',
      status: 'active',
      segmentationCriteria: { recovery_flow_id: flow.id },
      startsAt: new Date(),
    })
    .returning({ id: campaigns.id })

  return created.id
}

async function getEligibleChats(
  salonId: string,
  daysAfterInactivity: number
): Promise<Array<{ chatId: string; clientPhone: string; lastUserMessageAt: Date }>> {
  const result = await db.execute(sql`
    select
      ${chats.id} as chat_id,
      ${chats.clientPhone} as client_phone,
      max(${messages.createdAt}) as last_user_message_at
    from ${chats}
    inner join ${messages}
      on ${messages.chatId} = ${chats.id}
    where ${chats.salonId} = ${salonId}
      and ${messages.role} = 'user'
    group by ${chats.id}, ${chats.clientPhone}
    having max(${messages.createdAt}) <= now() - (${daysAfterInactivity}::text || ' days')::interval
  `)

  return result.map((row) => ({
    chatId: String(row.chat_id),
    clientPhone: String(row.client_phone),
    lastUserMessageAt: new Date(String(row.last_user_message_at)),
  }))
}

export async function enqueueRecoveryMessages(): Promise<number> {
  const flows = await db.query.recoveryFlows.findMany({
    where: eq(recoveryFlows.isActive, true),
  })

  let queuedCount = 0

  for (const flow of flows) {
    const steps = await db.query.recoverySteps.findMany({
      where: and(eq(recoverySteps.recoveryFlowId, flow.id), eq(recoverySteps.isActive, true)),
      orderBy: recoverySteps.stepOrder,
    })

    if (!steps.length) {
      continue
    }

    const campaignId = await ensureRecoveryCampaign(flow)

    for (const step of steps) {
      const eligibleChats = await getEligibleChats(flow.salonId, step.daysAfterInactivity)
      if (!eligibleChats.length) {
        continue
      }

      for (const chat of eligibleChats) {
        const phoneNumber = normalizeToE164(chat.clientPhone)
        if (!phoneNumber) {
          continue
        }

        const existing = await db.query.campaignMessages.findFirst({
          where: and(
            eq(campaignMessages.campaignId, campaignId),
            eq(campaignMessages.phoneNumber, phoneNumber),
            eq(campaignMessages.messageSent, step.messageTemplate)
          ),
          columns: { id: true },
        })

        if (existing) {
          continue
        }

        const scheduledAt = new Date(
          chat.lastUserMessageAt.getTime() + step.daysAfterInactivity * 24 * 60 * 60 * 1000
        )

        await db.insert(campaignMessages).values({
          campaignId,
          phoneNumber,
          messageSent: step.messageTemplate,
          status: 'pending',
          sentAt: scheduledAt,
        })

        queuedCount += 1
      }
    }
  }

  return queuedCount
}

export async function dispatchPendingMessages(
  sendMessage: SendMarketingMessage,
  limit = 100
): Promise<{ sentCount: number; failedCount: number }> {
  const pending = await db.execute(sql`
    select
      cm.id as id,
      cm.phone_number as phone_number,
      cm.message_sent as message_sent,
      cm.campaign_id as campaign_id,
      c.salon_id as salon_id
    from ${campaignMessages} cm
    inner join ${campaigns} c on c.id = cm.campaign_id
    where cm.status = 'pending'
      and cm.sent_at <= now()
    order by cm.sent_at asc
    limit ${limit}
  `)

  let sentCount = 0
  let failedCount = 0

  for (const row of pending) {
    const messageId = String(row.id)
    const phoneNumber = String(row.phone_number)
    const messageSent = String(row.message_sent)
    const salonId = String(row.salon_id)

    try {
      await sendMessage(phoneNumber, messageSent, salonId)
      await db
        .update(campaignMessages)
        .set({ status: 'sent', sentAt: new Date() })
        .where(eq(campaignMessages.id, messageId))

      await db
        .update(campaigns)
        .set({ sentCount: sql`${campaigns.sentCount} + 1` })
        .where(eq(campaigns.id, String(row.campaign_id)))

      sentCount += 1
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      await db
        .update(campaignMessages)
        .set({ status: 'failed', errorMessage })
        .where(eq(campaignMessages.id, messageId))

      failedCount += 1
    }
  }

  return { sentCount, failedCount }
}

export async function runMarketingDispatcher(
  sendMessage: SendMarketingMessage
): Promise<MarketingDispatcherResult> {
  const queuedCount = await enqueueRecoveryMessages()
  const { sentCount, failedCount } = await dispatchPendingMessages(sendMessage)

  return { queuedCount, sentCount, failedCount }
}
