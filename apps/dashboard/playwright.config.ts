import { defineConfig, devices } from "@playwright/test";

/**
 * E2E smoke config. Requires a running dashboard dev server and a reachable
 * control-plane (localhost:3000) for full flows. The smoke test intentionally
 * degrades gracefully: it asserts the login shell renders and, after sign-in,
 * the app shell mounts even if backend queries error.
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 30000,
  expect: { timeout: 10000 },
  fullyParallel: true,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:5174",
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run dev -- --port 5174 --strictPort",
    port: 5174,
    reuseExistingServer: true,
    timeout: 60000,
  },
});
