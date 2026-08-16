import { Page, expect } from "@playwright/test";

/**
 * Drives the real 2-step /auth/register wizard: step 1 collects name/email/
 * password behind a Terms checkbox, step 2 is a role-card picker that only
 * then reveals the "Create Account" submit. Mirrors src/app/auth/register.
 */
export async function registerAs(
  page: Page,
  opts: { name: string; email: string; password: string; role: "engineer" | "company" }
) {
  await page.goto("/auth/register");
  await page.locator("#fullName").fill(opts.name);
  await page.locator("#regEmail").fill(opts.email);
  await page.locator("#regPassword").fill(opts.password);
  await page.getByLabel(/i agree to the terms/i).check();
  await page.getByRole("button", { name: /^continue$/i }).click();

  const roleName = opts.role === "engineer" ? /i am a professional/i : /i am hiring/i;
  await page.getByRole("button", { name: roleName }).click();
  await page.getByRole("button", { name: /create account/i }).click();
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
