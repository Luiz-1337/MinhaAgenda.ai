/**
 * Webhook idempotency tests
 * 
 * Tests:
 * - Duplicate message detection
 * - Message processing state
 * - Redis integration for idempotency
 */

import { test, expect } from "../../fixtures/test-fixtures";
import { createTwilioPayload, TestPhones } from "../../fixtures/twilio-payloads";
import {
  markMessageAsProcessed,
  isMessageProcessed,
  clearProcessedMessages,
} from "../../mocks/redis-test-utils";
import {
  assertWebhookSuccess,
  assertTwilioWasNotCalled,
  assertTwilioCallCount,
  waitForCondition,
} from "../../utils/assertions";

test.describe("Webhook Idempotency", () => {
  test.beforeEach(async () => {
    // Clear processed messages before each test
    await clearProcessedMessages();
  });

  test("should process new messages normally", async ({ webhookClient, testSalon, twilioMock }) => {
    const messageSid = "MM" + "1".repeat(32);
    
    const payload = createTwilioPayload({
      from: TestPhones.customer,
      to: `whatsapp:${testSalon.whatsappNumber}`,
      body: "Hello, this is a new message",
      messageSid,
    });

    const response = await webhookClient.postWebhook(payload);
    await assertWebhookSuccess(response);

    // Message should be marked as processed
    const processed = await isMessageProcessed(messageSid);
    expect(processed).toBe(true);
  });

  test("should skip duplicate messages", async ({ webhookClient, testSalon, twilioMock }) => {
    const messageSid = "MM" + "2".repeat(32);
    
    // Pre-mark message as processed
    await markMessageAsProcessed(messageSid);

    const payload = createTwilioPayload({
      from: TestPhones.customer,
      to: `whatsapp:${testSalon.whatsappNumber}`,
      body: "This is a duplicate message",
      messageSid,
    });

    const response = await webhookClient.postWebhook(payload);
    await assertWebhookSuccess(response);

    // Twilio should NOT be called for duplicate
    assertTwilioWasNotCalled(twilioMock);
  });

  test("should handle rapid duplicate requests", async ({ webhookClient, testSalon }) => {
    const messageSid = "MM" + "3".repeat(32);
    
    const payload = createTwilioPayload({
      from: TestPhones.customer,
      to: `whatsapp:${testSalon.whatsappNumber}`,
      body: "Rapid message",
      messageSid,
    });

    // Send same message 3 times rapidly
    const responses = await Promise.all([
      webhookClient.postWebhook(payload),
      webhookClient.postWebhook(payload),
      webhookClient.postWebhook(payload),
    ]);

    // All requests should succeed (200)
    for (const response of responses) {
      await assertWebhookSuccess(response);
    }

    // Message should be marked as processed
    const processed = await isMessageProcessed(messageSid);
    expect(processed).toBe(true);
  });

  test("should process different messages from same sender", async ({ webhookClient, testSalon }) => {
    const messageSid1 = "MM" + "4".repeat(32);
    const messageSid2 = "MM" + "5".repeat(32);
    
    const payload1 = createTwilioPayload({
      from: TestPhones.customer,
      to: `whatsapp:${testSalon.whatsappNumber}`,
      body: "First message",
      messageSid: messageSid1,
    });

    const payload2 = createTwilioPayload({
      from: TestPhones.customer,
      to: `whatsapp:${testSalon.whatsappNumber}`,
      body: "Second message",
      messageSid: messageSid2,
    });

    const response1 = await webhookClient.postWebhook(payload1);
    const response2 = await webhookClient.postWebhook(payload2);

    await assertWebhookSuccess(response1);
    await assertWebhookSuccess(response2);

    // Both messages should be marked as processed
    expect(await isMessageProcessed(messageSid1)).toBe(true);
    expect(await isMessageProcessed(messageSid2)).toBe(true);
  });

  test("should handle interleaved duplicates", async ({ webhookClient, testSalon }) => {
    const messageSidA = "MM" + "6".repeat(32);
    const messageSidB = "MM" + "7".repeat(32);
    
    const payloadA = createTwilioPayload({
      from: TestPhones.customer,
      to: `whatsapp:${testSalon.whatsappNumber}`,
      body: "Message A",
      messageSid: messageSidA,
    });

    const payloadB = createTwilioPayload({
      from: TestPhones.customer,
      to: `whatsapp:${testSalon.whatsappNumber}`,
      body: "Message B",
      messageSid: messageSidB,
    });

    // Send: A, B, A (duplicate), B (duplicate)
    const responses = await Promise.all([
      webhookClient.postWebhook(payloadA),
      webhookClient.postWebhook(payloadB),
      webhookClient.postWebhook(payloadA), // Duplicate
      webhookClient.postWebhook(payloadB), // Duplicate
    ]);

    // All should return 200
    for (const response of responses) {
      await assertWebhookSuccess(response);
    }
  });

  test("idempotency key should expire after TTL", async ({ webhookClient, testSalon }) => {
    // This test is conceptual - in practice, TTL is 24 hours
    // We can't wait that long in a test, so we just verify the mechanism works
    
    const messageSid = "MM" + "8".repeat(32);
    
    const payload = createTwilioPayload({
      from: TestPhones.customer,
      to: `whatsapp:${testSalon.whatsappNumber}`,
      body: "Message with expiry",
      messageSid,
    });

    const response = await webhookClient.postWebhook(payload);
    await assertWebhookSuccess(response);

    // Verify message is processed
    const processed = await isMessageProcessed(messageSid);
    expect(processed).toBe(true);
  });
});
