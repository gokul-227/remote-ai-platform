import { test, expect, type Page } from "@playwright/test";
import { API, OTP, apiAs, promoteToAdmin, signUp, tokenOf, unique } from "./support";

// This suite promotes synthetic users in the named E2E database. Never point
// it at a remote console/API or use real Supabase credentials.
const ADMIN = process.env.E2E_ADMIN_BASE_URL;
const local = (url: string) => ["localhost", "127.0.0.1", "[::1]"].includes(new URL(url).hostname);
if (ADMIN && (!local(ADMIN) || !local(API))) throw new Error("Staff E2E requires loopback console and API URLs");

class StaffConsole {
  constructor(private page: Page) {}

  async signIn(email: string) {
    await this.page.goto(`${ADMIN}/`);
    await this.page.getByLabel("Work email").fill(email);
    await this.page.getByRole("button", { name: "Send code", exact: true }).click();
    await this.page.getByLabel("Code from the email").fill(OTP);
    await this.page.getByRole("button", { name: "Verify", exact: true }).click();
  }

  async portfolio(title: string) {
    await this.page.goto(`${ADMIN}/#portfolio`);
    await this.page.getByRole("textbox", { name: "Search projects" }).fill(title);
    await this.page.getByRole("button", { name: "Search", exact: true }).click();
  }

  status(title: string) {
    return this.page.getByRole("combobox", { name: `Change status for ${title}`, exact: true });
  }
}

test.describe("staff delivery operations", () => {
  test.skip(!ADMIN, "Set E2E_ADMIN_BASE_URL to the isolated static staff console");

  test("staff searches delivery, requires a reason, records changes and rejects a stale state", async ({ page, request }) => {
    const email = unique("operations-staff");
    await signUp(page, { as: "professional", name: "Delivery Staff", email });
    expect((await apiAs(request, page, "post", "/companies/me", { name: "Synthetic Operations Organisation" })).ok()).toBeTruthy();
    const title = `Delivery ${Date.now()}`;
    const created = await apiAs(request, page, "post", "/projects", { title, description: "Synthetic staff delivery verification" });
    expect(created.ok()).toBeTruthy();
    const project = await created.json();
    const token = await tokenOf(page);
    promoteToAdmin(email);
    const console = new StaffConsole(page);
    await console.signIn(email);
    await page.goto(`${ADMIN}/#operations`);
    await expect(page.getByRole("heading", { name: "Platform operations", exact: true })).toBeVisible();
    await expect(page.getByText("Open work items", { exact: true })).toBeVisible();
    await console.portfolio(title);
    await expect(console.status(title)).toHaveValue("CREATED");
    await console.status(title).selectOption("REVIEW");
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("button", { name: "Confirm", exact: true })).toBeDisabled();
    const reason = "Delivery reviewed with the organisation owner";
    await dialog.getByLabel("Reason (recorded in the audit log)").fill(reason);
    const changed = page.waitForResponse((r) => r.url().endsWith(`/admin/operations/projects/${project.id}/status`) && r.request().method() === "PATCH");
    await dialog.getByRole("button", { name: "Confirm", exact: true }).click();
    expect((await changed).status()).toBe(200);
    await expect(dialog).toHaveCount(0);
    await expect(console.status(title)).toHaveValue("REVIEW");

    const audits = await request.get(`${API}/api/v1/admin/audit-events?action_prefix=admin.project.status`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(audits.ok()).toBeTruthy();
    expect(await audits.json()).toEqual(expect.arrayContaining([expect.objectContaining({
      resource_id: project.id, payload: { from: "CREATED", to: "REVIEW", reason },
    })]));
    await console.status(title).selectOption("ACTIVE");
    const concurrent = await request.patch(`${API}/api/v1/admin/operations/projects/${project.id}/status`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { status: "PLANNING", expected_status: "REVIEW", reason: "Another staff member is coordinating delivery" },
    });
    expect(concurrent.ok()).toBeTruthy();
    await dialog.getByLabel("Reason (recorded in the audit log)").fill("Attempt based on the earlier project state");
    await dialog.getByRole("button", { name: "Confirm", exact: true }).click();
    await expect(dialog.getByRole("alert")).toContainText("The project changed");
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
    await console.portfolio(`no-such-project-${Date.now()}`);
    await expect(page.getByRole("table", { name: "Project portfolio" })).toHaveCount(0);
    await expect(page.getByText("0 projects", { exact: true })).toBeVisible();

    // A later permission failure must discard already loaded staff aggregates.
    await page.goto(`${ADMIN}/#operations`);
    await expect(page.getByText("Measured", { exact: false })).toBeVisible();
    await page.route("**/api/v1/admin/operations/summary", (route) => route.fulfill({
      status: 403, contentType: "application/json", body: JSON.stringify({ detail: "Staff access required" }),
    }));
    await page.getByRole("button", { name: "Refresh", exact: true }).click();
    await expect(page.getByText("Staff access required.", { exact: false })).toBeVisible();
    await expect(page.getByText("Measured", { exact: false })).toHaveCount(0);
  });

  test("a member cannot enter the staff console or read delivery aggregates", async ({ page, request }) => {
    const email = unique("operations-member");
    await signUp(page, { as: "professional", name: "Regular Member", email });
    expect((await apiAs(request, page, "get", "/admin/operations/summary")).status()).toBe(403);
    await new StaffConsole(page).signIn(email);
    await expect(page.getByRole("heading", { name: "Access denied" })).toBeVisible();
    await expect(page.getByText("This account does not have staff access.")).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Search projects" })).toHaveCount(0);
  });
});
