import { test, expect } from "@playwright/test";
import { registerAs, completeOnboarding } from "./helpers";

test.describe("Social and Networking Journeys", () => {
  test("engineer can view feed, navigate to network hub, and explore connections", async ({ page }) => {
    const unique = Date.now();
    const email = `social-engineer-${unique}@workmesh-test.internal`;

    await registerAs(page, {
      name: "Social Tester",
      email,
      password: "TestPassword123!",
      role: "engineer",
    });
    await completeOnboarding(page, { role: "engineer", headline: "Social Tester Engineer", skills: "Python" });

    // 1. Visit social feed
    await page.goto("/feed");
    await expect(page.getByRole("heading", { name: /social feed/i, level: 1 })).toBeVisible({ timeout: 15_000 });
    // The composer collapses to a "Start a post" trigger button by default —
    // expand it to reach the real textarea.
    await page.getByRole("button", { name: /start a post/i }).click();
    await expect(page.getByPlaceholder(/what's on your mind/i)).toBeVisible({ timeout: 15_000 });

    // 2. Navigate to network hub
    await page.goto("/network");
    await expect(page.getByRole("heading", { name: /professional network|my network/i, level: 1 })).toBeVisible({ timeout: 15_000 });

    // 3. Navigate to messages
    await page.goto("/messages");
    await expect(page.getByRole("heading", { name: /messages/i, level: 1 })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByPlaceholder(/search conversations|search messages/i)).toBeVisible({ timeout: 15_000 });
  });
});
