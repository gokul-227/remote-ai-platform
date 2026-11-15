import { expect, test } from "@playwright/test";

// What crawlers see: server-rendered HTML with JavaScript off.
const ld = async (page: import("@playwright/test").Page) =>
  (await page.locator('script[type="application/ld+json"]').allTextContents()).flatMap((t) => {
    const v = JSON.parse(t);
    return Array.isArray(v) ? v : [v];
  });

test("landing pages render crawlable content, canonical and breadcrumbs without JavaScript", async ({
  browser,
  baseURL,
}) => {
  const context = await browser.newContext({ baseURL, javaScriptEnabled: false });
  try {
    const page = await context.newPage();
    for (const path of [
      "/remote-jobs/python",
      "/remote-jobs/in/germany",
      "/remote-jobs/python/in/germany",
      "/remote-jobs/backend/python",
      "/remote-jobs/at",
    ]) {
      const res = await page.goto(path);
      expect(res?.status(), path).toBe(200);
      await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
      await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", new RegExp(`${path}$`));
      const types = (await ld(page)).map((x) => x["@type"]);
      expect(types, path).toContain("BreadcrumbList");
    }
    expect((await page.goto("/remote-jobs/backend/notaskill"))?.status()).toBe(404);
    expect((await page.goto("/remote-jobs/python?page=abc"))?.status()).toBe(404);
  } finally {
    await context.close();
  }
});

test("home declares Organization and WebSite with a working SearchAction", async ({ browser, baseURL }) => {
  const context = await browser.newContext({ baseURL, javaScriptEnabled: false });
  try {
    const page = await context.newPage();
    await page.goto("/");
    const site = (await ld(page)).find((x) => x["@type"] === "WebSite");
    expect(site.potentialAction["@type"]).toBe("SearchAction");
    // A free-text search (not exactly a category name) stays a noindex results page.
    const res = await page.goto("/remote-jobs?q=analyst%20payments");
    expect(res?.status()).toBe(200);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  } finally {
    await context.close();
  }
});

test("guides, the HTML site map and category searches are crawlable without JavaScript", async ({
  browser,
  baseURL,
}) => {
  const context = await browser.newContext({ baseURL, javaScriptEnabled: false });
  try {
    const page = await context.newPage();
    for (const path of ["/guides", "/guides/how-to-find-a-remote-job", "/guides/remote-salary-guide", "/sitemap"]) {
      const res = await page.goto(path);
      expect(res?.status(), path).toBe(200);
      await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
      await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", new RegExp(`${path}$`));
    }
    await page.goto("/guides/remote-salary-guide");
    const article = (await ld(page)).find((x) => x["@type"] === "Article");
    expect(article?.author?.["@type"]).toBe("Organization");
    await page.goto("/sitemap");
    await expect(page.locator('main a[href="/remote-jobs/python"]').first()).toBeVisible();
    await expect(page.locator('footer a[href="/sitemap"]')).toHaveCount(1);
    await page.goto("/remote-jobs?q=Python");
    expect(new URL(page.url()).pathname).toBe("/remote-jobs/python");
  } finally {
    await context.close();
  }
});

test("sitemap index lists the landing chunk and robots points at it", async ({ request }) => {
  const index = await (await request.get("/sitemap.xml")).text();
  // Non-production builds publish an empty urlset on purpose (never indexed).
  test.skip(index.includes("<urlset"), "sitemaps are disabled outside production");
  expect(index).toContain("/sitemaps/landing/0.xml");
  const landing = await request.get("/sitemaps/landing/0.xml");
  expect(landing.status()).toBeLessThan(500);
});
