import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.E2E_PORT ?? 3100);
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  failOnFlakyTests: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : 4,
  timeout: 30_000,
  expect: { timeout: 10_000 },
  reporter: [["list"], ["html", { open: "never" }]],
  globalTeardown: "./e2e/support/global-teardown.ts",
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    serviceWorkers: "block",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile-chromium", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: "node ./e2e/support/start-server.mjs",
    url: `${baseURL}/search`,
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      NEXT_DIST_DIR: ".next-e2e",
      NEXT_TELEMETRY_DISABLED: "1",
      NEXT_PUBLIC_HORIZON_URL: "https://horizon.e2e.invalid",
      NEXT_PUBLIC_RPC_URL: "https://rpc.e2e.invalid",
      NEXT_PUBLIC_MAINNET_RPC_URL: "https://rpc.e2e.invalid",
      NEXT_PUBLIC_NETWORK_PASSPHRASE: "Test SDF Network ; September 2015",
      INDEXER_CLICKHOUSE_URL: "https://clickhouse.indexer.e2e.invalid/query",
      INDEXER_API_URL: "https://api.indexer.e2e.invalid",
      INDEXER_USER: "e2e-indexer-user",
      INDEXER_PASSWORD: "e2e-indexer-password",
      E2E_PORT: String(port),
    },
  },
});
