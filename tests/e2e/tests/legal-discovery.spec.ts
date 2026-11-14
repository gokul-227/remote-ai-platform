import { test, expect } from "@playwright/test";

for (const [path, title] of [["privacy", "Privacy notice"], ["terms", "Terms of use"], ["impressum", "Legal notice"]]) {
  test(`${path} is public HTML with the supplied operator details`, async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto(`/${path}`);
    await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
    await expect(page.getByText("Remote-AI-Platform", { exact: false }).first()).toBeVisible();
    const emails = (await page.locator("main").innerText()).match(/[a-z0-9._%+-]+@remoteaiplatform\.com/gi) ?? [];
    expect([...new Set(emails)]).toEqual(["contact@remoteaiplatform.com"]);
    if (path !== "terms") await expect(page.getByText(/Schoneweide, Berlin - 12439/)).toBeVisible();
    await context.close();
  });
}

test("legacy private navigation pages opt out of indexing", async ({ request }) => {
  const response = await request.get("/settings");
  expect(await response.text()).toMatch(/name="robots"[^>]*content="noindex, nofollow"/);
});
