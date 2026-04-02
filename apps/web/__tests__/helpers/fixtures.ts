import type { MessageJobData } from "@/lib/queues/message-queue"

export const IDS = {
  salonId: "salon-test-111",
  chatId: "chat-test-222",
  customerId: "cust-test-333",
  messageId: "msg-test-444",
  agentId: "agent-test-555",
}

export function makeJobData(overrides: Partial<MessageJobData> = {}): MessageJobData {
  return {
    messageId: IDS.messageId,
    chatId: IDS.chatId,
    salonId: IDS.salonId,
    agentId: IDS.agentId,
    customerId: IDS.customerId,
    instanceName: "instance-1",
    remoteJid: "5511999999999@s.whatsapp.net",
    addressingMode: "jid",
    clientPhone: "5511999999999",
    body: "Olá, gostaria de agendar",
    hasMedia: false,
    receivedAt: new Date().toISOString(),
    customerName: "Cliente Teste",
    isNewCustomer: false,
    ...overrides,
  }
}

export function makeFakeJob(dataOverrides: Partial<MessageJobData> = {}, jobOverrides: Record<string, unknown> = {}) {
  return {
    data: makeJobData(dataOverrides),
    id: "job-1",
    attemptsMade: 0,
    opts: { attempts: 3 },
    token: "token-123",
    moveToDelayed: vi.fn().mockResolvedValue(undefined),
    ...jobOverrides,
  }
}

// vi precisa ser importado pelo arquivo que usa este helper
import { vi } from "vitest"
