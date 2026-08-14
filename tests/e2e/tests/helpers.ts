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

  const roleName = opts.role === "engineer" ? /i am an engineer/i : /i am hiring/i;
  await page.getByRole("button", { name: roleName }).click();
  await page.getByRole("button", { name: /create account/i }).click();
}
