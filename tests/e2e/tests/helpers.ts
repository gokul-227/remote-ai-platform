import { Page, expect } from "@playwright/test";

/**
 * Login/registration are now passwordless (email OTP) -- there's no inbox to
 * read a real code from in CI, so we fetch a genuine, verifiable OTP
 * ourselves via the Supabase Admin API's `admin/generate_link` endpoint
 * (returns an `email_otp` field alongside the action link; it does NOT send
 * an email, it just mints the same code Supabase would otherwise deliver).
 * We still drive the real login UI (email -> "Send code" -> code input ->
 * "Verify") end to end -- but see loginWithOtp() below for why the UI's own
 * signInWithOtp() *network call* is stubbed out rather than left to hit
 * Supabase for real.
 */
export async function getEmailOtp(
  page: Page,
  email: string,
  type: "signup" | "magiclink" = "magiclink",
  data?: Record<string, unknown>
): Promise<string> {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseServiceRoleKey) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set for getEmailOtp()");
  }
  const res = await page.request.post(`${supabaseUrl}/auth/v1/admin/generate_link`, {
    headers: {
      apikey: supabaseServiceRoleKey,
      Authorization: `Bearer ${supabaseServiceRoleKey}`,
    },
    data: { type, email, ...(data ? { data } : {}) },
  });
  expect(res.ok()).toBeTruthy();
  const body = await res.json();
  const otp = body.email_otp || body.properties?.email_otp;
  if (!otp) throw new Error(`generate_link response had no email_otp: ${JSON.stringify(body)}`);
  return otp as string;
}

/**
 * Drives the real /auth/login OTP UI to a signed-in session for `email`,
 * using getEmailOtp() above to obtain a real, verifiable code instead of
 * reading one from an inbox.
 *
 * The UI's "Send code" button calls Supabase's signInWithOtp(), which hits
 * `POST /auth/v1/otp` and actually sends an email. Supabase's own built-in
 * mailer enforces a very low, project-wide send-rate limit (independent of
 * which address is being emailed), and this suite (like the app's own
 * "Resend code" button) never reads that email anyway -- getEmailOtp() above
 * mints the real, verifiable code we actually type in via the Admin API's
 * `generate_link`, which does NOT count against that send limit. Running the
 * full suite repeatedly exhausts the mailer's quota within minutes and then
 * every single test that logs in fails at this step with a 429
 * `over_email_send_rate_limit` before ever reaching the code input --
 * something that was mistaken for a post-verifyOtp redirect bug until the
 * trace evidence (a captured `POST .../auth/v1/otp` -> 429 network entry)
 * showed the real failure was here, one step earlier. Stubbing out just this
 * one network call keeps the rest of the flow (verifyOtp, /auth/me, the
 * redirect) fully real while making the test hermetic against Supabase's
 * mailer quota.
 */
export async function loginWithOtp(page: Page, email: string, type: "signup" | "magiclink" = "magiclink") {
  await page.route("**/auth/v1/otp", (route) => {
    if (route.request().method() !== "POST") return route.continue();
    return route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
  });

  await page.goto("/auth/login");
  await page.locator("#email").fill(email);
  await page.getByRole("button", { name: /send code/i }).click();
  await expect(page.locator("#code")).toBeVisible({ timeout: 30_000 });

  const otp = await getEmailOtp(page, email, type);
  await page.locator("#code").fill(otp);
  await page.getByRole("button", { name: /verify/i }).click();
}

/**
 * Registration in production requires confirming a real email, which the
 * register page now folds into the OTP verification step itself (no
 * separate confirmation link/screen). Create and confirm the user directly
 * via the Supabase Admin API (same pattern as the "Seed demo data" CI
 * step), stash the role/name choice the same way the real register page
 * does, then drive the real /auth/login OTP form -- which already knows
 * how to apply that stashed choice (see applyPendingRegistration in
 * src/lib/supabase.ts).
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

  await loginWithOtp(page, opts.email);

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
