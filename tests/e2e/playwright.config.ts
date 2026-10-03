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
    // Cross-engine proof for Safari and Firefox users (TEST-01): the
    // self-contained public, sign-in and navigation specs. The stateful
    // journey suite stays on Chromium.
    // One retry here only: these specs are self-contained (fresh users, no
    // shared state), unlike the strict no-retry Chromium journeys. A Firefox-
    // only race (a click on the just-mounted sign-in form sometimes sends
    // nothing; traces show no request and no error) is under investigation as
    // TEST-02; a real, consistent failure still fails both attempts.
    ...(["webkit", "firefox"] as const).map((browserName) => ({
      name: browserName,
      use: { browserName },
      testMatch: ["figma-smoke.spec.ts", "navigation.spec.ts"],
      retries: 1,
    })),
  ],
});
