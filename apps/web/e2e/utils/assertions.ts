/**
 * Custom assertions for E2E tests
 */

import { expect, APIResponse } from "@playwright/test";
import { TwilioMockServer } from "../mocks/twilio-mock-server";
import { OpenAIMockServer } from "../mocks/openai-mock-server";

/**
 * Asserts that the webhook returned a successful response
 */
export async function assertWebhookSuccess(response: APIResponse): Promise<void> {
  expect(response.status()).toBe(200);
}

/**
 * Asserts that the webhook returned an error response
 */
export async function assertWebhookError(
  response: APIResponse,
  expectedStatus: number
): Promise<void> {
  expect(response.status()).toBe(expectedStatus);
}

/**
 * Asserts that Twilio was called with the expected message
 */
export function assertTwilioWasCalled(
  twilioMock: TwilioMockServer,
  expectedTo?: string,
  expectedBodyContains?: string
): void {
  const calls = twilioMock.getCalls();
  expect(calls.length).toBeGreaterThan(0);

  const lastCall = twilioMock.getLastCall();
  expect(lastCall).toBeDefined();

  if (expectedTo) {
    expect(lastCall?.to).toContain(expectedTo.replace(/\D/g, ""));
  }

  if (expectedBodyContains) {
    expect(lastCall?.body.toLowerCase()).toContain(expectedBodyContains.toLowerCase());
  }
}

/**
 * Asserts that Twilio was NOT called
 */
export function assertTwilioWasNotCalled(twilioMock: TwilioMockServer): void {
  expect(twilioMock.getCallCount()).toBe(0);
}

/**
 * Asserts that OpenAI was called
 */
export function assertOpenAIWasCalled(
  openaiMock: OpenAIMockServer,
  expectedModel?: string
): void {
  const calls = openaiMock.getCalls();
  expect(calls.length).toBeGreaterThan(0);

  if (expectedModel) {
    const lastCall = openaiMock.getLastCall();
    expect(lastCall?.model).toBe(expectedModel);
  }
}

/**
 * Asserts that OpenAI was NOT called
 */
export function assertOpenAIWasNotCalled(openaiMock: OpenAIMockServer): void {
  expect(openaiMock.getCallCount()).toBe(0);
}

/**
 * Asserts that the OpenAI request contained the expected message
 */
export function assertOpenAIReceivedMessage(
  openaiMock: OpenAIMockServer,
  expectedMessageContains: string
): void {
  const lastCall = openaiMock.getLastCall();
  expect(lastCall).toBeDefined();

  const messages = lastCall?.messages || [];
  const hasMessage = messages.some((m) =>
    m.content.toLowerCase().includes(expectedMessageContains.toLowerCase())
  );

  expect(hasMessage).toBe(true);
}

/**
 * Asserts that the Twilio call count matches expected
 */
export function assertTwilioCallCount(
  twilioMock: TwilioMockServer,
  expectedCount: number
): void {
  expect(twilioMock.getCallCount()).toBe(expectedCount);
}

/**
 * Asserts that the OpenAI call count matches expected
 */
export function assertOpenAICallCount(
  openaiMock: OpenAIMockServer,
  expectedCount: number
): void {
  expect(openaiMock.getCallCount()).toBe(expectedCount);
}

/**
 * Asserts health check is healthy
 */
export async function assertHealthy(response: APIResponse): Promise<void> {
  expect(response.status()).toBe(200);

  const body = await response.json();
  expect(body.status).toBe("healthy");
}

/**
 * Asserts health check is degraded
 */
export async function assertDegraded(response: APIResponse): Promise<void> {
  expect(response.status()).toBe(200);

  const body = await response.json();
  expect(body.status).toBe("degraded");
}

/**
 * Asserts health check is unhealthy
 */
export async function assertUnhealthy(response: APIResponse): Promise<void> {
  expect(response.status()).toBe(503);

  const body = await response.json();
  expect(body.status).toBe("unhealthy");
}

/**
 * Asserts that a response contains specific text
 */
export async function assertResponseContains(
  response: APIResponse,
  expectedText: string
): Promise<void> {
  const body = await response.text();
  expect(body.toLowerCase()).toContain(expectedText.toLowerCase());
}

/**
 * Asserts that the response is empty (common for webhook success)
 */
export async function assertEmptyResponse(response: APIResponse): Promise<void> {
  const body = await response.text();
  expect(body).toBe("");
}

/**
 * Waits for a condition to be true with polling
 */
export async function waitForCondition(
  condition: () => Promise<boolean>,
  timeout = 5000,
  interval = 100
): Promise<void> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    if (await condition()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, interval));
  }

  throw new Error(`Condition not met within ${timeout}ms`);
}

/**
 * Asserts that a message was processed (via Twilio mock)
 */
export async function assertMessageWasProcessed(
  twilioMock: TwilioMockServer,
  timeout = 5000
): Promise<void> {
  await waitForCondition(
    async () => twilioMock.getCallCount() > 0,
    timeout
  );
}

/**
 * Asserts that multiple messages were sent
 */
export function assertMultipleMessagesWereSent(
  twilioMock: TwilioMockServer,
  expectedCount: number
): void {
  expect(twilioMock.getCallCount()).toBe(expectedCount);
}

/**
 * Asserts that response time is within acceptable range
 */
export function assertResponseTime(
  startTime: number,
  maxMs: number
): void {
  const duration = Date.now() - startTime;
  expect(duration).toBeLessThan(maxMs);
}
