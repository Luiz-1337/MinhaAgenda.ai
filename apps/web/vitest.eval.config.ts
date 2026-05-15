/**
 * Vitest config for the golden-conversation eval suite.
 *
 * Differs from vitest.config.ts in three ways:
 *   1. Picks ONLY files ending with `.eval.ts` (not `.test.ts`)
 *   2. No setupFiles — eval needs the real DB, Redis, OpenAI (no mocks)
 *   3. Long timeouts — AI calls + DB cleanup take seconds
 *
 * Run with: `pnpm eval` (defined in package.json)
 */

import { defineConfig } from "vitest/config"
import path from "path"

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["__tests__/eval/**/*.eval.ts"],
    exclude: ["node_modules", ".next"],
    // IMPORTANT: no setupFiles here. The main vitest setup mocks
    // @repo/db, @/lib/infra/redis and the logger. The eval must hit the
    // real services, so we start clean.
    testTimeout: 5 * 60_000, // 5 min per conversation
    hookTimeout: 30_000,
    // Sequential to keep DB cleanup and Redis state deterministic.
    pool: "forks",
    poolOptions: {
      forks: { singleFork: true },
    },
    // Eval runs are opt-in. Never report flaky retries silently.
    retry: 0,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./"),
      "@/lib": path.resolve(__dirname, "./lib"),
      "@/app": path.resolve(__dirname, "./app"),
    },
  },
})
