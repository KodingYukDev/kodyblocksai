import { defineConfig } from "vitest/config";
import { kodyAliases } from "./aliases";

export default defineConfig({
  resolve: { alias: kodyAliases },
  test: {
    include: [
      "packages/**/*.test.ts",
      "packages/**/*.test.tsx",
      "app/**/*.test.ts",
      "app/**/*.test.tsx",
      "tests/parity/**/*.test.ts",
      "scripts/**/*.test.ts",
    ],
    environment: "node",
    // Tes yang butuh DOM menulis `// @vitest-environment jsdom` di baris pertama file.
    testTimeout: 20000,
  },
});
