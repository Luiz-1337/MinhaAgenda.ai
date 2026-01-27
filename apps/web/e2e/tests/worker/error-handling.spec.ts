/**
 * Worker error handling tests
 * 
 * Tests:
 * - Retry on failures
 * - Error messages to users
 * - Graceful degradation
 */

import { test, expect } from "../../fixtures/test-fixtures";
import { createTwilioPayload, TestPhones } from "../../fixtures/twilio-payloads";
import { AIResponses } from "../../fixtures/openai-responses";
import {
  assertWebhookSuccess,
  assertTwilioWasCalled,
  waitForCondition,
} from "../../utils/assertions";
import { waitForProcessing } from "../../utils/webhook-helpers";

test.describe("Worker Error Handling", () => {
  test("should send friendly error message on AI failure", async ({
    webhookClient,
    testSalon,
    openaiMock,
    twilioMock,
  }) => {
    // Simulate AI error
    openaiMock.setNextResponse(AIResponses.apiError("Service unavailable"));

    const payload = createTwilioPayload({
      from: TestPhones.customer,
      to: `whatsapp:${testSalon.whatsappNumber}`,
      body: "Test message",
    });

    await webhookClient.postWebhook(payload);

    await waitForCondition(
      async () => twilioMock.getCallCount() > 0,
      15000
    );

    const lastCall = twilioMock.getLastCall();
    // Should send a friendly error message
    expect(lastCall?.body.toLowerCase()).toMatch(/dificuldade|erro|desculpe/);
  });

  test("should handle rate limit error from OpenAI", async ({
    webhookClient,
    testSalon,
    openaiMock,
    twilioMock,
  }) => {
    // Simulate rate limit
    openaiMock.setNextResponse(AIResponses.rateLimitError());

    const payload = createTwilioPayload({
      from: TestPhones.customer,
      to: `whatsapp:${testSalon.whatsappNumber}`,
      body: "Test message",
    });

    await webhookClient.postWebhook(payload);

    // Should handle gracefully
    await waitForProcessing(5000);
  });

  test("should retry on transient failures", async ({
    webhookClient,
    testSalon,
    openaiMock,
    twilioMock,
  }) => {
    // First call fails, second succeeds
    openaiMock.queueResponses([
      AIResponses.apiError("Temporary error"),
      AIResponses.greeting(),
    ]);

    const payload = createTwilioPayload({
      from: TestPhones.customer,
      to: `whatsapp:${testSalon.whatsappNumber}`,
      body: "Test retry",
    });

    await webhookClient.postWebhook(payload);

    // Wait for retry and processing
    await waitForCondition(
      async () => twilioMock.getCallCount() > 0,
      20000
    );
  });

  test("should not expose technical errors to user", async ({
    webhookClient,
    testSalon,
    openaiMock,
    twilioMock,
  }) => {
    // Simulate internal error
    openaiMock.setNextResponse({
      error: "InternalServerError: Database connection failed at line 123",
      status: 500,
    });

    const payload = createTwilioPayload({
      from: TestPhones.customer,
      to: `whatsapp:${testSalon.whatsappNumber}`,
      body: "Test message",
    });

    await webhookClient.postWebhook(payload);

    await waitForCondition(
      async () => twilioMock.getCallCount() > 0,
      15000
    );

    const lastCall = twilioMock.getLastCall();
    // Should NOT contain technical details
    expect(lastCall?.body).not.toContain("Database");
    expect(lastCall?.body).not.toContain("line 123");
    expect(lastCall?.body).not.toContain("InternalServerError");
  });

  test("should handle tool execution errors gracefully", async ({
    webhookClient,
    testSalon,
    openaiMock,
    twilioMock,
  }) => {
    // Tool call that will fail
    openaiMock.queueResponses([
      AIResponses.createAppointmentToolCall(),
      // Tool execution fails, AI should handle it
      AIResponses.error(),
    ]);

    const payload = createTwilioPayload({
      from: TestPhones.customer,
      to: `whatsapp:${testSalon.whatsappNumber}`,
      body: "Quero agendar para amanhã às 14h",
    });

    await webhookClient.postWebhook(payload);

    await waitForCondition(
      async () => twilioMock.getCallCount() > 0,
      15000
    );

    // Should send a helpful message about the error
    const lastCall = twilioMock.getLastCall();
    expect(lastCall?.body.toLowerCase()).toMatch(/dificuldade|ajudar|erro/);
  });

  test("should continue processing other messages after error", async ({
    webhookClient,
    testSalon,
    openaiMock,
    twilioMock,
  }) => {
    // First customer gets error
    openaiMock.queueResponses([
      AIResponses.apiError("Error for customer 1"),
      AIResponses.greeting(), // For customer 2
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

    // Send both messages
    await webhookClient.postWebhook(payload1);
    await webhookClient.postWebhook(payload2);

    // Wait for both to be processed
    await waitForCondition(
      async () => twilioMock.getCallCount() >= 2,
      20000
    );

    // Both should receive responses
    expect(twilioMock.getCallCount()).toBeGreaterThanOrEqual(2);
  });

  test("should handle Twilio API errors", async ({
    webhookClient,
    testSalon,
    openaiMock,
    twilioMock,
  }) => {
    openaiMock.setNextResponse(AIResponses.greeting());
    
    // Simulate Twilio error
    twilioMock.setNextResponse({
      status: 500,
      error: "Twilio service unavailable",
    });

    const payload = createTwilioPayload({
      from: TestPhones.customer,
      to: `whatsapp:${testSalon.whatsappNumber}`,
      body: "Test message",
    });

    // Should not crash
    const response = await webhookClient.postWebhook(payload);
    await assertWebhookSuccess(response);

    // Worker should attempt to send (and fail gracefully)
    await waitForProcessing(5000);
  });
});
