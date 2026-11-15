import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { OTP, promoteToAdmin, signUp, unique } from "./support";

/**
 * Every screen at phone, tablet and desktop sizes: no horizontal page
 * scrolling, navigation reachable, and no serious/critical WCAG 2.2 AA
 * violations on the signed-in screens. (Public screens also have their own
 * accessibility.spec.ts.)
 */
const PROFESSIONAL = [
  "feed",
  "jobs",
  "recs",
  "applications",
  "saved",
  "search",
  "profile",
  "settings",
  "security",
  "network",
  "messenger",
  "notifications",
  "groups",
  "engineers",
  "companies",
  "contracts",
  "projects",
  "work",
  "taskmarket",
  "submissions",
  "worklog",
  "earnings",
  "help",
];
const ORGANISATION = [
  "codash",
  "coprofile",
  "postjob",
  "cojobs",
  "candidates",
  "talent",
  "ride",
  "copayments",
  "reviews",
  "quality",
  "workspace",
];
const PUBLIC = [
  "/",
  "/jobs",
  "/remote-jobs",
  "/people",
  "/companies",
  "/privacy",
  "/terms",
  "/trust",
  "/#login",
  "/#register",
];
const ADMIN = process.env.E2E_ADMIN_BASE_URL;

// Phone, iPad portrait, iPad landscape, laptop. 320 keeps the smallest phones honest.
const SIZES: [number, number][] = [
  [320, 2000],
  [390, 844],
  [820, 1180],
  [1024, 768],
  [1440, 2000],
];
const AXE_WIDTHS = new Set([320, 1440]);

async function overflow(page: Page) {
  return page.evaluate(() => (document.scrollingElement ?? document.documentElement).scrollWidth - window.innerWidth);
}

async function check(page: Page, routes: string[], opts: { prefix?: string; axe?: boolean } = {}) {
  const problems: string[] = [];
  for (const [width, height] of SIZES) {
    for (const route of routes) {
      await page.setViewportSize({ width, height });
      await page.goto(`${opts.prefix ?? "/#"}${route}`);
      await page.waitForLoadState("networkidle");
      const over = await overflow(page);
      if (over > 1) problems.push(`${route}@${width}: scrolls horizontally by ${over}px`);
      if (opts.axe && AXE_WIDTHS.has(width)) {
        const res = await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
          .analyze();
        for (const v of res.violations.filter((x) => x.impact === "serious" || x.impact === "critical")) {
          problems.push(`${route}@${width}: ${v.id} (${v.nodes.length}) e.g. ${v.nodes[0]?.target.join(" ")}`);
        }
      }
    }
  }
  expect(problems).toEqual([]);
}

/** The header's account button is on screen, not pushed past the right edge. */
async function expectOnScreen(page: Page, name: string) {
  const box = await page.getByRole("button", { name, exact: true }).first().boundingBox();
  expect(box, `${name} is visible`).toBeTruthy();
  const width = page.viewportSize()!.width;
  expect(box!.x + box!.width).toBeLessThanOrEqual(width);
}

test.describe.configure({ timeout: 600_000 });

test("public screens fit phone, tablet and desktop", async ({ page }) => {
  await check(page, PUBLIC, { prefix: "" });
});

test("professional screens fit every size and pass WCAG AA scans", async ({ page }) => {
  await signUp(page, { as: "professional", name: "Resp Pro", email: unique("resp-pro") });
  await check(page, PROFESSIONAL, { axe: true });
});

test("organisation screens fit every size and pass WCAG AA scans", async ({ page }) => {
  await signUp(page, { as: "organisation", name: "Resp Org", email: unique("resp-org") });
  await check(page, ORGANISATION, { axe: true });
});

test("every section stays reachable on a phone through the menu drawer", async ({ page }) => {
  await signUp(page, { as: "professional", name: "Resp Nav", email: unique("resp-nav") });
  for (const [width, height] of [
    [390, 844],
    [820, 1180],
  ]) {
    await page.setViewportSize({ width, height });
    await page.goto("/#feed");
    await expectOnScreen(page, "Your account");
    const bar = page.getByRole("navigation", { name: "Mobile navigation" });
    await expect(bar).toBeVisible();
    await bar.getByRole("button", { name: "Menu" }).click();
    const drawer = page.getByRole("dialog", { name: "Menu" });
    await expect(drawer).toBeVisible();
    // Switch to a section that has no bottom-bar tab, then open one of its screens.
    await drawer.getByRole("navigation", { name: "Sections" }).getByRole("button", { name: "Projects" }).click();
    await expect(page).toHaveURL(/#workspace/);
    await bar.getByRole("button", { name: "Menu" }).click();
    await expect(
      page.getByRole("dialog", { name: "Menu" }).getByRole("navigation", { name: /Projects navigation/ }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog", { name: "Menu" })).toHaveCount(0);
  }
  // Desktop keeps the persistent sidebar and top tabs; no bottom bar.
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(page.getByRole("navigation", { name: "Main navigation" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Mobile navigation" })).toBeHidden();
});

test.describe("staff console", () => {
  test.skip(!ADMIN, "Set E2E_ADMIN_BASE_URL to the isolated static staff console");

  test("console screens fit every size and the screen list is reachable on phones", async ({ page }) => {
    const email = unique("resp-staff");
    await signUp(page, { as: "professional", name: "Resp Staff", email });
    promoteToAdmin(email);
    await page.goto(`${ADMIN}/`);
    await page.getByLabel("Work email").fill(email);
    await page.getByRole("button", { name: "Send code", exact: true }).click();
    await page.getByLabel("Code from the email").fill(OTP);
    await page.getByRole("button", { name: "Verify", exact: true }).click();
    await expect(page.getByRole("navigation", { name: "Main navigation" })).toBeVisible();
    await check(page, ["", "staff", "flags"], { prefix: `${ADMIN}/#` });

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${ADMIN}/#staff`);
    const toggle = page.getByRole("button", { name: "Show screens" });
    await expect(toggle).toBeVisible();
    await toggle.click();
    await expect(
      page
        .getByRole("navigation", { name: / navigation$/ })
        .getByRole("button")
        .first(),
    ).toBeVisible();
  });
});
