import { test as base, expect, APIRequestContext } from "@playwright/test";
import { TwilioMockServer } from "../mocks/twilio-mock-server";
import { OpenAIMockServer } from "../mocks/openai-mock-server";
import { 
  clearAllTestData, 
  getTestRedisClient,
  clearRateLimits,
  clearProcessedMessages,
} from "../mocks/redis-test-utils";
import { createTestSalon, createTestCustomer, cleanupTestData, TestSalon, TestCustomer } from "../utils/db-helpers";
import { WebhookClient, createWebhookClient } from "../utils/webhook-helpers";

/**
 * Extended test fixtures for E2E tests
 */
export interface TestFixtures {
  /** Twilio mock server */
  twilioMock: TwilioMockServer;
  
  /** OpenAI mock server */
  openaiMock: OpenAIMockServer;
  
  /** Webhook client for making API calls */
  webhookClient: WebhookClient;
  
  /** Test salon data */
  testSalon: TestSalon;
  
  /** Test customer data */
  testCustomer: TestCustomer;
  
  /** API request context */
  apiContext: APIRequestContext;
}

/**
 * Extended test with custom fixtures
 */
export const test = base.extend<TestFixtures>({
  // Twilio mock server fixture
  twilioMock: async ({}, use) => {
    const mockServers = global.__MOCK_SERVERS__;
    if (!mockServers) {
      throw new Error("Mock servers not initialized. Check global-setup.ts");
    }
    
    // Reset before each test
    mockServers.twilioServer.reset();
    
    await use(mockServers.twilioServer);
  },

  // OpenAI mock server fixture
  openaiMock: async ({}, use) => {
    const mockServers = global.__MOCK_SERVERS__;
    if (!mockServers) {
      throw new Error("Mock servers not initialized. Check global-setup.ts");
    }
    
    // Reset before each test
    mockServers.openaiServer.reset();
    
    await use(mockServers.openaiServer);
  },

  // Webhook client fixture
  webhookClient: async ({ request }, use) => {
    const client = createWebhookClient(request);
    await use(client);
  },

  // Test salon fixture
  testSalon: async ({}, use) => {
    const salon = await createTestSalon();
    await use(salon);
    // Cleanup is handled in afterEach
  },

  // Test customer fixture
  testCustomer: async ({ testSalon }, use) => {
    const customer = await createTestCustomer(testSalon.id);
    await use(customer);
    // Cleanup is handled in afterEach
  },

  // API context fixture
  apiContext: async ({ playwright }, use) => {
    const context = await playwright.request.newContext({
      baseURL: process.env.TEST_BASE_URL || "http://localhost:3000",
    });
    await use(context);
    await context.dispose();
  },
});

/**
 * Before each test hook
 */
test.beforeEach(async () => {
  // Clear Redis test data before each test
  await clearAllTestData();
});

/**
 * After each test hook
 */
test.afterEach(async () => {
  // Cleanup database test data
  await cleanupTestData();
  
  // Clear Redis
  await clearRateLimits();
  await clearProcessedMessages();
});

// Re-export expect and other utilities
export { expect };

// Export types
export type { TestSalon, TestCustomer } from "../utils/db-helpers";
export type { WebhookClient } from "../utils/webhook-helpers";
