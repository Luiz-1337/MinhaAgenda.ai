/**
 * Worker AI response tests
 * 
 * Tests:
 * - AI response generation
 * - Tool calls
 * - Response formatting
 */

import { test, expect } from "../../fixtures/test-fixtures";
import { createTwilioPayload, TestPayloads, TestPhones } from "../../fixtures/twilio-payloads";
import { AIResponses, ConversationFlows } from "../../fixtures/openai-responses";
import {
  assertWebhookSuccess,
  assertTwilioWasCalled,
  assertOpenAIWasCalled,
  assertOpenAIReceivedMessage,
  waitForCondition,
} from "../../utils/assertions";

test.describe("Worker AI Response", () => {
  test("should call OpenAI with user message", async ({
    webhookClient,
    testSalon,
    openaiMock,
    twilioMock,
  }) => {
    const userMessage = "Quero agendar um corte de cabelo";
    openaiMock.setNextResponse(AIResponses.availabilityOptions());

    const payload = createTwilioPayload({
      from: TestPhones.customer,
      to: `whatsapp:${testSalon.whatsappNumber}`,
      body: userMessage,
    });

    await webhookClient.postWebhook(payload);

    // Wait for processing
    await waitForCondition(
      async () => openaiMock.getCallCount() > 0,
      10000
    );

    // Verify OpenAI was called
    assertOpenAIWasCalled(openaiMock);
    assertOpenAIReceivedMessage(openaiMock, userMessage);
  });

  test("should send AI response via WhatsApp", async ({
    webhookClient,
    testSalon,
    openaiMock,
    twilioMock,
  }) => {
    const expectedResponse = "Olá! Como posso ajudá-lo?";
    openaiMock.setNextResponse(AIResponses.custom(expectedResponse));

    const payload = createTwilioPayload({
      from: TestPhones.customer,
      to: `whatsapp:${testSalon.whatsappNumber}`,
      body: "Oi",
    });

    await webhookClient.postWebhook(payload);

    // Wait for Twilio to be called
    await waitForCondition(
      async () => twilioMock.getCallCount() > 0,
      10000
    );

    // Verify response was sent
    assertTwilioWasCalled(twilioMock);
    
    const lastCall = twilioMock.getLastCall();
    expect(lastCall?.body).toContain("Olá");
  });

  test("should handle service inquiry", async ({
    webhookClient,
    testSalon,
    openaiMock,
    twilioMock,
  }) => {
    openaiMock.setNextResponse(AIResponses.serviceList());

    const payload = TestPayloads.serviceInquiry(
      TestPhones.customer,
      `whatsapp:${testSalon.whatsappNumber}`
    );

    await webhookClient.postWebhook(payload);

    await waitForCondition(
      async () => twilioMock.getCallCount() > 0,
      10000
    );

    const lastCall = twilioMock.getLastCall();
    expect(lastCall?.body).toContain("serviços");
  });

  test("should handle appointment request", async ({
    webhookClient,
    testSalon,
    openaiMock,
    twilioMock,
  }) => {
    openaiMock.setNextResponse(AIResponses.appointmentConfirmation());

    const payload = TestPayloads.appointmentRequest(
      TestPhones.customer,
      `whatsapp:${testSalon.whatsappNumber}`
    );

    await webhookClient.postWebhook(payload);

    await waitForCondition(
      async () => twilioMock.getCallCount() > 0,
      10000
    );

    const lastCall = twilioMock.getLastCall();
    expect(lastCall?.body.toLowerCase()).toContain("agendamento");
  });

  test("should handle tool calls", async ({
    webhookClient,
    testSalon,
    openaiMock,
    twilioMock,
  }) => {
    // First response: tool call to check availability
    // Second response: final message after tool execution
    openaiMock.queueResponses([
      AIResponses.checkAvailabilityToolCall(),
      AIResponses.availabilityOptions(),
    ]);

    const payload = createTwilioPayload({
      from: TestPhones.customer,
      to: `whatsapp:${testSalon.whatsappNumber}`,
      body: "Quais horários estão disponíveis?",
    });

    await webhookClient.postWebhook(payload);

    await waitForCondition(
      async () => twilioMock.getCallCount() > 0,
      15000
    );

    assertTwilioWasCalled(twilioMock);
  });

  test("should handle AI error gracefully", async ({
    webhookClient,
    testSalon,
    openaiMock,
    twilioMock,
  }) => {
    // Simulate API error
    openaiMock.setNextResponse(AIResponses.apiError("Internal error"));

    const payload = createTwilioPayload({
      from: TestPhones.customer,
      to: `whatsapp:${testSalon.whatsappNumber}`,
      body: "Test message",
    });

    await webhookClient.postWebhook(payload);

    // Should still send a fallback response
    await waitForCondition(
      async () => twilioMock.getCallCount() > 0,
      10000
    );

    const lastCall = twilioMock.getLastCall();
    expect(lastCall?.body.toLowerCase()).toContain("dificuldade");
  });

  test("should handle empty AI response", async ({
    webhookClient,
    testSalon,
    openaiMock,
    twilioMock,
  }) => {
    // Empty response
    openaiMock.setNextResponse({ content: "" });

    const payload = createTwilioPayload({
      from: TestPhones.customer,
      to: `whatsapp:${testSalon.whatsappNumber}`,
      body: "Test message",
    });

    await webhookClient.postWebhook(payload);

    // Should handle gracefully
    await waitForCondition(
      async () => twilioMock.getCallCount() > 0,
      10000
    );
  });

  test("should include chat history in context", async ({
    webhookClient,
    testSalon,
    openaiMock,
    twilioMock,
  }) => {
    // First message
    openaiMock.setNextResponse(AIResponses.greeting());
    
    const payload1 = createTwilioPayload({
      from: TestPhones.customer,
      to: `whatsapp:${testSalon.whatsappNumber}`,
      body: "Olá!",
    });

    await webhookClient.postWebhook(payload1);
    
    await waitForCondition(
      async () => twilioMock.getCallCount() > 0,
      10000
    );

    // Second message - should include history
    openaiMock.setNextResponse(AIResponses.serviceList());
    
    const payload2 = createTwilioPayload({
      from: TestPhones.customer,
      to: `whatsapp:${testSalon.whatsappNumber}`,
      body: "Quais serviços vocês têm?",
    });

    await webhookClient.postWebhook(payload2);
    
    await waitForCondition(
      async () => twilioMock.getCallCount() > 1,
      10000
    );

    // Verify second call includes context
    const calls = openaiMock.getCalls();
    const lastCall = calls[calls.length - 1];
    
    // Should have multiple messages (history + new message)
    expect(lastCall?.messages.length).toBeGreaterThan(1);
  });
});
