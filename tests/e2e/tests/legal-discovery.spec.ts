import { test, expect } from "@playwright/test";

for (const [path, title] of [
  ["privacy", "Privacy Policy"],
  ["terms", "Terms of Service"],
  ["impressum", "Legal notice"],
  ["legal", "Legal"],
  ["cookies", "Cookie Policy"],
  ["community-guidelines", "Community Guidelines"],
  ["employer-terms", "Job Posting and Employer Terms"],
  ["copyright", "Copyright and Takedown Policy"],
  ["security", "Security Policy"],
  ["accessibility", "Accessibility Statement"],
]) {
  test(`${path} is public HTML with the single public contact address`, async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto(`/${path}`);
    await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
    await expect(page.getByText("Remote AI Platform", { exact: false }).first()).toBeVisible();
    const emails = (await page.locator("main").innerText()).match(/[a-z0-9._%+-]+@remoteaiplatform\.com/gi) ?? [];
    expect([...new Set(emails)]).toEqual(["contact@remoteaiplatform.com"]);
    await context.close();
  });
}

test("security.txt is served with the contact address", async ({ request }) => {
  const response = await request.get("/.well-known/security.txt");
  expect(response.ok()).toBeTruthy();
  expect(await response.text()).toContain("Contact: mailto:contact@remoteaiplatform.com");
});

test("legacy private navigation pages opt out of indexing", async ({ request }) => {
  const response = await request.get("/settings");
  expect(await response.text()).toMatch(/name="robots"[^>]*content="noindex, nofollow"/);
});
