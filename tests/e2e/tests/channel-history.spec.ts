import { test, expect } from "@playwright/test";
import { apiAs, signUp, unique } from "./support";

test("channel history pages with message-id cursors and returns to live messages", async ({ page, request }) => {
  await signUp(page, { as: "professional", name: "Archive Tester", email: unique("archive") });
  const created = await apiAs(request, page, "post", "/channels", { kind: "GROUP", name: "Archive history", member_ids: [] });
  expect(created.ok()).toBeTruthy();
  const channel = await created.json();
  for (let index = 0; index < 55; index++) {
    const result = await apiAs(request, page, "post", `/channels/${channel.id}/messages`, { body: `Archive message ${String(index).padStart(3, "0")}` });
    expect(result.ok()).toBeTruthy();
  }
  await page.goto("/#channels");
  await page.getByRole("navigation", { name: "Channels", exact: true }).getByRole("button", { name: /Archive history/ }).click();
  await expect(page.getByText("Archive message 054", { exact: true })).toBeVisible();
  const search = page.getByRole("region", { name: "Search this channel" });
  await search.getByRole("searchbox").fill("Archive message 000");
  await search.getByRole("button", { name: "Search", exact: true }).click();
  await expect(search.getByText("Archive message 000", { exact: true })).toBeVisible();
  await search.getByRole("button", { name: "Clear search" }).click();
  await expect(page.getByText("Archive message 000", { exact: true })).toHaveCount(0);
  const olderRequest = page.waitForRequest((request) => request.url().includes(`/channels/${channel.id}/messages?`) && new URL(request.url()).searchParams.has("before_id"));
  await page.getByRole("button", { name: "Load earlier messages", exact: true }).click();
  await olderRequest;
  await expect(page.getByText("Archive message 000", { exact: true })).toBeVisible();
  await expect(page.locator('ol[aria-live="polite"] > li')).toHaveCount(55);
  await page.getByRole("button", { name: "Return to latest messages", exact: true }).click();
  await expect(page.getByText("Archive message 000", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Archive message 054", { exact: true })).toBeVisible();
});
