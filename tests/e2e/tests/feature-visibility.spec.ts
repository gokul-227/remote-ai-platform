import { test, expect, type Page } from "@playwright/test";
import { OTP, promoteToAdmin, signIn, signUp, unique } from "./support";

/**
 * Discoverability journeys: a new member lands on a home overview that surfaces
 * the key features, every area is reachable from navigation on desktop and on
 * a phone, and the main collaboration features work end to end.
 */
const email = unique("visibility");
let ready = false;

async function member(page: Page) {
  if (!ready) {
    await signUp(page, { as: "professional", name: "Vera Visible", email });
    ready = true;
  } else await signIn(page, email);
}

test("sign-in lands on a home overview with a checklist and every area", async ({ page }) => {
  await member(page);
  await page.goto("/#home");
  await expect(page.getByRole("heading", { name: /^Welcome, Vera/ })).toBeVisible();
  const steps = page.getByRole("list", { name: "Getting started" });
  await expect(steps).toBeVisible();
  await expect(steps.getByRole("button", { name: "Join a community" })).toBeVisible();
  for (const area of ["Network", "Collaboration", "Jobs", "Freelancing", "Projects", "Account"])
    await expect(page.getByRole("heading", { level: 3, name: area })).toBeVisible();
  await page.getByRole("button", { name: "Hiring dashboard" }).click();
  await expect(page).toHaveURL(/#codash/);
  await page.getByRole("navigation", { name: "Main navigation" }).getByRole("button", { name: "Home" }).click();
  await expect(page).toHaveURL(/#home/);
});

test("on a phone, the Home tab and the menu reach the overview, feed, assistant and settings", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await member(page);
  // Signing in with nowhere to return to lands on the overview.
  await expect(page).toHaveURL(/#home/);
  const mobile = page.getByRole("navigation", { name: "Mobile navigation" });
  await mobile.getByRole("button", { name: "Home" }).click();
  await expect(page.getByRole("heading", { name: /^Welcome, Vera/ })).toBeVisible();
  await mobile.getByRole("button", { name: "Menu" }).click();
  const drawer = page.getByRole("dialog", { name: "Menu" });
  for (const item of ["Overview", "Feed", "Notifications", "AI assistant"])
    await expect(drawer.getByRole("button", { name: item, exact: true })).toBeVisible();
  await drawer.getByRole("button", { name: "Projects", exact: true }).click();
  await mobile.getByRole("button", { name: "Menu" }).click();
  await expect(
    page.getByRole("dialog", { name: "Menu" }).getByRole("button", { name: "Files", exact: true }),
  ).toBeVisible();
});

test("a member is guided to an organisation page, then creates a project board", async ({ page }) => {
  await member(page);
  await page.goto("/#projects");
  const create = async () => {
    await page.getByRole("button", { name: "Create project" }).first().click();
    const dialog = page.getByRole("dialog", { name: "Create project" });
    await dialog.getByLabel("Project name").fill("Visibility launch");
    await dialog.getByRole("button", { name: "Create", exact: true }).click();
  };
  await create();
  await page.getByRole("button", { name: "Set up organisation page" }).click();
  await expect(page).toHaveURL(/#coprofile/);
  await page.getByLabel("Organization name").fill("Visible Co");
  await page.getByLabel("Industry").fill("Software");
  await page.getByRole("button", { name: /create company profile/i }).click();
  await expect(page.getByText("Company profile saved.")).toBeVisible();
  await page.goto("/#projects");
  await create();
  await expect(page.getByText("Visibility launch").first()).toBeVisible();
  await page.goto("/#home");
  await expect(page.getByRole("button", { name: "Open boards" })).toBeVisible();
});

test("a member creates a community and a channel and posts in it", async ({ page }) => {
  await member(page);
  await page.goto("/#groups");
  await page.getByRole("button", { name: "Create group" }).first().click();
  await page.getByLabel("Group name").fill("Remote QA guild");
  await page.getByLabel("Description").fill("People who test remote products.");
  await page.getByRole("button", { name: "Create group" }).last().click();
  await expect(page.getByText("Remote QA guild").first()).toBeVisible();

  await page.goto("/#channels");
  await page.getByRole("button", { name: "New channel" }).click();
  const dialog = page.getByRole("dialog", { name: "New channel" });
  await dialog.getByLabel("Name", { exact: true }).fill("launch-notes");
  await dialog.getByRole("button", { name: "Create", exact: true }).click();
  const box = page.getByPlaceholder("Message #launch-notes");
  await box.fill("First note from the visibility journey");
  await box.press("Enter");
  await expect(page.getByText("First note from the visibility journey")).toBeVisible();
});

test("notification settings are one click from the Account section", async ({ page }) => {
  await member(page);
  await page.goto("/#settings");
  await page
    .getByRole("navigation", { name: "Account navigation" })
    .getByRole("button", { name: "Notification settings" })
    .click();
  await expect(page).toHaveURL(/#notifysettings/);
  await expect(page.getByLabel("Digest frequency")).toBeVisible();
});

const ADMIN = process.env.E2E_ADMIN_BASE_URL;
const STAFF_SCREENS = [
  "overview",
  "users",
  "staff",
  "companies",
  "verifications",
  "reports",
  "decisions",
  "restricted",
  "jobs",
  "sources",
  "background",
  "contracts",
  "tickets",
  "ai",
  "assistant",
  "flags",
  "announcements",
  "status",
  "incidents",
  "inventory",
  "catalogue",
  "backups",
  "usage",
  "audit",
  "security",
];

test("staff open every console screen and none fails to load", async ({ page }) => {
  test.skip(!ADMIN, "Set E2E_ADMIN_BASE_URL to the isolated static staff console");
  const staff = unique("visibility-staff");
  await signUp(page, { as: "professional", name: "Visible Staff", email: staff });
  promoteToAdmin(staff);
  await page.goto(`${ADMIN}/`);
  await page.getByLabel("Work email").fill(staff);
  await page.getByRole("button", { name: "Send code", exact: true }).click();
  await page.getByLabel("Code from the email").fill(OTP);
  await page.getByRole("button", { name: "Verify", exact: true }).click();
  const failures: string[] = [];
  page.on("response", (r) => {
    if (r.status() >= 500 && r.url().includes("/api/")) failures.push(`${r.status()} ${r.url()}`);
  });
  for (const screen of STAFF_SCREENS) {
    await page.goto(`${ADMIN}/#${screen}`);
    await expect(page.getByRole("heading", { level: 1 }).first(), screen).toBeVisible();
  }
  expect(failures).toEqual([]);
});
