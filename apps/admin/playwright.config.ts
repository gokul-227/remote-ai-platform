import { tmpdir } from "node:os";
import { join } from "node:path";
import { defineConfig } from "@playwright/test";

// A local UI-only regression suite. Every auth/API request is intercepted.
export default defineConfig({
  testDir: "./tests/responsive",
  workers: 1,
  outputDir: join(tmpdir(), "rap-admin-responsive-results"),
  use: { baseURL: "http://127.0.0.1:14322", browserName: "chromium" },
  webServer: {
    command: "npm run dev -- --hostname 127.0.0.1 --port 14322",
    url: "http://127.0.0.1:14322",
    reuseExistingServer: false,
    env: {
      NEXT_PUBLIC_AUTH_PROVIDER: "workos",
      NEXT_PUBLIC_API_URL: "http://127.0.0.1:14322",
      NEXT_PUBLIC_DEPLOY_ENV: "local",
    },
  },
});
