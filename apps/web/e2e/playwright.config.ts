import { defineConfig, devices } from "@playwright/test";
import path from "path";

/**
 * Playwright configuration for E2E tests
 * 
 * Features:
 * - API testing for webhook endpoints
 * - Sequential execution to avoid DB conflicts
 * - Global setup/teardown for mocks and DB
 * - Custom base URL for local testing
 */
export default defineConfig({
  // Test directory
  testDir: "./tests",

  // Global setup and teardown
  globalSetup: path.resolve(__dirname, "./global-setup.ts"),
  globalTeardown: path.resolve(__dirname, "./global-teardown.ts"),

  // Test timeout
  timeout: 30000,

  // Expect timeout
  expect: {
    timeout: 5000,
  },

  // Retry failed tests once
  retries: process.env.CI ? 2 : 1,

  // Run tests sequentially to avoid DB conflicts
  workers: 1,

  // Fail the build on CI if you accidentally left test.only in the source code
  forbidOnly: !!process.env.CI,

  // Reporter configuration
  reporter: process.env.CI
    ? [["html", { open: "never" }], ["github"]]
    : [["html", { open: "on-failure" }], ["list"]],

  // Shared settings for all projects
  use: {
    // Base URL for API requests
    baseURL: process.env.TEST_BASE_URL || "http://localhost:3000",

    // Collect trace when retrying the failed test
    trace: "on-first-retry",

    // Extra HTTP headers for API requests
    extraHTTPHeaders: {
      Accept: "application/json",
    },
  },

  // Configure projects for different test types
  projects: [
    {
      name: "api",
      testMatch: /.*\.spec\.ts$/,
      use: {
        // No browser needed for API tests
        ...devices["Desktop Chrome"],
      },
    },
  ],

  // Web server configuration - starts Next.js dev server
  webServer: {
    command: "pnpm dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
    env: {
      NODE_ENV: "test",
      TWILIO_SKIP_VALIDATION: "true",
    },
  },
});
