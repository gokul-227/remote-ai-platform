import { test, expect } from "@playwright/test";
import { loginWithOtp } from "./helpers";

// Real E2E journey against the live stack: log in as the seeded admin user
// and confirm the dashboard renders real backend-driven data.
// Requires `python -m app.scripts.seed_data` to have been run against the
// stack under test (creates admin@workmesh.ai, confirmed in Supabase Auth).
// Login is passwordless OTP -- see loginWithOtp() in helpers.ts for how a
// real, verifiable code is minted via the Supabase Admin API in place of an
// inbox no CI run has access to.
test("admin can log in and view platform stats, users, and sync status", async ({ page }) => {
  await loginWithOtp(page, "admin@workmesh.ai");

  await expect(page).not.toHaveURL(/\/auth\/login$/, { timeout: 30_000 });

  await page.goto("/admin/dashboard");
  await page.waitForLoadState("networkidle");

  await expect(page.getByText(/registered professionals/i)).toBeVisible();
  await expect(page.getByText(/organizations/i).first()).toBeVisible();

  // The dashboard should not be showing a hard failure state.
  await expect(page.locator("body")).not.toContainText(/unexpected error/i);
});

test("a non-admin engineer cannot reach admin data via the API", async ({ request }) => {
  // Production (and this suite, to match it) verifies Supabase-issued JWTs
  // exclusively -- the old backend-local /auth/register + /auth/login issue
  // tokens the API no longer accepts, which is what previously turned this
  // into a 401 instead of the 403 the test is actually checking for. Create
  // and confirm the user directly against Supabase Auth instead, the same
  // way the CI "Seed demo data" step provisions admin@workmesh.ai.
  const email = `e2e-nonadmin-${Date.now()}@example.com`;
  const password = "e2eTestPassword123";

  const apiBase = process.env.E2E_API_URL || "http://localhost:8000/api/v1";
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!supabaseUrl || !supabaseServiceRoleKey || !supabaseAnonKey) {
    throw new Error("SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY must be set for this test");
  }

  const createRes = await request.post(`${supabaseUrl}/auth/v1/admin/users`, {
    headers: {
      apikey: supabaseServiceRoleKey,
      Authorization: `Bearer ${supabaseServiceRoleKey}`,
    },
    data: { email, password, email_confirm: true },
  });
  expect(createRes.ok()).toBeTruthy();

  const tokenRes = await request.post(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    headers: { apikey: supabaseAnonKey },
    data: { email, password },
  });
  expect(tokenRes.ok()).toBeTruthy();
  const { access_token } = await tokenRes.json();

  const adminRes = await request.get(`${apiBase}/admin/stats`, {
    headers: { Authorization: `Bearer ${access_token}` },
  });
  expect(adminRes.status()).toBe(403);
});
