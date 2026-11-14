import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { expectNoHorizontalOverflow, signUp, unique } from "./support";

const JOB_ID = "72dc0e59-c37c-41bc-8b1e-fd5acc13ba13";
const SOURCE_URL = "https://employer.example/jobs/remote-analyst";

// Check actual crawler-visible HTML independently of client hydration.
test("homepage discovery and signup links render without JavaScript", async ({ browser, baseURL }) => {
  const context = await browser.newContext({ baseURL, javaScriptEnabled: false });
  try {
    const page = await context.newPage();
    const response = await page.goto("/");
    expect(response?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(/Connect\. Find work\.\s*Get work done\./);
    await expect(page.getByRole("link", { name: "Create your free account", exact: true })).toHaveAttribute(
      "href",
      /^\/?#register$/,
    );
    await expect(page.getByRole("link", { name: "Explore remote jobs", exact: true })).toHaveAttribute(
      "href",
      "/remote-jobs",
    );
    await expect(page.getByRole("link", { name: "Python jobs", exact: true })).toHaveAttribute(
      "href",
      "/remote-jobs/python",
    );
    await expect(page.getByRole("img", { name: "Remote AI Platform" }).first()).toBeVisible();
    await expect(page.locator('link[rel="canonical"]')).toHaveCount(1);
  } finally {
    await context.close();
  }
});

test("homepage signup opens the real registration form and back returns to discovery", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Create your free account", exact: true }).click();
  await expect(page).toHaveURL(/\/#register$/);
  await expect(page.getByRole("heading", { name: "Create your account", exact: true })).toBeVisible();
  await expect(page.getByLabel("Full name", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Email address", { exact: true })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/Connect\. Find work\.\s*Get work done\./);
  await page.getByRole("link", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Welcome back", exact: true })).toBeVisible();
});

test("public discovery fits narrow phones through desktop widths", async ({ page }) => {
  for (const width of [320, 375, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await expect(page.getByRole("link", { name: "Join free", exact: true })).toBeVisible();
  }
});

test("an imported job retains source attribution and applies externally without signup", async ({ page, context }) => {
  // Owned synthetic API data keeps this check independent of external boards.
  await page.route(`**/api/v1/jobs/${JOB_ID}*`, (route) =>
    route.fulfill({
      json: {
        id: JOB_ID,
        title: "Remote Data Analyst",
        company_name: "Example Employer",
        description: "Analyse research data for a distributed team.",
        source: "ARBEITNOW",
        external_url: SOURCE_URL,
        company_id: null,
        location: "Remote (Germany)",
        is_remote: true,
        job_type: "full_time",
        experience_level: "mid",
        skills: ["SQL"],
        posted_at: "2026-11-05T10:00:00Z",
        expired_at: null,
      },
    }),
  );
  await context.route("https://employer.example/**", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<h1>Example employer application</h1>",
    }),
  );
  await page.goto(`/#jobdetail/${JOB_ID}`);
  await expect(page.getByRole("heading", { name: "Remote Data Analyst", exact: true })).toBeVisible();
  const original = page.getByRole("link", { name: "Arbeitnow — original listing", exact: true });
  await expect(original).toHaveAttribute("href", SOURCE_URL);
  await expect(original).toHaveAttribute("rel", /noopener/);
  const popup = page.waitForEvent("popup");
  await page.getByRole("button", { name: "Apply on original site", exact: true }).click();
  const employer = await popup;
  await expect(employer).toHaveURL(SOURCE_URL);
  await expect(employer.getByRole("heading", { name: "Example employer application" })).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`#jobdetail/${JOB_ID}$`));
  expect(await page.evaluate(() => localStorage.getItem("remote_ai_platform_token"))).toBeNull();
  await employer.close();
});

test("returning signed-in members retain their workspace on the root address", async ({ page }) => {
  await signUp(page, { as: "professional", name: "Discovery Member", email: unique("discovery") });
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Your account", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Create your free account", exact: true })).toHaveCount(0);
});

test("homepage has no serious or critical WCAG AA violations", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  const serious = results.violations.filter(
    (violation) => violation.impact === "serious" || violation.impact === "critical",
  );
  expect(serious.map((violation) => `${violation.id}: ${violation.help}`)).toEqual([]);
});

// A blocked site must keep its own origin/CSP rather than being fetched and
// rewritten through our API under the platform's trusted origin.
test("project demo preview uses the original HTTPS origin without a backend proxy", async ({ page, context }) => {
  await signUp(page, { as: "professional", name: "Demo Reviewer", email: unique("demo-reviewer") });
  const previewUrl = "https://demo.example.com/project";
  await context.route("https://demo.example.com/**", (route) => route.fulfill({
    contentType: "text/html", body: "<h1>Owned project demo</h1>",
  }));
  const proxyRequests: string[] = [];
  page.on("request", (request) => {
    if (/\/api\/v1\/browser\/(?:proxy|fetch)/.test(request.url())) proxyRequests.push(request.url());
  });
  await page.goto("/#browser");
  await page.getByLabel("Address", { exact: true }).fill(previewUrl);
  await page.getByRole("button", { name: "Go", exact: true }).click();
  const frame = page.locator('iframe[title="Web page"]');
  await expect(frame).toHaveAttribute("src", previewUrl);
  await expect(frame).toHaveAttribute("sandbox", "allow-scripts allow-forms allow-popups");
  await expect(frame).toHaveAttribute("referrerpolicy", "no-referrer");
  await expect(page.getByRole("link", { name: "Open in new tab", exact: true })).toHaveAttribute("href", previewUrl);
  await expect(page.getByText(/preview respects the site’s security settings/)).toBeVisible();
  expect(proxyRequests).toEqual([]);
});
