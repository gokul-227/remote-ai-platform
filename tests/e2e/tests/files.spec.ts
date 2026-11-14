import { test, expect } from "@playwright/test";
import { signUp, unique } from "./support";

test("files: create a folder, upload, preview, trash and restore; Office lives inside Files", async ({ page }) => {
  await signUp(page, { as: "professional", name: "Files Tester", email: unique("files") });
  await page.goto("/#files");
  await expect(page.getByRole("navigation", { name: "Files navigation" })).toBeVisible();
  await expect(page.getByText("No files here yet. Upload a file or create a folder.")).toBeVisible();

  page.once("dialog", (d) => d.accept("Proposals"));
  await page.getByRole("button", { name: "New folder", exact: true }).click();
  await page.getByRole("button", { name: "Proposals", exact: true }).click();
  await expect(page.getByRole("navigation", { name: "Folder path" })).toContainText("Proposals");

  await page.getByLabel("Upload files").setInputFiles({ name: "brief.txt", mimeType: "text/plain", buffer: Buffer.from("Scope: build the thing.") });
  await expect(page.getByText("1 file uploaded.")).toBeVisible();
  await page.getByRole("button", { name: "brief.txt", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "brief.txt" })).toContainText("Scope: build the thing.");
  await page.getByLabel("File comment", { exact: true }).fill("Please review the scope.");
  await page.getByRole("button", { name: "Add comment", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "brief.txt" })).toContainText("Please review the scope.");
  await page.getByRole("button", { name: "Close", exact: true }).first().click();

  // Executables are refused server-side with a readable message.
  await page.getByLabel("Upload files").setInputFiles({ name: "tool.exe", mimeType: "application/octet-stream", buffer: Buffer.from("MZ") });
  await expect(page.getByText("This file type is not accepted")).toBeVisible();

  await page.getByRole("button", { name: "Move brief.txt to trash" }).click();
  await expect(page.getByRole("button", { name: "brief.txt", exact: true })).toHaveCount(0);
  await page.getByRole("navigation", { name: "Files navigation" }).getByRole("button", { name: "Trash", exact: true }).click();
  await expect(page.getByText("brief.txt")).toBeVisible();
  await page.getByRole("button", { name: "Restore", exact: true }).click();
  await expect(page.getByText("Restored.")).toBeVisible();

  await page.getByRole("navigation", { name: "Files navigation" }).getByRole("button", { name: "Word documents", exact: true }).click();
  await expect(page.getByRole("button", { name: "New document", exact: true })).toBeVisible();
});
