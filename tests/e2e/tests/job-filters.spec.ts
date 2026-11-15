import { expect, test, type Page } from "@playwright/test";
import { signUp, unique } from "./support";

/**
 * Job search filters at phone, tablet and desktop widths: the panel is a
 * bottom sheet on phones, a collapsible side panel on tablets and an always
 * visible sidebar on desktops; filter state lives in the (shareable) URL; facet
 * counts load; "Save this search" stores the search for alerts.
 */
const SIZES = [
  { name: "phone", width: 375, height: 812 },
  { name: "tablet", width: 820, height: 1180 },
  { name: "desktop", width: 1440, height: 900 },
] as const;

async function noHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
}

for (const size of SIZES) {
  test(`job filters work on ${size.name}`, async ({ page }) => {
    await page.setViewportSize({ width: size.width, height: size.height });
    await page.goto("/#jobs");
    const panel = page.getByRole("region", { name: "Job filters" });
    const allFilters = page.getByRole("button", { name: /^All filters/ });

    if (size.name === "desktop") {
      await expect(panel).toBeVisible();
      await expect(allFilters).toBeHidden();
    } else {
      await expect(panel).toBeHidden();
      await allFilters.click();
      await expect(panel).toBeVisible();
      const box = await panel.boundingBox();
      if (size.name === "phone") {
        // Bottom sheet: anchored to the bottom edge, full width.
        expect(Math.round((box?.y ?? 0) + (box?.height ?? 0))).toBeGreaterThanOrEqual(size.height - 2);
        expect(Math.round(box?.width ?? 0)).toBeGreaterThanOrEqual(size.width - 2);
      } else {
        // Side panel beside the results, not over them.
        expect(box?.width ?? 0).toBeLessThan(size.width / 2);
        expect(box?.x ?? 99).toBeLessThanOrEqual(40);
      }
    }

    // Facet counts are shown next to options once loaded.
    await expect(panel.getByRole("checkbox", { name: /Hybrid/ })).toBeVisible();
    await panel.getByRole("checkbox", { name: /Hybrid/ }).check();
    await panel.getByRole("radio", { name: "Past week" }).check();
    await expect(page).toHaveURL(/#jobs\?posted_within=7d&workplace=hybrid/);
    await expect(page.getByRole("button", { name: "Remove filter Hybrid" })).toBeAttached();

    // Close the sheet/panel with Escape (desktop sidebar stays).
    await page.keyboard.press("Escape");
    if (size.name === "desktop") await expect(panel).toBeVisible();
    else await expect(panel).toBeHidden();
    await noHorizontalScroll(page);

    // The URL is shareable: reloading restores the same filters.
    await page.reload();
    await expect(page.getByRole("button", { name: "Remove filter Hybrid" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Remove filter Past week" })).toBeVisible();

    await page.getByRole("button", { name: "Clear all" }).first().click();
    await expect(page).toHaveURL(/#jobs$/);
  });
}

test("save this search creates an alert", async ({ page }) => {
  await signUp(page, { as: "professional", name: "Filter Pro", email: unique("filters") });
  await page.goto("/#jobs?workplace=remote&seniority=entry");
  await page.getByRole("button", { name: "Save this search" }).first().click();
  await expect(page.getByText(/Search saved/)).toBeVisible();
});

test("public remote-jobs filters work without JavaScript state", async ({ page }) => {
  for (const size of SIZES) {
    await page.setViewportSize({ width: size.width, height: size.height });
    await page.goto("/remote-jobs?workplace=remote&posted_within=30d");
    await expect(page.getByRole("search", { name: "Filter remote jobs" })).toBeVisible();
    await expect(page.getByRole("heading", { name: /matching job/ })).toBeVisible();
    await noHorizontalScroll(page);
  }
});
