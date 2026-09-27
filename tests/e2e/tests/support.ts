import { execFileSync } from "node:child_process";
import { expect, type APIRequestContext, type Page } from "@playwright/test";

/**
 * Journeys run against the isolated E2E stack (docker-compose.e2e.yml) whose
 * API verifies tokens from the mock Supabase Auth in ../mock-supabase. Every
 * sign-in code is E2E_OTP_CODE. Nothing here touches a real Supabase project,
 * real email, or production.
 */
export const API = process.env.E2E_API_URL || "http://localhost:18000";
export const OTP = process.env.E2E_OTP_CODE || "123456";
const PG = process.env.E2E_POSTGRES_CONTAINER || "rap-e2e-postgres";

export const unique = (prefix: string) => `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e4)}@example.com`;

/** Sign up through the real registration UI. */
export async function signUp(page: Page, opts: { as: "professional" | "organisation"; name: string; email: string }) {
  await page.goto("/#register");
  await page.getByRole("button", { name: opts.as === "professional" ? "Find work" : "Hire talent" }).click();
  await page.getByLabel("Full name").fill(opts.name);
  await page.getByLabel("Email address").fill(opts.email);
  await page.getByRole("button", { name: /email me a sign-up code/i }).click();
  await page.locator("#code").fill(OTP);
  await page.getByRole("button", { name: /verify/i }).click();
  await expect(page).toHaveURL(opts.as === "professional" ? /#onboarding/ : /#coprofile/, { timeout: 20_000 });
}

/** Sign in through the real sign-in UI. */
export async function signIn(page: Page, email: string) {
  await page.goto("/#login");
  await page.getByLabel("Email address").fill(email);
  await page.getByRole("button", { name: /email me a sign-in code/i }).click();
  await page.locator("#code").fill(OTP);
  await page.getByRole("button", { name: /verify/i }).click();
  await expect(page).not.toHaveURL(/#login/, { timeout: 20_000 });
}

/** The signed-in session's bearer token, as the app stored it. */
export async function tokenOf(page: Page): Promise<string> {
  const token = await page.evaluate(() => localStorage.getItem("remote_ai_platform_token"));
  expect(token, "expected a signed-in session").toBeTruthy();
  return token as string;
}

export async function apiAs(request: APIRequestContext, page: Page, method: "get" | "post" | "patch" | "put" | "delete", path: string, data?: unknown) {
  const token = await tokenOf(page);
  return request[method](`${API}/api/v1${path}`, { headers: { Authorization: `Bearer ${token}` }, data });
}

/** Administrators are promoted in the database, exactly as in production. */
export function promoteToAdmin(email: string) {
  execFileSync("docker", ["exec", PG, "psql", "-U", "remote_ai_platform", "-d", "remote_ai_platform", "-c", `UPDATE users SET role='ADMIN' WHERE email='${email.replace(/'/g, "")}'`]);
}

/** No horizontal scrolling at the current viewport width. */
export async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, "page scrolls horizontally").toBeLessThanOrEqual(1);
}
