import { Page, expect } from "@playwright/test";

/**
 * Registration in production requires confirming a real email (Supabase
 * `mailer_autoconfirm=False`), which the register page surfaces as a "check
 * your email" screen instead of an immediate session -- there's no inbox to
 * check in CI. Create and confirm the user directly via the Supabase Admin
 * API (same pattern as the "Seed demo data" CI step), stash the role/name
 * choice the same way the real register page does, then drive the real
 * /auth/login form -- which already knows how to apply that stashed choice
 * (see applyPendingRegistration in src/lib/supabase.ts).
 */
export async function registerAs(
  page: Page,
  opts: { name: string; email: string; password: string; role: "engineer" | "company" }
) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseServiceRoleKey) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set for registerAs()");
  }

  const createRes = await page.request.post(`${supabaseUrl}/auth/v1/admin/users`, {
    headers: {
      apikey: supabaseServiceRoleKey,
      Authorization: `Bearer ${supabaseServiceRoleKey}`,
    },
    data: {
      email: opts.email,
      password: opts.password,
      email_confirm: true,
      user_metadata: { full_name: opts.name },
    },
  });
  expect(createRes.ok()).toBeTruthy();

  await page.goto("/auth/login");
  await page.evaluate(
    ([email, fullName, role]) => {
      localStorage.setItem("pending_registration", JSON.stringify({ email, fullName, role }));
    },
    [opts.email, opts.name, opts.role === "engineer" ? "ENGINEER" : "COMPANY"]
  );

  await page.locator("#email").fill(opts.email);
  await page.locator("#password").fill(opts.password);
  await page.getByRole("button", { name: /sign in/i }).click();

  // The login page always lands on the role's dashboard, never /onboarding
  // (that redirect only exists on the register page's happy path) -- since
  // the profile hasn't been created yet, go there directly.
  await expect(page).not.toHaveURL(/\/auth\/login$/, { timeout: 30_000 });
  await page.goto("/onboarding");
}

/**
 * Drives the real post-registration /onboarding wizard to completion.
 * Mirrors src/app/onboarding: registration always lands here first (never
 * directly on /engineer/profile or /company/profile) — the wizard itself
 * calls POST /engineers/me or POST /companies/me and then redirects to the
 * role's dashboard.
 */
export async function completeOnboarding(
  page: Page,
  opts:
    | { role: "engineer"; headline: string; skills: string }
    | { role: "company"; name: string; description?: string }
) {
  await expect(page).toHaveURL(/\/onboarding/, { timeout: 30_000 });

  if (opts.role === "engineer") {
    await page.getByText("Manual Setup").click();
    await page.locator("#onboardingHeadline").fill(opts.headline);
    await page.locator("#onboardingSkills").fill(opts.skills);
    await page.getByRole("button", { name: /next: preferences/i }).click();
    const [profileResponse] = await Promise.all([
      page.waitForResponse((res) => res.url().includes("/engineers/me") && res.request().method() === "POST", { timeout: 30_000 }),
      page.getByRole("button", { name: /complete setup/i }).click(),
    ]);
    expect(profileResponse.ok()).toBeTruthy();
    await expect(page).toHaveURL(/\/engineer\/dashboard/, { timeout: 30_000 });
  } else {
    await page.locator("#compName").fill(opts.name);
    await page.getByRole("button", { name: /next: organization profile/i }).click();
    if (opts.description) {
      await page.getByPlaceholder(/what does your organization build/i).fill(opts.description);
    }
    await page.getByRole("button", { name: /next: final review/i }).click();
    const [profileResponse] = await Promise.all([
      page.waitForResponse((res) => res.url().includes("/companies/me") && res.request().method() === "POST", { timeout: 30_000 }),
      page.getByRole("button", { name: /finish setup/i }).click(),
    ]);
    expect(profileResponse.ok()).toBeTruthy();
    await expect(page).toHaveURL(/\/company\/dashboard/, { timeout: 30_000 });
  }
}
