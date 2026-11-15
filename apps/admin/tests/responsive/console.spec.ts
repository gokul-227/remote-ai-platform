import { expect, test, type Page } from "@playwright/test";

async function fits(page: Page) {
  await page.evaluate(() => document.fonts.ready);
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth))
    .toBeLessThanOrEqual(1);
}

for (const width of [820]) {
  test(`sign-in, staff and flags fit at ${width}px with reachable navigation`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1180 });
    const unexpected: string[] = [];
    await page.route("**/*", async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      if (url.origin !== "http://127.0.0.1:14322") {
        unexpected.push(request.url());
        return route.abort();
      }
      const data: Record<string, unknown> = {
        "/health/version": { environment: "local", version: "test", git_sha: "fixture" },
        "/api/v1/auth/workos/magic-auth/send": {},
        "/api/v1/auth/workos/magic-auth/verify": { access_token: "fixture", refresh_token: null },
        "/api/v1/auth/me": { id: "self", email: "staff@example.test", full_name: "Test Staff", role: "ADMIN" },
        "/api/v1/admin/me/permissions": { roles: ["super_admin"], implicit_super_admin: false },
        "/api/v1/admin/staff-roles": [
          {
            user_id: "other",
            email: "another.staff.member@example.test",
            full_name: "Other Staff",
            is_active: true,
            roles: ["super_admin", "ops_admin"],
            implicit: false,
          },
        ],
        "/api/v1/admin/feature-flags/state": [
          {
            name: "realtime_websockets",
            env_default: false,
            override: true,
            effective: true,
            reason: "Isolated responsive fixture",
            updated_at: "2026-11-15T12:00:00Z",
          },
        ],
      };
      if (url.pathname in data) return route.fulfill({ json: data[url.pathname] });
      if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/health/")) {
        unexpected.push(url.pathname);
        return route.abort();
      }
      return route.continue();
    });
    await page.goto("/#staff");
    await expect(page.getByRole("heading", { name: "Staff sign in" })).toBeVisible();
    await fits(page);
    await page.getByLabel("Work email").fill("staff@example.test");
    await page.getByRole("button", { name: "Send code", exact: true }).click();
    await page.getByLabel("Code from the email").fill("123456");
    await fits(page);
    await page.getByRole("button", { name: "Verify", exact: true }).click();
    await expect(page.getByRole("cell", { name: /Other Staff/ })).toBeVisible();
    await expect(page.locator(".top")).toHaveCSS("display", "grid");
    await fits(page);
    // Check account controls are actually inside the viewport, not clipped.
    const account = page.getByRole("button", { name: "Your account", exact: true });
    const box = await account.boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(width);
    await account.click();
    await expect(page.getByRole("button", { name: "Sign out", exact: true })).toBeVisible();
    await page.keyboard.press("Escape");
    const nav = page.getByRole("navigation", { name: "Main navigation", exact: true });
    // Both ends of the tab strip remain reachable via its local scroll area.
    await nav.getByTitle("Compliance & Audit", { exact: true }).scrollIntoViewIfNeeded();
    await nav.getByTitle("Platform Configuration", { exact: true }).click();
    await page.getByRole("button", { name: "Feature flags", exact: true }).click();
    await expect(page.getByRole("cell", { name: "realtime_websockets", exact: true })).toBeVisible();
    await fits(page);
    // Wide tables keep their own scrolling; action buttons remain usable.
    await page.getByRole("button", { name: "Turn off", exact: true }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await fits(page);
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    expect(unexpected).toEqual([]);
  });
}
