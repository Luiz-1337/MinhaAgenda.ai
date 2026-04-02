import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    environment: "node",
    include: ["__tests__/**/*.test.ts"],
    setupFiles: ["__tests__/setup/vitest.setup.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      include: [
        "src/**/*.ts",
      ],
      exclude: [
        "**/*.d.ts",
        "**/*.test.ts",
        "src/presentation/tools/types.ts",
      ],
    },
    testTimeout: 10_000,
  },
})
