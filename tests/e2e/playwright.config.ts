import { defineConfig } from "@playwright/test";

const baseURL = process.env.E2E_BASE_URL || "http://localhost:3000";

export default defineConfig({
  testDir: "./tests",
  // Generous on purpose: the company/engineer journeys chain 3-4 sequential
  // API round-trips, and a Render free-tier instance that isn't fully warm
  // can make each one take several seconds — confirmed by direct debugging,
  // not assumed (see docs/ACTUAL_SYSTEM_AUDIT.md).
  timeout: 90_000,
  fullyParallel: false,
  workers: 1,
  // A Render free-tier instance may still be cold or briefly slow between
  // requests within a single test; one retry absorbs that without masking
  // a genuine app failure (retries don't hide a consistently-failing test).
  retries: 1,
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
