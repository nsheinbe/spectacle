import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

const root = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@": resolve(root, "src"),
    },
  },
  test: {
    include: ["tests/**/*.test.ts"],
    testTimeout: 180_000,
    hookTimeout: 180_000,
    pool: "forks",
  },
});
