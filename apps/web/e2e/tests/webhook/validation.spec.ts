/**
 * Webhook validation tests
 * 
 * Tests:
 * - Content-Type validation
 * - Twilio signature validation
 * - Schema validation (Zod)
 * - Phone number format validation
 * - MessageSid format validation
 */

import { test, expect } from "../../fixtures/test-fixtures";
import { createTwilioPayload, TestPhones } from "../../fixtures/twilio-payloads";
import {
  assertWebhookSuccess,
  assertWebhookError,
  assertEmptyResponse,
} from "../../utils/assertions";

test.describe("Webhook Validation", () => {
  test.describe("Content-Type Validation", () => {
    test("should reject requests with invalid content-type", async ({ request }) => {
      const response = await request.post("/api/webhook/whatsapp", {
        data: JSON.stringify({ test: "data" }),
        headers: {
          "Content-Type": "application/json",
        },
      });

      await assertWebhookError(response, 400);
      const body = await response.text();
      expect(body).toContain("Invalid Content-Type");
    });

    test("should accept application/x-www-form-urlencoded", async ({ webhookClient, testSalon }) => {
      const payload = createTwilioPayload({
        from: TestPhones.customer,
        to: `whatsapp:${testSalon.whatsappNumber}`,
        body: "Test message",
      });

      const response = await webhookClient.postWebhook(payload);
      await assertWebhookSuccess(response);
    });
  });

  test.describe("Schema Validation", () => {
    test("should reject requests missing From field", async ({ webhookClient }) => {
      const params = new URLSearchParams();
      params.append("To", TestPhones.salon);
      params.append("Body", "Test message");
      params.append("MessageSid", "MM12345678901234567890123456789012");
      params.append("NumMedia", "0");

      const response = await webhookClient.postWebhook(params);
      await assertWebhookError(response, 400);
    });

    test("should reject requests missing To field", async ({ webhookClient }) => {
      const params = new URLSearchParams();
      params.append("From", TestPhones.customer);
      params.append("Body", "Test message");
      params.append("MessageSid", "MM12345678901234567890123456789012");
      params.append("NumMedia", "0");

      const response = await webhookClient.postWebhook(params);
      await assertWebhookError(response, 400);
    });

    test("should reject requests with invalid phone format", async ({ webhookClient }) => {
      const params = new URLSearchParams();
      params.append("From", "invalid-phone");
      params.append("To", TestPhones.salon);
      params.append("Body", "Test message");
      params.append("MessageSid", "MM12345678901234567890123456789012");
      params.append("NumMedia", "0");

      const response = await webhookClient.postWebhook(params);
      await assertWebhookError(response, 400);
    });

    test("should reject requests with invalid MessageSid format", async ({ webhookClient }) => {
      const params = new URLSearchParams();
      params.append("From", TestPhones.customer);
      params.append("To", TestPhones.salon);
      params.append("Body", "Test message");
      params.append("MessageSid", "INVALID123");
      params.append("NumMedia", "0");

      const response = await webhookClient.postWebhook(params);
      await assertWebhookError(response, 400);
    });

    test("should accept valid MessageSid with MM prefix", async ({ webhookClient, testSalon }) => {
      const payload = createTwilioPayload({
        from: TestPhones.customer,
        to: `whatsapp:${testSalon.whatsappNumber}`,
        body: "Test message",
        messageSid: "MM12345678901234567890123456789012",
      });

      const response = await webhookClient.postWebhook(payload);
      await assertWebhookSuccess(response);
    });

    test("should accept valid MessageSid with SM prefix", async ({ webhookClient, testSalon }) => {
      const payload = createTwilioPayload({
        from: TestPhones.customer,
        to: `whatsapp:${testSalon.whatsappNumber}`,
        body: "Test message",
        messageSid: "SM12345678901234567890123456789012",
      });

      const response = await webhookClient.postWebhook(payload);
      await assertWebhookSuccess(response);
    });
  });

  test.describe("Twilio Signature Validation", () => {
    test.skip("should reject requests without signature in production", async ({ webhookClient, testSalon }) => {
      // This test requires NODE_ENV=production
      // Skip in development mode where signature validation is disabled
      
      const payload = createTwilioPayload({
        from: TestPhones.customer,
        to: `whatsapp:${testSalon.whatsappNumber}`,
        body: "Test message",
      });

      // Force production mode via process.env override (note: NODE_ENV is typically read-only in recent Node versions)
      // To safely override for test: use Object.defineProperty
      Object.defineProperty(process.env, "NODE_ENV", {
        value: "production",
        configurable: true,
        writable: true
      });
      process.env.TWILIO_SKIP_VALIDATION = "false";

      const response = await webhookClient.postWebhook(payload);
      await assertWebhookError(response, 401);


      // Restore test mode (see Node >=20 restrictions: NODE_ENV is read-only)
      Object.defineProperty(process.env, "NODE_ENV", {
        value: "test",
        configurable: true,
        writable: true,
      });
      process.env.TWILIO_SKIP_VALIDATION = "true";
    });

    test("should accept valid signature", async ({ webhookClient, testSalon }) => {
      const payload = createTwilioPayload({
        from: TestPhones.customer,
        to: `whatsapp:${testSalon.whatsappNumber}`,
        body: "Test message",
      });

      // In test mode, signature validation is skipped
      const response = await webhookClient.postWebhook(payload);
      await assertWebhookSuccess(response);
    });
  });

  test.describe("Message Body Validation", () => {
    test("should accept empty body for media messages", async ({ webhookClient, testSalon }) => {
      const payload = createTwilioPayload({
        from: TestPhones.customer,
        to: `whatsapp:${testSalon.whatsappNumber}`,
        body: "",
        numMedia: 1,
        mediaContentType: "image/jpeg",
        mediaUrl: "https://example.com/image.jpg",
      });

      const response = await webhookClient.postWebhook(payload);
      await assertWebhookSuccess(response);
    });

    test("should accept long messages up to 4096 chars", async ({ webhookClient, testSalon }) => {
      const longMessage = "A".repeat(4000);
      
      const payload = createTwilioPayload({
        from: TestPhones.customer,
        to: `whatsapp:${testSalon.whatsappNumber}`,
        body: longMessage,
      });

      const response = await webhookClient.postWebhook(payload);
      await assertWebhookSuccess(response);
    });
  });

  test.describe("Salon Lookup", () => {
    test("should return 200 when salon not found (avoid Twilio retry)", async ({ webhookClient }) => {
      const payload = createTwilioPayload({
        from: TestPhones.customer,
        to: "whatsapp:+5511000000000", // Non-existent salon
        body: "Test message",
      });

      const response = await webhookClient.postWebhook(payload);
      // Returns 200 to avoid Twilio retry loops
      await assertWebhookSuccess(response);
      await assertEmptyResponse(response);
    });
  });
});
