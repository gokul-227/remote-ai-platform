import { test, expect } from "@playwright/test";
import { signUp, unique, promoteToAdmin, OTP } from "./support";

const ADMIN = process.env.E2E_ADMIN_BASE_URL;

test.describe("staff roles and feature flags", () => {
  test.skip(!ADMIN, "Set E2E_ADMIN_BASE_URL to the isolated static staff console");

  test("a staff member sees their roles and changes a flag with a recorded reason", async ({ page }) => {
    const email = unique("flags-staff");
    await signUp(page, { as: "professional", name: "Flag Staff", email });
    promoteToAdmin(email);
    await page.goto(`${ADMIN}/`);
    await page.getByLabel("Work email").fill(email);
    await page.getByRole("button", { name: "Send code", exact: true }).click();
    await page.getByLabel("Code from the email").fill(OTP);
    await page.getByRole("button", { name: "Verify", exact: true }).click();

    await page.goto(`${ADMIN}/#staff`);
    await expect(page.getByText("no roles assigned yet, so full access")).toBeVisible();
    await expect(page.getByRole("cell", { name: new RegExp(email.split("@")[0]) })).toBeVisible();

    await page.goto(`${ADMIN}/#flags`);
    const row = page.getByRole("row", { name: /realtime_websockets/ });
    await expect(row).toBeVisible();
    const before = (await row.getByRole("cell").nth(1).innerText()).trim();
    await row.getByRole("button", { name: /Turn (on|off)/ }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("button", { name: "Confirm", exact: true })).toBeDisabled();
    await dialog.getByLabel("Reason (recorded in the audit log)").fill("E2E flag verification");
    await dialog.getByRole("button", { name: "Confirm", exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(row.getByRole("cell").nth(1)).not.toHaveText(before);
    await expect(row).toContainText("E2E flag verification");
    await row.getByRole("button", { name: "Use default", exact: true }).click();
    await page.getByRole("dialog").getByLabel("Reason (recorded in the audit log)").fill("Back to default");
    await page.getByRole("dialog").getByRole("button", { name: "Confirm", exact: true }).click();
    await expect(row.getByRole("cell").nth(1)).toHaveText(before);
  });
});
