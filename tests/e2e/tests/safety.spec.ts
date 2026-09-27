import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { apiAs, signUp, unique } from "./support";

async function professional(page: Page, name: string, request: APIRequestContext) {
  await signUp(page, { as: "professional", name, email: unique(name.toLowerCase().replace(/\s/g, "-")) });
  await page.getByRole("button", { name: /build it myself/i }).click();
  await page.getByLabel("Professional headline").fill("Illustrator");
  await page.getByLabel(/skills/i).fill("Drawing");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Save profile" }).click();
  // The profile exists once the save has actually finished.
  await expect.poll(async () => (await apiAs(request, page, "get", "/engineers/me")).status()).toBe(200);
}

test("a professional blocks someone: no messages or requests until they unblock", async ({ browser, request }) => {
  const baseURL = test.info().project.use.baseURL;
  const alice = await (await browser.newContext({ baseURL })).newPage();
  const bob = await (await browser.newContext({ baseURL })).newPage();
  await professional(alice, "Alice Blocker", request);
  await professional(bob, "Bob Blocked", request);
  const bobProfile = await (await apiAs(request, bob, "get", "/engineers/me")).json();
  const aliceMe = await (await apiAs(request, alice, "get", "/auth/me")).json();

  await alice.goto(`/#engineer/${bobProfile.id}`);
  await alice.getByRole("button", { name: "Block", exact: true }).click();
  const dialog = alice.getByRole("dialog", { name: /block bob blocked/i });
  await dialog.getByRole("button", { name: "Block", exact: true }).click();
  await expect(alice.getByRole("status")).toContainText("is blocked");
  await expect(alice.getByRole("button", { name: "Unblock" })).toBeVisible();

  expect((await apiAs(request, bob, "post", "/conversations", { participant_id: aliceMe.id })).status()).toBe(403);
  expect((await apiAs(request, bob, "post", "/connections", { receiver_id: aliceMe.id })).status()).toBe(403);

  await alice.getByRole("button", { name: "Unblock" }).click();
  await expect(alice.getByRole("status")).toContainText("is unblocked");
  expect((await apiAs(request, bob, "post", "/connections", { receiver_id: aliceMe.id })).status()).toBe(201);
});
