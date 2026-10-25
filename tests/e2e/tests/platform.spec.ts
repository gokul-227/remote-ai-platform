import { expect, test } from "@playwright/test";
import { apiAs, signUp, unique } from "./support";

/* Journeys for the platform features added in the expansion: navigation tree and
   launcher, Docs/Sheets/Slides, channels, meetings, support and the assistant. */

test("top tabs open a section and the sidebar shows only that section", async ({ page }) => {
  await signUp(page, { as: "professional", name: "Nav Tree", email: unique("navtree") });
  const tabs = page.getByRole("navigation", { name: "Main navigation" });
  for (const area of ["Home", "Network", "Collaboration", "Jobs", "Freelancing", "Projects"])
    await expect(tabs.getByRole("button", { name: area, exact: true })).toBeVisible();
  await tabs.getByRole("button", { name: "Projects", exact: true }).click();
  await expect(page).toHaveURL(/#workspace$/);
  const side = page.getByRole("navigation", { name: "Projects navigation" });
  await side.getByRole("button", { name: "Spreadsheets", exact: true }).click();
  await expect(page).toHaveURL(/#sheets$/);
  await expect(side.getByRole("button", { name: "Timeline", exact: true })).toBeVisible();
  // Other sections stay out of the sidebar.
  await expect(side.getByRole("button", { name: "Job search", exact: true })).toHaveCount(0);
  await expect(page.getByRole("navigation", { name: "Breadcrumb" })).toContainText("Projects");
  await side.getByRole("button", { name: "Timeline", exact: true }).click();
  await expect(page).toHaveURL(/#timeline$/);
  // Messages and notifications open as panels from the top bar.
  await page.getByRole("button", { name: "Notifications" }).click();
  await expect(page.getByRole("dialog", { name: "Notifications" })).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Messages" }).click();
  await expect(page.getByRole("dialog", { name: "Messages" }).getByRole("button", { name: "Open chats" })).toBeVisible();
});

test("job search and AI-matched jobs share one page with a toggle", async ({ page }) => {
  await signUp(page, { as: "professional", name: "Toggle", email: unique("toggle") });
  await page.goto("/#jobs");
  const toggle = page.getByRole("tablist", { name: "Show" });
  await toggle.getByRole("tab", { name: "AI-matched for you" }).click();
  await expect(page).toHaveURL(/#recs$/);
  await toggle.getByRole("tab", { name: "All jobs" }).click();
  await expect(page).toHaveURL(/#jobs$/);
});

test("the in-app browser refuses private addresses", async ({ page }) => {
  await signUp(page, { as: "professional", name: "Surfer", email: unique("surf") });
  await page.goto("/#browser");
  await page.getByLabel("Address").fill("http://127.0.0.1:8000");
  await page.getByRole("button", { name: "Go" }).click();
  await expect(page.getByText("Only public websites can be opened")).toBeVisible();
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
  await expect(chat.getByText(/assistant is unavailable right now|reached the AI allowance/i).last()).toBeVisible({ timeout: 20_000 });
});

test("meetings: scheduling needs a connection, and the page explains it", async ({ page }) => {
  await signUp(page, { as: "professional", name: "Meet Me", email: unique("meet") });
  await page.goto("/#meetings");
  await expect(page.getByText("No meetings yet")).toBeVisible();
  await page.getByRole("button", { name: "Schedule meeting" }).click();
  await expect(page.getByText("You can invite people once you’re connected with them.")).toBeVisible();
});
