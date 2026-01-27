/**
 * Testes do webhook do WhatsApp
 * 
 * Cobre:
 * - Validação de content-type
 * - Validação de schema
 * - Idempotência
 * - Rate limiting
 * - Enfileiramento de mensagens
 */

import { describe, it, expect, beforeEach, afterEach, vi, MockedFunction } from "vitest";
import { NextRequest } from "next/server";

// Mocks
vi.mock("@/lib/redis", () => ({
  isMessageProcessed: vi.fn(),
  markMessageProcessed: vi.fn(),
  getRedisClient: vi.fn(() => ({
    incr: vi.fn().mockResolvedValue(1),
    expire: vi.fn().mockResolvedValue(1),
    ttl: vi.fn().mockResolvedValue(60),
    exists: vi.fn().mockResolvedValue(0),
    setex: vi.fn().mockResolvedValue("OK"),
  })),
}));

vi.mock("@/lib/queues/message-queue", () => ({
  enqueueMessage: vi.fn().mockResolvedValue({ id: "job-123" }),
  getMessageQueue: vi.fn(),
}));

vi.mock("@/lib/services/salon.service", () => ({
  getSalonIdByWhatsapp: vi.fn(),
}));

vi.mock("@/lib/services/chat.service", () => ({
  findOrCreateChat: vi.fn().mockResolvedValue({ id: "chat-123" }),
  findOrCreateCustomer: vi.fn().mockResolvedValue({ id: "customer-123", name: "Test User" }),
  saveMessage: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/services/whatsapp.service", () => ({
  normalizePhoneNumber: vi.fn((phone: string) => phone.replace("whatsapp:", "")),
}));

vi.mock("@/lib/services/ai/generate-response.service", () => ({
  checkIfNewCustomer: vi.fn().mockResolvedValue(true),
}));

vi.mock("twilio", () => ({
  validateRequest: vi.fn(),
}));

// Import após os mocks
import { POST } from "@/app/api/webhook/whatsapp/route";
import { isMessageProcessed, markMessageProcessed } from "@/lib/redis";
import { enqueueMessage } from "@/lib/queues/message-queue";
import { getSalonIdByWhatsapp } from "@/lib/services/salon.service";
import { validateRequest } from "twilio";

describe("POST /api/webhook/whatsapp", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Setup padrão
    (getSalonIdByWhatsapp as MockedFunction<typeof getSalonIdByWhatsapp>).mockResolvedValue("salon-123");
    (isMessageProcessed as MockedFunction<typeof isMessageProcessed>).mockResolvedValue(false);
    (validateRequest as MockedFunction<typeof validateRequest>).mockReturnValue(true);
    
    // Skip validation em testes
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("TWILIO_SKIP_VALIDATION", "true");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  /**
   * Helper para criar FormData
   */
  function createFormData(data: Record<string, string>): FormData {
    const formData = new FormData();
    Object.entries(data).forEach(([key, value]) => {
      formData.append(key, value);
    });
    return formData;
  }

  /**
   * Helper para criar Request
   */
  function createRequest(formData: FormData, options?: Omit<RequestInit, 'signal'>): NextRequest {
    return new NextRequest("http://localhost:3000/api/webhook/whatsapp", {
      method: "POST",
      body: formData,
      ...options,
    });
  }

  describe("Content-Type Validation", () => {
    it("should reject invalid content-type", async () => {
      const req = new NextRequest("http://localhost:3000/api/webhook/whatsapp", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      });

      const response = await POST(req);
      expect(response.status).toBe(400);
      expect(await response.text()).toBe("Invalid Content-Type");
    });

    it("should accept application/x-www-form-urlencoded", async () => {
      const formData = createFormData({
        From: "whatsapp:+5511999999999",
        To: "whatsapp:+5511888888888",
        Body: "Hello",
        MessageSid: "MM12345678901234567890123456789012",
        NumMedia: "0",
      });

      const req = createRequest(formData);
      const response = await POST(req);
      expect(response.status).toBe(200);
    });
  });

  describe("Schema Validation", () => {
    it("should reject missing From field", async () => {
      const formData = createFormData({
        To: "whatsapp:+5511888888888",
        Body: "Hello",
        MessageSid: "MM12345678901234567890123456789012",
        NumMedia: "0",
      });

      const req = createRequest(formData);
      const response = await POST(req);
      expect(response.status).toBe(400);
    });

    it("should reject invalid phone format", async () => {
      const formData = createFormData({
        From: "invalid-phone",
        To: "whatsapp:+5511888888888",
        Body: "Hello",
        MessageSid: "MM12345678901234567890123456789012",
        NumMedia: "0",
      });

      const req = createRequest(formData);
      const response = await POST(req);
      expect(response.status).toBe(400);
    });

    it("should reject invalid MessageSid format", async () => {
      const formData = createFormData({
        From: "whatsapp:+5511999999999",
        To: "whatsapp:+5511888888888",
        Body: "Hello",
        MessageSid: "invalid-sid",
        NumMedia: "0",
      });

      const req = createRequest(formData);
      const response = await POST(req);
      expect(response.status).toBe(400);
    });
  });

  describe("Idempotency", () => {
    it("should skip duplicate messages", async () => {
      (isMessageProcessed as MockedFunction<typeof isMessageProcessed>).mockResolvedValue(true);

      const formData = createFormData({
        From: "whatsapp:+5511999999999",
        To: "whatsapp:+5511888888888",
        Body: "Hello",
        MessageSid: "MM12345678901234567890123456789012",
        NumMedia: "0",
      });

      const req = createRequest(formData);
      const response = await POST(req);

      expect(response.status).toBe(200);
      expect(enqueueMessage).not.toHaveBeenCalled();
    });

    it("should mark message as processed after enqueuing", async () => {
      const formData = createFormData({
        From: "whatsapp:+5511999999999",
        To: "whatsapp:+5511888888888",
        Body: "Hello",
        MessageSid: "MM12345678901234567890123456789012",
        NumMedia: "0",
      });

      const req = createRequest(formData);
      await POST(req);

      expect(markMessageProcessed).toHaveBeenCalledWith("MM12345678901234567890123456789012");
    });
  });

  describe("Salon Lookup", () => {
    it("should return 200 when salon not found (avoid Twilio retry)", async () => {
      (getSalonIdByWhatsapp as MockedFunction<typeof getSalonIdByWhatsapp>).mockResolvedValue(null);

      const formData = createFormData({
        From: "whatsapp:+5511999999999",
        To: "whatsapp:+5511888888888",
        Body: "Hello",
        MessageSid: "MM12345678901234567890123456789012",
        NumMedia: "0",
      });

      const req = createRequest(formData);
      const response = await POST(req);

      expect(response.status).toBe(200);
      expect(enqueueMessage).not.toHaveBeenCalled();
    });
  });

  describe("Message Enqueuing", () => {
    it("should enqueue valid text messages", async () => {
      const formData = createFormData({
        From: "whatsapp:+5511999999999",
        To: "whatsapp:+5511888888888",
        Body: "Test message",
        MessageSid: "MM12345678901234567890123456789012",
        NumMedia: "0",
      });

      const req = createRequest(formData);
      const response = await POST(req);

      expect(response.status).toBe(200);
      expect(enqueueMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          messageId: "MM12345678901234567890123456789012",
          body: "Test message",
          hasMedia: false,
          salonId: "salon-123",
        })
      );
    });

    it("should enqueue media messages with correct type", async () => {
      const formData = createFormData({
        From: "whatsapp:+5511999999999",
        To: "whatsapp:+5511888888888",
        Body: "",
        MessageSid: "MM12345678901234567890123456789012",
        NumMedia: "1",
        MediaContentType0: "image/jpeg",
        MediaUrl0: "https://example.com/image.jpg",
      });

      const req = createRequest(formData);
      const response = await POST(req);

      expect(response.status).toBe(200);
      expect(enqueueMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          hasMedia: true,
          mediaType: "image",
        })
      );
    });
  });

  describe("Twilio Signature Validation", () => {
    it("should reject invalid signature in production", async () => {
      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv("TWILIO_AUTH_TOKEN", "test-token");
      vi.stubEnv("TWILIO_SKIP_VALIDATION", "false");
      (validateRequest as MockedFunction<typeof validateRequest>).mockReturnValue(false);

      const formData = createFormData({
        From: "whatsapp:+5511999999999",
        To: "whatsapp:+5511888888888",
        Body: "Hello",
        MessageSid: "MM12345678901234567890123456789012",
        NumMedia: "0",
      });

      const req = new NextRequest("http://localhost/api/webhook/whatsapp", {
        method: "POST",
        body: formData,
        headers: {
          "x-twilio-signature": "invalid-signature",
        },
      });

      const response = await POST(req);
      expect(response.status).toBe(401);
    });

    it("should skip validation in development with flag", async () => {
      vi.stubEnv("NODE_ENV", "development");
      vi.stubEnv("TWILIO_SKIP_VALIDATION", "true");

      const formData = createFormData({
        From: "whatsapp:+5511999999999",
        To: "whatsapp:+5511888888888",
        Body: "Hello",
        MessageSid: "MM12345678901234567890123456789012",
        NumMedia: "0",
      });

      const req = createRequest(formData);
      const response = await POST(req);

      expect(response.status).toBe(200);
      expect(validateRequest).not.toHaveBeenCalled();
    });
  });

  describe("Error Handling", () => {
    it("should return 500 for retryable errors", async () => {
      (enqueueMessage as MockedFunction<typeof enqueueMessage>).mockRejectedValue(
        new Error("Redis connection failed")
      );

      const formData = createFormData({
        From: "whatsapp:+5511999999999",
        To: "whatsapp:+5511888888888",
        Body: "Hello",
        MessageSid: "MM12345678901234567890123456789012",
        NumMedia: "0",
      });

      const req = createRequest(formData);
      const response = await POST(req);

      expect(response.status).toBe(500);
    });
  });
});

describe("Webhook Edge Cases", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getSalonIdByWhatsapp as MockedFunction<typeof getSalonIdByWhatsapp>).mockResolvedValue("salon-123");
    (isMessageProcessed as MockedFunction<typeof isMessageProcessed>).mockResolvedValue(false);
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("TWILIO_SKIP_VALIDATION", "true");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  function createFormData(data: Record<string, string>): FormData {
    const formData = new FormData();
    Object.entries(data).forEach(([key, value]) => {
      formData.append(key, value);
    });
    return formData;
  }

  it("should handle empty body for text messages", async () => {
    const formData = createFormData({
      From: "whatsapp:+5511999999999",
      To: "whatsapp:+5511888888888",
      Body: "",
      MessageSid: "MM12345678901234567890123456789012",
      NumMedia: "0",
    });

    const req = new NextRequest("http://localhost/api/webhook/whatsapp", {
      method: "POST",
      body: formData,
    });

    const response = await POST(req);
    expect(response.status).toBe(200);
  });

  it("should handle long messages", async () => {
    const longMessage = "A".repeat(4000);
    
    const formData = createFormData({
      From: "whatsapp:+5511999999999",
      To: "whatsapp:+5511888888888",
      Body: longMessage,
      MessageSid: "MM12345678901234567890123456789012",
      NumMedia: "0",
    });

    const req = new NextRequest("http://localhost/api/webhook/whatsapp", {
      method: "POST",
      body: formData,
    });

    const response = await POST(req);
    expect(response.status).toBe(200);
    expect(enqueueMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        body: longMessage,
      })
    );
  });

  it("should handle multiple media items", async () => {
    const formData = createFormData({
      From: "whatsapp:+5511999999999",
      To: "whatsapp:+5511888888888",
      Body: "",
      MessageSid: "MM12345678901234567890123456789012",
      NumMedia: "3",
      MediaContentType0: "image/jpeg",
      MediaUrl0: "https://example.com/image1.jpg",
      MediaContentType1: "image/png",
      MediaUrl1: "https://example.com/image2.png",
      MediaContentType2: "audio/ogg",
      MediaUrl2: "https://example.com/audio.ogg",
    });

    const req = new NextRequest("http://localhost/api/webhook/whatsapp", {
      method: "POST",
      body: formData,
    });

    const response = await POST(req);
    expect(response.status).toBe(200);
    expect(enqueueMessage).toHaveBeenCalled();
  });
});
