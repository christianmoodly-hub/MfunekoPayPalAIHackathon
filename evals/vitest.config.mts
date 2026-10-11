import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    environment: "node",
    include: ["evals/run.test.ts"],
    silent: false,
    testTimeout: 120_000,
    hookTimeout: 120_000,
  },
});
