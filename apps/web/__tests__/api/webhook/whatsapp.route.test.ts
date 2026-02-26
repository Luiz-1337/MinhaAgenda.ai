import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  redis: {
    isMessageProcessed: vi.fn(),
    markMessageProcessed: vi.fn(),
    resolveLidToPhone: vi.fn(),
    storeLidMapping: vi.fn(),
  },
  queue: {
    enqueueMessage: vi.fn(),
  },
  chat: {
    findOrCreateChat: vi.fn(),
    findOrCreateCustomer: vi.fn(),
    saveMessage: vi.fn(),
  },
  rateLimit: {
    checkPhoneRateLimit: vi.fn(),
  },
  ai: {
    checkIfNewCustomer: vi.fn(),
  },
  db: {
    query: {
      salons: { findFirst: vi.fn() },
      agents: { findFirst: vi.fn() },
    },
  },
}));

vi.mock('@/lib/redis', () => mocks.redis);
vi.mock('@/lib/queues/message-queue', () => mocks.queue);
vi.mock('@/lib/services/chat.service', () => mocks.chat);
vi.mock('@/lib/rate-limit', () => mocks.rateLimit);
vi.mock('@/lib/services/ai/generate-response.service', () => mocks.ai);
vi.mock('@/lib/services/evolution-instance.service', () => ({
  getConnectedPhoneNumber: vi.fn(),
}));
vi.mock('@/lib/metrics', () => ({
  WebhookMetrics: {
    received: vi.fn(),
    enqueued: vi.fn(),
    duplicate: vi.fn(),
    rateLimited: vi.fn(),
    error: vi.fn(),
    latency: vi.fn(),
    connectionUpdate: vi.fn(),
    connectionAnomaly: vi.fn(),
  },
}));
vi.mock('@repo/db', () => ({
  db: mocks.db,
  salons: {},
  chats: {},
  chatStatusEnum: {},
  messages: {},
  agents: {},
  eq: vi.fn((...args: unknown[]) => args),
  and: vi.fn((...args: unknown[]) => args),
  desc: vi.fn(),
  sql: vi.fn(),
}));

import { POST } from '@/app/api/webhook/whatsapp/route';

describe('POST /api/webhook/whatsapp - LID addressing', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.redis.isMessageProcessed.mockResolvedValue(false);
    mocks.redis.markMessageProcessed.mockResolvedValue(undefined);
    mocks.redis.resolveLidToPhone.mockResolvedValue(null);
    mocks.redis.storeLidMapping.mockResolvedValue(undefined);

    mocks.rateLimit.checkPhoneRateLimit.mockResolvedValue(undefined);
    mocks.chat.findOrCreateCustomer.mockResolvedValue({ id: 'customer-1', name: 'Cliente Teste' });
    mocks.chat.findOrCreateChat.mockResolvedValue({ id: 'chat-1' });
    mocks.chat.saveMessage.mockResolvedValue(undefined);
    mocks.ai.checkIfNewCustomer.mockResolvedValue(false);

    mocks.queue.enqueueMessage.mockResolvedValue({ id: 'job-1' });

    mocks.db.query.salons.findFirst.mockResolvedValue({ id: 'salon-1' });
    mocks.db.query.agents.findFirst.mockResolvedValue({ id: 'agent-1' });
  });

  it('keeps replyToJid as remoteJid and resolves clientPhone from remoteJidAlt', async () => {
    const payload = {
      event: 'messages.upsert',
      instance: 'instance-test',
      data: {
        key: {
          fromMe: false,
          id: 'msg-1',
          remoteJid: '269700000000000@lid',
          remoteJidAlt: '5511999999999@s.whatsapp.net',
        },
        message: {
          conversation: 'Oi',
        },
        messageType: 'conversation',
        messageTimestamp: 1700000000,
        pushName: 'Cliente',
      },
    };

    const req = new NextRequest('http://localhost/api/webhook/whatsapp', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const response = await POST(req);

    expect(response.status).toBe(200);
    expect(mocks.redis.storeLidMapping).toHaveBeenCalledWith(
      '269700000000000',
      '5511999999999@s.whatsapp.net',
      'instance-test'
    );

    expect(mocks.queue.enqueueMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        replyToJid: '269700000000000@lid',
        clientPhone: '5511999999999',
        remoteJid: '269700000000000@lid',
        remoteJidAlt: '5511999999999@s.whatsapp.net',
        addressingMode: 'lid',
        instanceName: 'instance-test',
      })
    );
  });
});
