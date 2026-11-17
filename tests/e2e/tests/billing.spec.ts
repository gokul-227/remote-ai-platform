import { test, expect } from "@playwright/test";
import { API, signUp, tokenOf, unique } from "./support";

// The e2e stack runs with BILLING_ENABLED=false (the default): nothing is chargeable.
test("pricing is public HTML that says coming soon while billing is off", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto("/pricing");
  await expect(page.getByRole("heading", { name: "Pricing", exact: true })).toBeVisible();
  await expect(page.getByRole("status")).toContainText("coming soon");
  await expect(page.getByRole("link", { name: /^Buy/ })).toHaveCount(0);
  await expect(page.getByText(/final amount you pay/)).toBeVisible();
  await expect(page.getByRole("link", { name: /Paid services/ })).toHaveAttribute("href", "/terms#paid-services");
  await context.close();
});

test("checkout and portal do not exist while billing is off", async ({ page, request }) => {
  await signUp(page, { as: "professional", name: "Billing Off", email: unique("billing-off") });
  const token = await tokenOf(page);
  const headers = { Authorization: `Bearer ${token}` };
  expect((await request.post(`${API}/api/v1/billing/checkout`, { headers, data: { plan: "premium_monthly" } })).status()).toBe(404);
  expect((await request.post(`${API}/api/v1/billing/portal`, { headers })).status()).toBe(404);
  await page.goto("/#billing");
  await expect(page.getByText(/Paid features are coming soon/)).toBeVisible();
});

test("with billing on (mocked API), the Billing tab sends the member to Stripe Checkout", async ({ page }) => {
  await signUp(page, { as: "professional", name: "Billing On", email: unique("billing-on") });
  const item = {
    slug: "premium_monthly", name: "Premium (monthly)", description: "More AI", audience: "member",
    mode: "subscription", price_cents: 900, currency: "eur", billing_interval: "month", duration_days: null,
    target: null, trial_days: 7, is_active: true, entitlements: {},
  };
  await page.route("**/api/v1/billing/catalog", (r) =>
    r.fulfill({ json: { enabled: true, currency: "eur", prices_include_vat: true, items: [item] } }),
  );
  await page.route("**/api/v1/billing/checkout", (r) => r.fulfill({ json: { url: "https://checkout.stripe.test/pay" } }));
  await page.route("https://checkout.stripe.test/**", (r) => r.fulfill({ body: "<h1>Stripe Checkout (mock)</h1>", contentType: "text/html" }));
  await page.goto("/#billing?plan=premium_monthly");
  await expect(page.getByText("€9 / month")).toBeVisible();
  await page.getByRole("button", { name: "Buy" }).first().click();
  await expect(page.getByRole("heading", { name: "Stripe Checkout (mock)" })).toBeVisible();
});
