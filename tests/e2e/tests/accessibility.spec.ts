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

test("the main menu is a keyboard-operable dialog", async ({ page }) => {
  await page.goto("/#jobs");
  const trigger = page.locator(".rap-tools").getByRole("button", { name: "Menu" });
  await trigger.focus();
  await page.keyboard.press("Enter");
  const menu = page.getByRole("dialog", { name: "Product menu" });
  await expect(menu).toBeVisible();
  // Focus moved into the menu and stays there.
  await expect.poll(() => menu.evaluate((el) => el.contains(document.activeElement))).toBe(true);
  for (let i = 0; i < 40; i++) await page.keyboard.press("Tab");
  expect(await menu.evaluate((el) => el.contains(document.activeElement))).toBe(true);
  // Escape closes it and returns focus to the button that opened it.
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
  await expect(trigger).toBeFocused();
});
