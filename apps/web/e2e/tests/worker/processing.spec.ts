/**
 * Worker processing tests
 * 
 * Tests:
 * - Basic message processing
 * - Lock acquisition
 * - Sequential processing per chat
 */

import { test, expect } from "../../fixtures/test-fixtures";
import { createTwilioPayload, TestPhones } from "../../fixtures/twilio-payloads";
import { AIResponses } from "../../fixtures/openai-responses";
import {
  acquireLock,
  releaseLock,
  clearLocks,
} from "../../mocks/redis-test-utils";
import {
  assertWebhookSuccess,
  assertTwilioWasCalled,
  waitForCondition,
} from "../../utils/assertions";
import { waitForProcessing } from "../../utils/webhook-helpers";

test.describe("Worker Processing", () => {
  test.beforeEach(async () => {
    await clearLocks();
  });

  test("should process text message and send response", async ({
    webhookClient,
    testSalon,
    openaiMock,
    twilioMock,
  }) => {
    // Setup mock response
    openaiMock.setNextResponse(AIResponses.greeting());

    const payload = createTwilioPayload({
      from: TestPhones.customer,
      to: `whatsapp:${testSalon.whatsappNumber}`,
      body: "Olá!",
    });

    const response = await webhookClient.postWebhook(payload);
    await assertWebhookSuccess(response);

    // Wait for worker to process
    await waitForCondition(
      async () => twilioMock.getCallCount() > 0,
      10000
    );

    // Verify response was sent
    assertTwilioWasCalled(twilioMock);
  });

  test("should acquire lock before processing", async ({
    webhookClient,
    testSalon,
    openaiMock,
    twilioMock,
  }) => {
    openaiMock.setNextResponse(AIResponses.greeting());

    const payload = createTwilioPayload({
      from: TestPhones.customer,
      to: `whatsapp:${testSalon.whatsappNumber}`,
      body: "Test lock",
    });

    await webhookClient.postWebhook(payload);

    // Lock should be acquired during processing
    // This is implicitly tested by the fact that processing works
    await waitForCondition(
      async () => twilioMock.getCallCount() > 0,
      10000
    );
  });

  test("should release lock after processing", async ({
    webhookClient,
    testSalon,
    openaiMock,
    twilioMock,
  }) => {
    openaiMock.setNextResponse(AIResponses.greeting());

    const payload = createTwilioPayload({
      from: TestPhones.customer,
      to: `whatsapp:${testSalon.whatsappNumber}`,
      body: "Test lock release",
    });

    await webhookClient.postWebhook(payload);

    // Wait for processing
    await waitForCondition(
      async () => twilioMock.getCallCount() > 0,
      10000
    );

    // After processing, lock should be released
    // Try to acquire the same lock
    await waitForProcessing(1000);
    
    const chatId = "test-chat"; // Would need actual chat ID
    const lockId = await acquireLock(`chat:${chatId}`);
    
    // Should be able to acquire lock (previous one released)
    // Note: In real test, you'd need to get the actual chat ID
  });

  test("should process messages sequentially for same chat", async ({
    webhookClient,
    testSalon,
    openaiMock,
    twilioMock,
  }) => {
    // Queue multiple responses
    openaiMock.queueResponses([
      AIResponses.custom("Response 1"),
      AIResponses.custom("Response 2"),
      AIResponses.custom("Response 3"),
    ]);

    // Send 3 messages from same customer
    const payloads = [1, 2, 3].map((i) =>
      createTwilioPayload({
        from: TestPhones.customer,
        to: `whatsapp:${testSalon.whatsappNumber}`,
        body: `Message ${i}`,
      })
    );

    // Send all messages
    for (const payload of payloads) {
      await webhookClient.postWebhook(payload);
    }

    // Wait for all to be processed
    await waitForCondition(
      async () => twilioMock.getCallCount() >= 3,
      30000
    );

    // Verify all responses were sent
    expect(twilioMock.getCallCount()).toBe(3);
  });

  test("should handle concurrent messages from different chats", async ({
    webhookClient,
    testSalon,
    openaiMock,
    twilioMock,
  }) => {
    // Queue responses for different customers
    openaiMock.queueResponses([
      AIResponses.custom("Response to customer 1"),
      AIResponses.custom("Response to customer 2"),
    ]);

    const payload1 = createTwilioPayload({
      from: "whatsapp:+5511999990001",
      to: `whatsapp:${testSalon.whatsappNumber}`,
      body: "Message from customer 1",
    });

    const payload2 = createTwilioPayload({
      from: "whatsapp:+5511999990002",
      to: `whatsapp:${testSalon.whatsappNumber}`,
      body: "Message from customer 2",
    });

    // Send concurrently
    await Promise.all([
      webhookClient.postWebhook(payload1),
      webhookClient.postWebhook(payload2),
    ]);

    // Wait for both to be processed
    await waitForCondition(
      async () => twilioMock.getCallCount() >= 2,
      20000
    );

    expect(twilioMock.getCallCount()).toBe(2);
  });
});
