import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { signUp, unique } from "./support";

/**
 * Every signed-in screen at phone to desktop widths: no horizontal page
 * scrolling, and no serious/critical WCAG 2.2 AA violations. (Public screens
 * are covered by accessibility.spec.ts.)
 */
const PROFESSIONAL = ["feed", "jobs", "recs", "applications", "saved", "search", "profile", "settings", "security", "network", "messenger", "notifications", "groups", "engineers", "companies", "contracts", "projects", "work", "taskmarket", "submissions", "worklog", "earnings", "help"];
const ORGANISATION = ["codash", "coprofile", "postjob", "cojobs", "candidates", "talent", "ride", "copayments", "reviews", "quality", "workspace"];

async function check(page: Page, routes: string[]) {
  const problems: string[] = [];
  for (const width of [320, 375, 768, 1280]) {
    for (const route of routes) {
      // Tall viewport for the axe pass so fixed bars don't "obscure" targets mid-page.
      await page.setViewportSize({ width, height: width === 320 || width === 1280 ? 2000 : 800 });
      await page.goto(`/#${route}`);
      await page.waitForLoadState("networkidle");
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      if (overflow > 1) problems.push(`${route}@${width}: scrolls horizontally by ${overflow}px`);
      if (width === 320 || width === 1280) {
        const res = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
        for (const v of res.violations.filter((x) => x.impact === "serious" || x.impact === "critical")) {
          problems.push(`${route}@${width}: ${v.id} (${v.nodes.length}) e.g. ${v.nodes[0]?.target.join(" ")}`);
        }
      }
    }
  }
  expect(problems).toEqual([]);
}

test.describe.configure({ timeout: 300_000 });

test("professional screens fit every width and pass WCAG AA scans", async ({ page }) => {
  await signUp(page, { as: "professional", name: "Resp Pro", email: unique("resp-pro") });
  await check(page, PROFESSIONAL);
});

test("organisation screens fit every width and pass WCAG AA scans", async ({ page }) => {
  await signUp(page, { as: "organisation", name: "Resp Org", email: unique("resp-org") });
  await check(page, ORGANISATION);
});
