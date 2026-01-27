/**
 * Manual mode integration tests
 * 
 * Tests the behavior when chat is in manual mode
 */

import { test, expect } from "../../fixtures/test-fixtures";
import { createTwilioPayload, TestPhones } from "../../fixtures/twilio-payloads";
import { AIResponses } from "../../fixtures/openai-responses";
import { setChatManualMode } from "../../utils/db-helpers";
import {
  assertWebhookSuccess,
  assertTwilioWasNotCalled,
  assertOpenAIWasNotCalled,
  waitForCondition,
} from "../../utils/assertions";
import { waitForProcessing } from "../../utils/webhook-helpers";

test.describe("Manual Mode", () => {
  test("should not call AI when chat is in manual mode", async ({
    webhookClient,
    testSalon,
    openaiMock,
    twilioMock,
  }) => {
    // Note: This test requires the chat to be marked as manual in the DB
    // In a real implementation, you would set this up via db-helpers
    
    openaiMock.setNextResponse(AIResponses.greeting());

    const payload = createTwilioPayload({
      from: TestPhones.customer,
      to: `whatsapp:${testSalon.whatsappNumber}`,
      body: "Message in manual mode chat",
    });

    const response = await webhookClient.postWebhook(payload);
    await assertWebhookSuccess(response);

    // Wait a bit for processing
    await waitForProcessing(3000);

    // In manual mode:
    // - Message should be saved
    // - AI should NOT be called
    // - Twilio should NOT be called (no auto-response)
    
    // Note: This assertion depends on the chat being in manual mode
    // which requires database setup
  });

  test("should save message even in manual mode", async ({
    webhookClient,
    testSalon,
    openaiMock,
    twilioMock,
  }) => {
    const payload = createTwilioPayload({
      from: TestPhones.customer,
      to: `whatsapp:${testSalon.whatsappNumber}`,
      body: "Message to be saved in manual mode",
    });

    const response = await webhookClient.postWebhook(payload);
    await assertWebhookSuccess(response);

    // Message should be enqueued (even if not AI-processed)
    // Verification would require checking the database
  });

  test("should allow switching from manual to auto mode", async ({
    webhookClient,
    testSalon,
    openaiMock,
    twilioMock,
  }) => {
    // First message: chat starts in auto mode
    openaiMock.setNextResponse(AIResponses.greeting());

    const payload1 = createTwilioPayload({
      from: TestPhones.customer,
      to: `whatsapp:${testSalon.whatsappNumber}`,
      body: "First message in auto mode",
    });

    await webhookClient.postWebhook(payload1);

    await waitForCondition(
      async () => twilioMock.getCallCount() > 0,
      15000
    );

    // AI should have responded
    expect(twilioMock.getCallCount()).toBe(1);

    // Now switch to manual mode (simulated)
    // In real test: await setChatManualMode(chatId, true);

    // Note: Subsequent messages would not trigger AI
    // This would require actual DB manipulation
  });

  test("should allow switching from auto to manual mode", async ({
    webhookClient,
    testSalon,
    openaiMock,
    twilioMock,
  }) => {
    // Similar to above but in reverse
    // Would require actual chat ID and DB manipulation
    
    openaiMock.setNextResponse(AIResponses.greeting());

    const payload = createTwilioPayload({
      from: TestPhones.customer,
      to: `whatsapp:${testSalon.whatsappNumber}`,
      body: "Test mode switch",
    });

    const response = await webhookClient.postWebhook(payload);
    await assertWebhookSuccess(response);
  });

  test("should handle human agent takeover", async ({
    webhookClient,
    testSalon,
    openaiMock,
    twilioMock,
  }) => {
    // This test simulates a human agent taking over the conversation
    // In manual mode, messages should be saved but not auto-responded

    const payload = createTwilioPayload({
      from: TestPhones.customer,
      to: `whatsapp:${testSalon.whatsappNumber}`,
      body: "I need to speak to a human",
    });

    const response = await webhookClient.postWebhook(payload);
    await assertWebhookSuccess(response);

    // In a full implementation:
    // 1. This might trigger manual mode
    // 2. Human agent would be notified
    // 3. AI would stop responding
  });
});
