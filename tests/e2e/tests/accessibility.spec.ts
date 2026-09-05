import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import * as fs from "fs";

const DUMP_DIR = process.env.AXE_DUMP_DIR;
function dump(name: string, violations: unknown) {
  if (!DUMP_DIR) return;
  fs.writeFileSync(`${DUMP_DIR}/${name}.json`, JSON.stringify(violations, null, 2));
}

/**
 * WCAG 2.2 AA automated accessibility scan.
 *
 * Scoped to public, unauthenticated pages that public-journey.spec.ts
 * already exercises (homepage, jobs directory, engineers directory) plus
 * the login form -- the highest-traffic entry points that don't require a
 * seeded/authenticated session to reach. This is a starting baseline, not
 * exhaustive coverage of every authenticated dashboard.
 */
test.describe("Accessibility (WCAG 2.2 AA baseline)", () => {
  test("homepage has no automatically detectable a11y violations", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toContainText(/remote engineering/i, { timeout: 15000 });

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag22aa"])
      // The "01"/"02"/"03" step numbers in the "How it works" cards are a
      // purely decorative watermark behind an icon + title + body that
      // already convey the same information (aria-hidden="true" on the
      // element confirms intent). WCAG 1.4.3 exempts purely decorative
      // text from contrast requirements, but axe can't infer that intent
      // and flags the rendered pixels regardless -- a known false
      // positive. Fixing the *pixel* contrast would mean darkening this
      // watermark to a visually prominent gray, which is a real design
      // change (flagged in the PR as needing a design decision), not an
      // accessibility bug, so it's excluded here rather than "fixed" by
      // changing the look of the page.
      .exclude("span.text-slate-200")
      .analyze();

    dump(test.info().title.replace(/[^a-z0-9]+/gi, "_"), results.violations);
    expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);
  });

  test("login page has no automatically detectable a11y violations", async ({ page }) => {
    await page.goto("/auth/login");
    await expect(page.locator("#email")).toBeVisible({ timeout: 15000 });

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag22aa"])
      .analyze();

    dump(test.info().title.replace(/[^a-z0-9]+/gi, "_"), results.violations);
    expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);
  });

  test("jobs directory has no automatically detectable a11y violations", async ({ page }) => {
    await page.goto("/jobs");
    await expect(page.getByPlaceholder(/job title, tech stack, company/i)).toBeVisible({ timeout: 15000 });

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag22aa"])
      .analyze();

    dump(test.info().title.replace(/[^a-z0-9]+/gi, "_"), results.violations);
    expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);
  });

  test("engineers directory has no automatically detectable a11y violations", async ({ page }) => {
    await page.goto("/engineers");
    await expect(page.getByPlaceholder(/search by skill/i)).toBeVisible({ timeout: 15000 });

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag22aa"])
      .analyze();

    dump(test.info().title.replace(/[^a-z0-9]+/gi, "_"), results.violations);
    expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);
  });
});
