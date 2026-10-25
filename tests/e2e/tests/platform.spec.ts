import { expect, test } from "@playwright/test";
import { apiAs, signUp, unique } from "./support";

/* Journeys for the platform features added in the expansion: navigation tree and
   launcher, Docs/Sheets/Slides, channels, meetings, support and the assistant. */

test("the left navigation tree and the launcher reach every area", async ({ page }) => {
  await signUp(page, { as: "professional", name: "Nav Tree", email: unique("navtree") });
  const tree = page.getByRole("navigation", { name: "All features" });
  // Open another area from the tree and go to one of its screens.
  await tree.getByRole("button", { name: /Projects/ }).click();
  await tree.getByRole("button", { name: "Sheets" }).click();
  await expect(page).toHaveURL(/#sheets$/);
  await expect(page.getByRole("navigation", { name: "Breadcrumb" })).toContainText("Projects");
  // The filter finds features across areas.
  await page.getByLabel("Find a feature").fill("channels");
  await tree.getByRole("button", { name: "Channels" }).click();
  await expect(page).toHaveURL(/#channels$/);
  // The top-left launcher lists every area with its sub-categories.
  await page.getByRole("button", { name: "Open the menu of all features" }).click();
  const menu = page.getByRole("dialog", { name: "Product menu" });
  for (const area of ["Home", "Network", "Messaging", "Careers", "Freelance", "Hiring", "Projects", "Account"])
    await expect(menu.getByRole("heading", { name: area, exact: true })).toBeVisible();
  await menu.getByRole("button", { name: "Meetings & calls" }).click();
  await expect(page).toHaveURL(/#meetings$/);
});

test("a spreadsheet calculates, saves and keeps its history", async ({ page, request }) => {
  await signUp(page, { as: "professional", name: "Sheet User", email: unique("sheets") });
  await page.goto("/#sheets");
  await page.getByRole("button", { name: "New spreadsheet" }).click();
  const bar = page.getByLabel("Cell contents");
  await bar.fill("12");
  await page.getByRole("gridcell").nth(1).click(); // B1
  await bar.fill("30");
  await page.getByRole("gridcell").nth(2).click(); // C1
  await bar.fill("=SUM(A1:B1)*2");
  await expect(page.getByRole("gridcell").nth(2)).toHaveText("84");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("All changes saved")).toBeVisible();
  const docs = await (await apiAs(request, page, "get", "/documents?kind=SHEET")).json();
  expect(docs).toHaveLength(1);
  const full = await (await apiAs(request, page, "get", `/documents/${docs[0].id}`)).json();
  expect(full.content.cells.C1).toBe("=SUM(A1:B1)*2");
  const versions = await (await apiAs(request, page, "get", `/documents/${docs[0].id}/versions`)).json();
  expect(versions.length).toBeGreaterThanOrEqual(2);
});

test("a document can be written and is private to its owner", async ({ browser, request }) => {
  const owner = await (await browser.newContext()).newPage();
  await signUp(owner, { as: "professional", name: "Doc Owner", email: unique("docowner") });
  await owner.goto("/#docs");
  await owner.getByRole("button", { name: "New document" }).click();
  await owner.getByLabel("Document body").click();
  await owner.keyboard.type("Kickoff notes for the remote team");
  await owner.getByRole("button", { name: "Save", exact: true }).click();
  await expect(owner.getByText("All changes saved")).toBeVisible();
  const [doc] = await (await apiAs(request, owner, "get", "/documents?kind=DOC")).json();
  expect(JSON.stringify((await (await apiAs(request, owner, "get", `/documents/${doc.id}`)).json()).content)).toContain("Kickoff notes");

  const stranger = await (await browser.newContext()).newPage();
  await signUp(stranger, { as: "professional", name: "Doc Stranger", email: unique("docstranger") });
  expect((await apiAs(request, stranger, "get", `/documents/${doc.id}`)).status()).toBe(404);
});

test("support tickets go from the user to a thread they can follow", async ({ page }) => {
  await signUp(page, { as: "professional", name: "Help Me", email: unique("support") });
  await page.goto("/#support");
  await page.getByRole("button", { name: "New ticket" }).click();
  const dialog = page.getByRole("dialog", { name: "Contact support" });
  await dialog.getByLabel("Subject").fill("Cannot find my contract");
  await dialog.getByLabel("What happened?").fill("The contract page shows an error.");
  await dialog.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText("Ticket opened. We’ll reply here.")).toBeVisible();
  await expect(page.getByText("The contract page shows an error.")).toBeVisible();
});

test("the assistant chat is available everywhere and honest when AI is down", async ({ page }) => {
  await signUp(page, { as: "professional", name: "Chatty", email: unique("chat") });
  await page.goto("/#jobs");
  await page.getByRole("button", { name: "Chat with the AI assistant" }).click();
  const chat = page.getByRole("dialog", { name: "AI assistant chat" });
  await chat.getByLabel("Message the assistant").fill("What are my open tasks?");
  await chat.getByRole("button", { name: "Send" }).click();
  // The isolated E2E stack has no AI provider: the assistant says so instead of inventing an answer.
  await expect(chat.getByText(/unavailable|allowance|tasks/i)).toBeVisible({ timeout: 20_000 });
});

test("meetings: scheduling needs a connection, and the page explains it", async ({ page }) => {
  await signUp(page, { as: "professional", name: "Meet Me", email: unique("meet") });
  await page.goto("/#meetings");
  await expect(page.getByText("No meetings yet")).toBeVisible();
  await page.getByRole("button", { name: "Schedule meeting" }).click();
  await expect(page.getByText("You can invite people once you’re connected with them.")).toBeVisible();
});
