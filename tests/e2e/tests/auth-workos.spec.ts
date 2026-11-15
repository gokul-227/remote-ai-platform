import { expect, test } from "@playwright/test";
import { API, signIn, signUp, tokenOf, unique } from "./support";

/**
 * WorkOS AuthKit sign-in (the migration target), against ../mock-workos. Runs
 * only on the WorkOS stack (docker-compose.e2e-workos.yml, E2E_AUTH_PROVIDER=workos);
 * the default suite keeps covering the Supabase path. Same screens, same copy:
 * the signUp/signIn helpers are shared with the Supabase journeys.
 */
test.skip(process.env.E2E_AUTH_PROVIDER !== "workos", "WorkOS stack only");

const MOCK_WORKOS = process.env.E2E_WORKOS_URL || "http://localhost:9998";

test("email code sign-up, refresh, sign-out and sign-in with WorkOS", async ({ page, request }) => {
  const email = unique("wos-member");
  await signUp(page, { as: "professional", name: "Wendy Os", email });
  const token = await tokenOf(page);
  expect(JSON.parse(atob(token.split(".")[1])).iss).toContain("/user_management/");
  const me = await request.get(`${API}/api/v1/auth/me`, { headers: { Authorization: `Bearer ${token}` } });
  expect(me.status()).toBe(200);
  expect((await me.json()).email).toBe(email);

  // An expired/invalid access token is refreshed silently through the API.
  await page.evaluate(() => localStorage.setItem("remote_ai_platform_token", "expired.token.value"));
  await page.goto("/#settings");
  await expect(page.getByRole("main").getByRole("button", { name: "Privacy", exact: true })).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem("remote_ai_platform_token")))
    .not.toBe("expired.token.value");
  const refreshToken = await page.evaluate(() => localStorage.getItem("remote_ai_platform_refresh_token"));
  expect(refreshToken).toBeTruthy();

  await page.getByRole("button", { name: "Your account" }).click();
  await page.getByRole("button", { name: /sign out/i }).click();
  await expect(page).toHaveURL(/#login/);
  expect(await page.evaluate(() => localStorage.getItem("remote_ai_platform_refresh_token"))).toBeNull();
  // The WorkOS session was revoked: its refresh token no longer works.
  const stale = await request.post(`${API}/api/v1/auth/workos/refresh`, { data: { refresh_token: refreshToken } });
  expect(stale.status()).toBe(401);

  await signIn(page, email);
  const again = await request.get(`${API}/api/v1/auth/me`, {
    headers: { Authorization: `Bearer ${await tokenOf(page)}` },
  });
  expect((await again.json()).id).toBe((await me.json()).id);
});

test("a wrong code is refused with the app's own message", async ({ page }) => {
  await page.goto("/#login");
  await page.getByLabel("Email address").fill(unique("wos-wrong"));
  await page.getByRole("button", { name: /email me a sign-in code/i }).click();
  await page.locator("#code").fill("000000");
  await page.getByRole("button", { name: /verify/i }).click();
  await expect(page.getByText(/wrong or has expired/i)).toBeVisible();
});

test("Google sign-in through AuthKit lands on the app", async ({ page }) => {
  await page.goto("/#login");
  await page.getByRole("button", { name: "Google", exact: true }).click();
  await expect(page).not.toHaveURL(/auth\/callback|#login/, { timeout: 20_000 });
  const me = await page.evaluate(async (api) => {
    const r = await fetch(`${api}/api/v1/auth/me`, {
      headers: { Authorization: `Bearer ${localStorage.getItem("remote_ai_platform_token")}` },
    });
    return r.json();
  }, API);
  expect(me.email).toBe("oauth-member@example.com");
});

test("deleting the account erases the WorkOS user and refuses the old session", async ({ page, request }) => {
  const email = unique("wos-leaver");
  await signUp(page, { as: "professional", name: "Lee Ver", email });
  const token = await tokenOf(page);
  await page.goto("/#settings");
  await page.getByRole("main").getByRole("button", { name: "Privacy", exact: true }).click();
  await page.getByRole("button", { name: "Delete my account" }).click();
  const dialog = page.getByRole("dialog", { name: "Delete your account?" });
  await dialog.getByLabel("Type DELETE to confirm").fill("DELETE");
  await dialog.getByRole("button", { name: "Delete my account" }).click();
  await expect(page).toHaveURL(/#login/);
  expect((await request.get(`${API}/api/v1/auth/me`, { headers: { Authorization: `Bearer ${token}` } })).status()).toBe(
    401,
  );
  const left = await request.get(`${MOCK_WORKOS}/user_management/users?email=${encodeURIComponent(email)}`, {
    headers: { Authorization: "Bearer sk_test_e2e_mock" },
  });
  expect((await left.json()).data).toEqual([]);
});
