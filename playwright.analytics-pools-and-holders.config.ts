import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

// Separate immutable corpus: shared cached dashboard URLs never race between
// the existing outage fixtures and the analytics comparison fixtures.
process.env.E2E_ANALYTICS_POOLS_AND_HOLDERS = "1";
if (!base.webServer || Array.isArray(base.webServer))
  throw new Error("Expected one local test server");

export default defineConfig({
  ...base,
  testIgnore: [],
  testMatch: "analytics-pools-and-holders.spec.ts",
  outputDir: "test-results/analytics-pools-and-holders",
  reporter: [
    [process.env.GITHUB_ACTIONS ? "github" : "list"],
    [
      "html",
      {
        open: "never",
        outputFolder: "playwright-report/analytics-pools-and-holders",
      },
    ],
    [
      "json",
      { outputFile: "test-results/analytics-pools-and-holders/results.json" },
    ],
  ],
  webServer: {
    ...base.webServer,
    env: { ...base.webServer.env, E2E_ANALYTICS_POOLS_AND_HOLDERS: "1" },
  },
});
