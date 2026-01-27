import { FullConfig } from "@playwright/test";
import { stopMockServers } from "./mocks/mock-servers";
import { cleanupTestDatabase } from "./utils/db-helpers";
let cleanupTestRedis: () => Promise<void>;
try {
  cleanupTestRedis = require("./mocks/redis-test-utils").cleanupTestRedis;
} catch (err) {
  cleanupTestRedis = async () => {
    console.warn("Warning: cleanupTestRedis could not be loaded. Skipping Redis cleanup.");
  };
}

/**
 * Global teardown for E2E tests
 * 
 * Responsibilities:
 * 1. Stop mock servers
 * 2. Cleanup test database
 * 3. Cleanup test Redis
 */
async function globalTeardown(config: FullConfig): Promise<void> {
  console.log("\n🧹 Starting E2E test teardown...\n");

  try {
    // 1. Stop mock servers
    console.log("📡 Stopping mock servers...");
    if (global.__MOCK_SERVERS__) {
      await stopMockServers(global.__MOCK_SERVERS__);
      console.log("   ✓ Mock servers stopped");
    }

    // 2. Cleanup test database
    console.log("\n🗄️  Cleaning up test database...");
    await cleanupTestDatabase();
    console.log("   ✓ Test database cleaned");

    // 3. Cleanup test Redis
    console.log("\n📮 Cleaning up test Redis...");
    await cleanupTestRedis();
    console.log("   ✓ Test Redis cleaned");

    console.log("\n✅ E2E test teardown complete!\n");
  } catch (error) {
    console.error("\n⚠️  E2E test teardown warning:", error);
    // Don't throw - teardown errors shouldn't fail the test run
  }
}

export default globalTeardown;
