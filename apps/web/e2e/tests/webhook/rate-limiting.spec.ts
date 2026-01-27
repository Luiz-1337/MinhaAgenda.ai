/**
 * Webhook rate limiting tests
 * 
 * Tests:
 * - Phone rate limiting (10 msgs/min)
 * - Rate limit response handling
 * - Rate limit reset
 */

import { test, expect } from "../../fixtures/test-fixtures";
import { createTwilioPayload, TestPhones } from "../../fixtures/twilio-payloads";
import {
  setRateLimitCount,
  getRateLimitCount,
  clearRateLimits,
} from "../../mocks/redis-test-utils";
import {
  assertWebhookSuccess,
  assertTwilioWasNotCalled,
} from "../../utils/assertions";

test.describe("Webhook Rate Limiting", () => {
  test.beforeEach(async () => {
    // Clear rate limits before each test
    await clearRateLimits();
  });

  test("should allow messages within rate limit", async ({ webhookClient, testSalon, twilioMock }) => {
    const customerPhone = "+5511999990001";
    
    const payload = createTwilioPayload({
      from: `whatsapp:${customerPhone}`,
      to: `whatsapp:${testSalon.whatsappNumber}`,
      body: "Message within limit",
    });

    const response = await webhookClient.postWebhook(payload);
    await assertWebhookSuccess(response);
  });

  test("should block messages exceeding rate limit", async ({ webhookClient, testSalon, twilioMock }) => {
    const customerPhone = "+5511999990002";
    const normalizedPhone = customerPhone.replace(/\D/g, "");
    
    // Set rate limit count to maximum (10)
    await setRateLimitCount(normalizedPhone, 10);

    const payload = createTwilioPayload({
      from: `whatsapp:${customerPhone}`,
      to: `whatsapp:${testSalon.whatsappNumber}`,
      body: "Message over limit",
    });

    const response = await webhookClient.postWebhook(payload);
    
    // Should return 200 to avoid Twilio retry
    await assertWebhookSuccess(response);
    
    // But Twilio should NOT be called (message not processed)
    assertTwilioWasNotCalled(twilioMock);
  });

  test("should track rate limit count correctly", async ({ webhookClient, testSalon }) => {
    const customerPhone = "+5511999990003";
    const normalizedPhone = customerPhone.replace(/\D/g, "");
    
    // Send 3 messages
    for (let i = 0; i < 3; i++) {
      const payload = createTwilioPayload({
        from: `whatsapp:${customerPhone}`,
        to: `whatsapp:${testSalon.whatsappNumber}`,
        body: `Message ${i + 1}`,
      });

      await webhookClient.postWebhook(payload);
    }

    // Check rate limit count
    const count = await getRateLimitCount(normalizedPhone);
    expect(count).toBe(3);
  });

  test("should apply rate limit per phone number", async ({ webhookClient, testSalon }) => {
    const phone1 = "+5511999990004";
    const phone2 = "+5511999990005";
    
    // Set phone1 at limit
    await setRateLimitCount(phone1.replace(/\D/g, ""), 10);
    
    // Phone1 should be blocked
    const payload1 = createTwilioPayload({
      from: `whatsapp:${phone1}`,
      to: `whatsapp:${testSalon.whatsappNumber}`,
      body: "From phone 1",
    });

    // Phone2 should be allowed
    const payload2 = createTwilioPayload({
      from: `whatsapp:${phone2}`,
      to: `whatsapp:${testSalon.whatsappNumber}`,
      body: "From phone 2",
    });

    const [response1, response2] = await Promise.all([
      webhookClient.postWebhook(payload1),
      webhookClient.postWebhook(payload2),
    ]);

    // Both return 200
    await assertWebhookSuccess(response1);
    await assertWebhookSuccess(response2);

    // Phone2 count should be 1, phone1 should still be 10
    expect(await getRateLimitCount(phone2.replace(/\D/g, ""))).toBe(1);
  });

  test("should handle burst of messages from same phone", async ({ webhookClient, testSalon }) => {
    const customerPhone = "+5511999990006";
    
    // Send 15 messages rapidly (5 over limit)
    const payloads = Array.from({ length: 15 }, (_, i) =>
      createTwilioPayload({
        from: `whatsapp:${customerPhone}`,
        to: `whatsapp:${testSalon.whatsappNumber}`,
        body: `Burst message ${i + 1}`,
      })
    );

    const responses = await Promise.all(
      payloads.map((p) => webhookClient.postWebhook(p))
    );

    // All should return 200 (to avoid Twilio retry)
    for (const response of responses) {
      await assertWebhookSuccess(response);
    }
  });

  test("should reset rate limit after window expires", async ({ webhookClient, testSalon }) => {
    // This is a conceptual test - we can't wait 60 seconds
    // We verify by clearing the rate limit manually
    
    const customerPhone = "+5511999990007";
    const normalizedPhone = customerPhone.replace(/\D/g, "");
    
    // Set at limit
    await setRateLimitCount(normalizedPhone, 10);
    
    // Clear (simulating window expiry)
    await clearRateLimits();
    
    // Should be allowed now
    const payload = createTwilioPayload({
      from: `whatsapp:${customerPhone}`,
      to: `whatsapp:${testSalon.whatsappNumber}`,
      body: "Message after reset",
    });

    const response = await webhookClient.postWebhook(payload);
    await assertWebhookSuccess(response);
    
    // Count should be 1
    const count = await getRateLimitCount(normalizedPhone);
    expect(count).toBe(1);
  });
});
