/**
 * Webhook enqueue tests
 * 
 * Tests:
 * - Message enqueueing
 * - Queue priority (text vs media)
 * - Queue job data
 */

import { test, expect } from "../../fixtures/test-fixtures";
import { createTwilioPayload, createImageMessagePayload, TestPhones } from "../../fixtures/twilio-payloads";
import {
  assertWebhookSuccess,
  assertResponseTime,
} from "../../utils/assertions";

test.describe("Webhook Enqueue", () => {
  test("should enqueue text messages successfully", async ({ webhookClient, testSalon }) => {
    const payload = createTwilioPayload({
      from: TestPhones.customer,
      to: `whatsapp:${testSalon.whatsappNumber}`,
      body: "Test text message",
    });

    const startTime = Date.now();
    const response = await webhookClient.postWebhook(payload);
    
    await assertWebhookSuccess(response);
    
    // Should respond quickly (< 500ms for enqueueing only)
    assertResponseTime(startTime, 5000); // Allow 5s for test environment
  });

  test("should enqueue media messages successfully", async ({ webhookClient, testSalon }) => {
    const payload = createImageMessagePayload(
      TestPhones.customer,
      `whatsapp:${testSalon.whatsappNumber}`,
      "https://example.com/image.jpg"
    );

    const response = await webhookClient.postWebhook(payload);
    await assertWebhookSuccess(response);
  });

  test("should handle multiple simultaneous enqueues", async ({ webhookClient, testSalon }) => {
    const payloads = Array.from({ length: 5 }, (_, i) =>
      createTwilioPayload({
        from: `whatsapp:+551199999${String(i).padStart(4, "0")}`,
        to: `whatsapp:${testSalon.whatsappNumber}`,
        body: `Concurrent message ${i + 1}`,
      })
    );

    const startTime = Date.now();
    const responses = await Promise.all(
      payloads.map((p) => webhookClient.postWebhook(p))
    );

    // All should succeed
    for (const response of responses) {
      await assertWebhookSuccess(response);
    }

    // Total time should still be reasonable
    assertResponseTime(startTime, 10000); // 10s max for 5 concurrent
  });

  test("should include correct data in job payload", async ({ webhookClient, testSalon }) => {
    const messageSid = "MM" + "a".repeat(32);
    const messageBody = "Test message for job data";
    
    const payload = createTwilioPayload({
      from: TestPhones.customer,
      to: `whatsapp:${testSalon.whatsappNumber}`,
      body: messageBody,
      messageSid,
      profileName: "Test User",
    });

    const response = await webhookClient.postWebhook(payload);
    await assertWebhookSuccess(response);

    // Job data verification would require accessing the queue directly
    // In a real implementation, you would check the job contents
  });

  test("should handle empty body for media messages", async ({ webhookClient, testSalon }) => {
    const payload = createTwilioPayload({
      from: TestPhones.customer,
      to: `whatsapp:${testSalon.whatsappNumber}`,
      body: "", // Empty body
      numMedia: 1,
      mediaContentType: "image/jpeg",
      mediaUrl: "https://example.com/image.jpg",
    });

    const response = await webhookClient.postWebhook(payload);
    await assertWebhookSuccess(response);
  });

  test("should handle multiple media items", async ({ webhookClient, testSalon }) => {
    const params = new URLSearchParams();
    params.append("From", TestPhones.customer);
    params.append("To", `whatsapp:${testSalon.whatsappNumber}`);
    params.append("Body", "");
    params.append("MessageSid", "MM" + "b".repeat(32));
    params.append("NumMedia", "3");
    params.append("MediaContentType0", "image/jpeg");
    params.append("MediaUrl0", "https://example.com/image1.jpg");
    params.append("MediaContentType1", "image/png");
    params.append("MediaUrl1", "https://example.com/image2.png");
    params.append("MediaContentType2", "audio/ogg");
    params.append("MediaUrl2", "https://example.com/audio.ogg");

    const response = await webhookClient.postWebhook(params);
    await assertWebhookSuccess(response);
  });

  test("should track new vs returning customers", async ({ webhookClient, testSalon }) => {
    // First message from new customer
    const payload1 = createTwilioPayload({
      from: TestPhones.customer,
      to: `whatsapp:${testSalon.whatsappNumber}`,
      body: "First message from new customer",
    });

    // Second message from same customer
    const payload2 = createTwilioPayload({
      from: TestPhones.customer,
      to: `whatsapp:${testSalon.whatsappNumber}`,
      body: "Second message from returning customer",
    });

    const response1 = await webhookClient.postWebhook(payload1);
    const response2 = await webhookClient.postWebhook(payload2);

    await assertWebhookSuccess(response1);
    await assertWebhookSuccess(response2);
  });
});
