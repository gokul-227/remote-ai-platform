import { expect, test } from "@playwright/test";
import { signUp, unique } from "./support";

const mainNav = (page: import("@playwright/test").Page) => page.getByRole("navigation", { name: "Main navigation" });

test("visitors get public discovery and a way in, not a fake account", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/(#feed)?$|#jobs/);
  await expect(page.getByLabel("Search jobs")).toBeVisible();
  await expect(page.getByRole("button", { name: "Join" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Your account" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Messages" })).toHaveCount(0);
  await expect(mainNav(page).getByRole("button", { name: "Hiring" })).toHaveCount(0);
  await expect(mainNav(page).getByRole("button", { name: "Workspace" })).toHaveCount(0);
});

test("professionals see careers, not hiring; organisations see hiring, not job search", async ({ browser }) => {
  const pro = await (await browser.newContext()).newPage();
  await signUp(pro, { as: "professional", name: "Nav Pro", email: unique("navpro") });
  await expect(mainNav(pro).getByRole("button", { name: "Jobs" })).toBeVisible();
  await expect(mainNav(pro).getByRole("button", { name: "Hiring" })).toHaveCount(0);
  await expect(mainNav(pro).getByRole("button", { name: "Admin" })).toHaveCount(0);

  const org = await (await browser.newContext()).newPage();
  await signUp(org, { as: "organisation", name: "Nav Org", email: unique("navorg") });
  await expect(mainNav(org).getByRole("button", { name: "Hiring" })).toBeVisible();
  await expect(mainNav(org).getByRole("button", { name: "Jobs" })).toHaveCount(0);
});
