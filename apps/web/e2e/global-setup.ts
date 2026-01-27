import { FullConfig } from "@playwright/test";
import { startMockServers, MockServers } from "./mocks/mock-servers";
import { setupTestDatabase } from "./utils/db-helpers";
import { setupTestRedis } from "./mocks/redis-test-utils";

// Store mock servers globally for teardown
declare global {
  var __MOCK_SERVERS__: MockServers | undefined;
}

/**
 * Global setup for E2E tests
 * 
 * Responsibilities:
 * 1. Start mock servers (Twilio, OpenAI)
 * 2. Setup test database with seed data
 * 3. Setup test Redis instance
 * 4. Set environment variables for tests
 */
async function globalSetup(config: FullConfig): Promise<void> {
  console.log("\n🚀 Starting E2E test setup...\n");

  try {
    // 1. Start mock servers
    console.log("📡 Starting mock servers...");
    const mockServers = await startMockServers();
    global.__MOCK_SERVERS__ = mockServers;
    console.log(`   ✓ Twilio mock: http://localhost:${mockServers.twilioPort}`);
    console.log(`   ✓ OpenAI mock: http://localhost:${mockServers.openaiPort}`);

    // 2. Setup test database
    console.log("\n🗄️  Setting up test database...");
    await setupTestDatabase();
    console.log("   ✓ Test database ready");

    // 3. Setup test Redis
    console.log("\n📮 Setting up test Redis...");
    await setupTestRedis();
    console.log("   ✓ Test Redis ready");

    // 4. Set environment variables
    process.env.TWILIO_MOCK_URL = `http://localhost:${mockServers.twilioPort}`;
    process.env.OPENAI_MOCK_URL = `http://localhost:${mockServers.openaiPort}`;
    process.env.TWILIO_SKIP_VALIDATION = "true";
    (process.env as { NODE_ENV: string }).NODE_ENV = "test";

    console.log("\n✅ E2E test setup complete!\n");
  } catch (error) {
    console.error("\n❌ E2E test setup failed:", error);
    throw error;
  }
}

export default globalSetup;
