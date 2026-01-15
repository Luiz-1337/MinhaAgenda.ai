import { db, chats, messages, sql } from '../index'

export interface LimboChat {
  chatId: string
  clientPhone: string
  lastBotMessageAt: Date
}

export async function detectLimboChats(
  timeoutDays: number,
  salonId?: string
): Promise<LimboChat[]> {
  if (!Number.isFinite(timeoutDays) || timeoutDays <= 0) {
    return []
  }

  const salonClause = salonId ? sql`and ${chats.salonId} = ${salonId}` : sql``

  const result = await db.execute(sql`
    select
      ${chats.id} as chat_id,
      ${chats.clientPhone} as client_phone,
      max(${messages.createdAt}) as last_bot_message_at
    from ${chats}
    inner join ${messages}
      on ${messages.chatId} = ${chats.id}
    where ${chats.lastBotMessageRequiresResponse} = true
      and ${messages.role} = 'assistant'
      and ${messages.requiresResponse} = true
      ${salonClause}
    group by ${chats.id}, ${chats.clientPhone}
    having max(${messages.createdAt}) <= now() - (${timeoutDays}::text || ' days')::interval
  `)

  return result.map((row) => ({
    chatId: String(row.chat_id),
    clientPhone: String(row.client_phone),
    lastBotMessageAt: new Date(String(row.last_bot_message_at)),
  }))
}
