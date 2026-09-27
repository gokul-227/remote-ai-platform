import { defineConfig } from "@playwright/test";

// Defaults match the isolated stack in docker-compose.e2e.yml.
const baseURL = process.env.E2E_BASE_URL || "http://localhost:13000";

export default defineConfig({
  testDir: "./tests",
  timeout: 90_000,
  fullyParallel: false,
  workers: 1,
  // Journeys are serial and build on each other, so a retry would re-run a
  // step against changed state; failures must be fixed, not retried.
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { browserName: "chromium" },
    },
  ],
});
