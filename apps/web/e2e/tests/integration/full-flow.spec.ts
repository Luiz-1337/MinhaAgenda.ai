/**
 * Full flow integration tests
 * 
 * Tests the complete flow from message receipt to response
 */

import { test, expect } from "../../fixtures/test-fixtures";
import { createTwilioPayload, TestPayloads, TestPhones } from "../../fixtures/twilio-payloads";
import { AIResponses, ConversationFlows } from "../../fixtures/openai-responses";
import {
  assertWebhookSuccess,
  assertTwilioWasCalled,
  assertOpenAIWasCalled,
  waitForCondition,
  assertResponseTime,
} from "../../utils/assertions";
import { waitForProcessing } from "../../utils/webhook-helpers";

test.describe("Full Flow Integration", () => {
  test("should complete full flow: message → enqueue → process → respond", async ({
    webhookClient,
    testSalon,
    openaiMock,
    twilioMock,
  }) => {
    // Setup
    const userMessage = "Olá, gostaria de saber os preços";
    const expectedResponse = "Nossos preços são: Corte R$50, Barba R$30";
    
    openaiMock.setNextResponse(AIResponses.custom(expectedResponse));

    // Act
    const startTime = Date.now();
    const payload = createTwilioPayload({
      from: TestPhones.customer,
      to: `whatsapp:${testSalon.whatsappNumber}`,
      body: userMessage,
    });

    const webhookResponse = await webhookClient.postWebhook(payload);

    // Assert webhook response
    await assertWebhookSuccess(webhookResponse);
    assertResponseTime(startTime, 5000); // Webhook should respond quickly

    // Assert message was processed
    await waitForCondition(
      async () => twilioMock.getCallCount() > 0,
      15000
    );

    // Assert OpenAI was called
    assertOpenAIWasCalled(openaiMock);

    // Assert response was sent via Twilio
    assertTwilioWasCalled(twilioMock);
    
    const lastCall = twilioMock.getLastCall();
    expect(lastCall?.body).toContain("preços");
  });

  test("should handle complete appointment booking flow", async ({
    webhookClient,
    testSalon,
    openaiMock,
    twilioMock,
  }) => {
    // Setup multi-turn conversation
    openaiMock.queueResponses([
      AIResponses.availabilityOptions(),
      AIResponses.appointmentConfirmation("amanhã", "14h", "corte de cabelo"),
    ]);

    // First message: request appointment
    const payload1 = createTwilioPayload({
      from: TestPhones.customer,
      to: `whatsapp:${testSalon.whatsappNumber}`,
      body: "Quero agendar um corte de cabelo",
    });

    await webhookClient.postWebhook(payload1);

    await waitForCondition(
      async () => twilioMock.getCallCount() > 0,
      15000
    );

    // Verify availability options were sent
    let lastCall = twilioMock.getLastCall();
    expect(lastCall?.body.toLowerCase()).toContain("opção");

    // Second message: confirm appointment
    const payload2 = createTwilioPayload({
      from: TestPhones.customer,
      to: `whatsapp:${testSalon.whatsappNumber}`,
      body: "Quero a primeira opção",
    });

    await webhookClient.postWebhook(payload2);

    await waitForCondition(
      async () => twilioMock.getCallCount() > 1,
      15000
    );

    // Verify confirmation was sent
    lastCall = twilioMock.getLastCall();
    expect(lastCall?.body.toLowerCase()).toContain("confirmado");
  });

  test("should handle new customer vs returning customer", async ({
    webhookClient,
    testSalon,
    openaiMock,
    twilioMock,
  }) => {
    // New customer message
    openaiMock.setNextResponse(AIResponses.greeting());

    const newCustomerPayload = createTwilioPayload({
      from: "whatsapp:+5511999990001", // New phone
      to: `whatsapp:${testSalon.whatsappNumber}`,
      body: "Olá!",
    });

    await webhookClient.postWebhook(newCustomerPayload);

    await waitForCondition(
      async () => twilioMock.getCallCount() > 0,
      15000
    );

    // Should greet new customer
    let lastCall = twilioMock.getLastCall();
    expect(lastCall?.body.toLowerCase()).toMatch(/olá|bem-vindo/);

    // Second message from same customer (now returning)
    openaiMock.setNextResponse(AIResponses.serviceList());

    const returningPayload = createTwilioPayload({
      from: "whatsapp:+5511999990001", // Same phone
      to: `whatsapp:${testSalon.whatsappNumber}`,
      body: "Quero ver os serviços",
    });

    await webhookClient.postWebhook(returningPayload);

    await waitForCondition(
      async () => twilioMock.getCallCount() > 1,
      15000
    );

    lastCall = twilioMock.getLastCall();
    expect(lastCall?.body.toLowerCase()).toContain("serviços");
  });

  test("should maintain conversation context across messages", async ({
    webhookClient,
    testSalon,
    openaiMock,
    twilioMock,
  }) => {
    // First message
    openaiMock.setNextResponse(AIResponses.greeting());
    
    await webhookClient.postWebhook(
      createTwilioPayload({
        from: TestPhones.customer,
        to: `whatsapp:${testSalon.whatsappNumber}`,
        body: "Olá, meu nome é João",
      })
    );

    await waitForCondition(
      async () => twilioMock.getCallCount() > 0,
      15000
    );

    // Second message - context should include previous messages
    openaiMock.setNextResponse(AIResponses.serviceList());
    
    await webhookClient.postWebhook(
      createTwilioPayload({
        from: TestPhones.customer,
        to: `whatsapp:${testSalon.whatsappNumber}`,
        body: "Quais serviços vocês oferecem?",
      })
    );

    await waitForCondition(
      async () => openaiMock.getCallCount() > 1,
      15000
    );

    // Verify context was maintained
    const lastAICall = openaiMock.getLastCall();
    expect(lastAICall?.messages.length).toBeGreaterThan(1);
  });

  test("should handle high-volume messages correctly", async ({
    webhookClient,
    testSalon,
    openaiMock,
    twilioMock,
  }) => {
    // Prepare responses for 5 different customers
    for (let i = 0; i < 5; i++) {
      openaiMock.queueResponses([AIResponses.greeting()]);
    }

    // Send messages from 5 different customers simultaneously
    const payloads = Array.from({ length: 5 }, (_, i) =>
      createTwilioPayload({
        from: `whatsapp:+551199999${String(i).padStart(4, "0")}`,
        to: `whatsapp:${testSalon.whatsappNumber}`,
        body: `Message from customer ${i + 1}`,
      })
    );

    // Send all concurrently
    await Promise.all(
      payloads.map((p) => webhookClient.postWebhook(p))
    );

    // Wait for all to be processed
    await waitForCondition(
      async () => twilioMock.getCallCount() >= 5,
      30000
    );

    // All should have received responses
    expect(twilioMock.getCallCount()).toBeGreaterThanOrEqual(5);
  });

  test("should handle rapid sequential messages from same customer", async ({
    webhookClient,
    testSalon,
    openaiMock,
    twilioMock,
  }) => {
    // Queue responses
    openaiMock.queueResponses([
      AIResponses.custom("Response 1"),
      AIResponses.custom("Response 2"),
      AIResponses.custom("Response 3"),
    ]);

    // Send 3 rapid messages
    for (let i = 0; i < 3; i++) {
      const payload = createTwilioPayload({
        from: TestPhones.customer,
        to: `whatsapp:${testSalon.whatsappNumber}`,
        body: `Rapid message ${i + 1}`,
      });

      await webhookClient.postWebhook(payload);
      await waitForProcessing(100); // Small delay
    }

    // Wait for all to be processed
    await waitForCondition(
      async () => twilioMock.getCallCount() >= 3,
      30000
    );

    // All should be processed in order (sequential per chat)
    expect(twilioMock.getCallCount()).toBe(3);
  });
});
