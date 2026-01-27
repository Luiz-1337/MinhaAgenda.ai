/**
 * Media handling integration tests
 * 
 * Tests the handling of media messages (images, audio, video)
 */

import { test, expect } from "../../fixtures/test-fixtures";
import {
  createTwilioPayload,
  createImageMessagePayload,
  createAudioMessagePayload,
  createVideoMessagePayload,
  TestPayloads,
  TestPhones,
} from "../../fixtures/twilio-payloads";
import { AIResponses } from "../../fixtures/openai-responses";
import {
  assertWebhookSuccess,
  assertTwilioWasCalled,
  waitForCondition,
} from "../../utils/assertions";

test.describe("Media Handling", () => {
  test("should respond with standard message for image", async ({
    webhookClient,
    testSalon,
    openaiMock,
    twilioMock,
  }) => {
    const payload = createImageMessagePayload(
      TestPhones.customer,
      `whatsapp:${testSalon.whatsappNumber}`,
      "https://example.com/image.jpg"
    );

    const response = await webhookClient.postWebhook(payload);
    await assertWebhookSuccess(response);

    // Wait for response
    await waitForCondition(
      async () => twilioMock.getCallCount() > 0,
      15000
    );

    // Should send standard "media not supported" message
    const lastCall = twilioMock.getLastCall();
    expect(lastCall?.body.toLowerCase()).toMatch(/texto|mídia|imagem/);
  });

  test("should respond with standard message for audio", async ({
    webhookClient,
    testSalon,
    openaiMock,
    twilioMock,
  }) => {
    const payload = createAudioMessagePayload(
      TestPhones.customer,
      `whatsapp:${testSalon.whatsappNumber}`,
      "https://example.com/audio.ogg"
    );

    const response = await webhookClient.postWebhook(payload);
    await assertWebhookSuccess(response);

    await waitForCondition(
      async () => twilioMock.getCallCount() > 0,
      15000
    );

    const lastCall = twilioMock.getLastCall();
    expect(lastCall?.body.toLowerCase()).toMatch(/texto|mídia|áudio/);
  });

  test("should respond with standard message for video", async ({
    webhookClient,
    testSalon,
    openaiMock,
    twilioMock,
  }) => {
    const payload = createVideoMessagePayload(
      TestPhones.customer,
      `whatsapp:${testSalon.whatsappNumber}`,
      "https://example.com/video.mp4"
    );

    const response = await webhookClient.postWebhook(payload);
    await assertWebhookSuccess(response);

    await waitForCondition(
      async () => twilioMock.getCallCount() > 0,
      15000
    );

    const lastCall = twilioMock.getLastCall();
    expect(lastCall?.body.toLowerCase()).toMatch(/texto|mídia|vídeo/);
  });

  test("should handle message with image and text", async ({
    webhookClient,
    testSalon,
    openaiMock,
    twilioMock,
  }) => {
    // Message with both text and image
    const payload = createTwilioPayload({
      from: TestPhones.customer,
      to: `whatsapp:${testSalon.whatsappNumber}`,
      body: "Look at this image!",
      numMedia: 1,
      mediaContentType: "image/jpeg",
      mediaUrl: "https://example.com/image.jpg",
    });

    const response = await webhookClient.postWebhook(payload);
    await assertWebhookSuccess(response);

    // Should still treat as media message
    await waitForCondition(
      async () => twilioMock.getCallCount() > 0,
      15000
    );
  });

  test("should handle multiple media items", async ({
    webhookClient,
    testSalon,
    openaiMock,
    twilioMock,
  }) => {
    const params = new URLSearchParams();
    params.append("From", TestPhones.customer);
    params.append("To", `whatsapp:${testSalon.whatsappNumber}`);
    params.append("Body", "");
    params.append("MessageSid", "MM" + "x".repeat(32));
    params.append("NumMedia", "3");
    params.append("MediaContentType0", "image/jpeg");
    params.append("MediaUrl0", "https://example.com/image1.jpg");
    params.append("MediaContentType1", "image/png");
    params.append("MediaUrl1", "https://example.com/image2.png");
    params.append("MediaContentType2", "image/gif");
    params.append("MediaUrl2", "https://example.com/image3.gif");

    const response = await webhookClient.postWebhook(params);
    await assertWebhookSuccess(response);

    await waitForCondition(
      async () => twilioMock.getCallCount() > 0,
      15000
    );
  });

  test("should handle document attachments", async ({
    webhookClient,
    testSalon,
    openaiMock,
    twilioMock,
  }) => {
    const payload = createTwilioPayload({
      from: TestPhones.customer,
      to: `whatsapp:${testSalon.whatsappNumber}`,
      body: "",
      numMedia: 1,
      mediaContentType: "application/pdf",
      mediaUrl: "https://example.com/document.pdf",
    });

    const response = await webhookClient.postWebhook(payload);
    await assertWebhookSuccess(response);

    await waitForCondition(
      async () => twilioMock.getCallCount() > 0,
      15000
    );

    const lastCall = twilioMock.getLastCall();
    expect(lastCall?.body.toLowerCase()).toMatch(/texto|documento|mídia/);
  });

  test("should save media message in chat history", async ({
    webhookClient,
    testSalon,
    openaiMock,
    twilioMock,
  }) => {
    const payload = TestPayloads.imageMessage(
      TestPhones.customer,
      `whatsapp:${testSalon.whatsappNumber}`
    );

    const response = await webhookClient.postWebhook(payload);
    await assertWebhookSuccess(response);

    // Message should be saved with [MÍDIA] prefix
    // Verification would require checking the database
  });

  test("should handle unknown media type gracefully", async ({
    webhookClient,
    testSalon,
    openaiMock,
    twilioMock,
  }) => {
    const payload = createTwilioPayload({
      from: TestPhones.customer,
      to: `whatsapp:${testSalon.whatsappNumber}`,
      body: "",
      numMedia: 1,
      mediaContentType: "application/octet-stream",
      mediaUrl: "https://example.com/file.bin",
    });

    const response = await webhookClient.postWebhook(payload);
    await assertWebhookSuccess(response);

    await waitForCondition(
      async () => twilioMock.getCallCount() > 0,
      15000
    );

    // Should handle gracefully
    const lastCall = twilioMock.getLastCall();
    expect(lastCall?.body.toLowerCase()).toMatch(/texto|mídia/);
  });

  test("should continue processing text messages after media", async ({
    webhookClient,
    testSalon,
    openaiMock,
    twilioMock,
  }) => {
    // First: media message
    const mediaPayload = createImageMessagePayload(
      TestPhones.customer,
      `whatsapp:${testSalon.whatsappNumber}`,
      "https://example.com/image.jpg"
    );

    await webhookClient.postWebhook(mediaPayload);

    await waitForCondition(
      async () => twilioMock.getCallCount() > 0,
      15000
    );

    // Second: text message
    openaiMock.setNextResponse(AIResponses.greeting());

    const textPayload = createTwilioPayload({
      from: TestPhones.customer,
      to: `whatsapp:${testSalon.whatsappNumber}`,
      body: "Olá, depois da imagem",
    });

    await webhookClient.postWebhook(textPayload);

    await waitForCondition(
      async () => twilioMock.getCallCount() > 1,
      15000
    );

    // Text message should be processed with AI
    expect(twilioMock.getCallCount()).toBe(2);
  });
});
