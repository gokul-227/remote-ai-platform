import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

/** Automated WCAG 2.1 A/AA checks on public screens; serious and critical issues fail the build. */
for (const route of ["#login", "#register", "#jobs", "#engineers", "#companies", "#privacy", "#terms", "#help"]) {
  test(`no serious accessibility violations on ${route}`, async ({ page }) => {
    await page.goto(`/${route}`);
    await page.waitForLoadState("networkidle");
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(serious.map((v) => `${v.id}: ${v.help} (${v.nodes.length}) e.g. ${v.nodes[0]?.target.join(" ")}`)).toEqual([]);
  });
}
