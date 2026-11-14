import { test, expect, type Page } from "@playwright/test";
import { apiAs, signUp, unique } from "./support";

class CommunityFeed {
  constructor(private page: Page) {}
  async search(term: string) {
    await this.page.getByRole("textbox", { name: "Search post content" }).fill(term);
    await this.page.getByRole("button", { name: "Search posts", exact: true }).click();
  }
  articles() { return this.page.getByRole("article"); }
  async publicPosts() {
    await this.page.getByRole("combobox", { name: "Feed audience" }).selectOption("public");
  }
}

test("members discover public updates, search literal phrases and page without exposing private posts", async ({ page, browser, request }) => {
  const marker = `discovery-${Date.now()}`;
  const authorContext = await browser.newContext();
  const author = await authorContext.newPage();
  await signUp(author, { as: "professional", name: "Public Contributor", email: unique("discovery-author") });
  for (let i = 0; i < 21; i++) {
    expect((await apiAs(request, author, "post", "/social/posts", { content: `${marker} 100% remote ${i}`, visibility: "PUBLIC" })).ok()).toBeTruthy();
  }
  expect((await apiAs(request, author, "post", "/social/posts", { content: `${marker} secret`, visibility: "PRIVATE" })).ok()).toBeTruthy();
  await signUp(page, { as: "professional", name: "Community Reader", email: unique("discovery-reader") });
  await page.goto("/#feed");
  const feed = new CommunityFeed(page);
  await feed.search(marker);
  await expect(page.getByText("No matching posts", { exact: true })).toBeVisible();
  await feed.publicPosts();
  await expect(feed.articles()).toHaveCount(20);
  await expect(page.getByText(`${marker} secret`, { exact: true })).toHaveCount(0);
  const firstPage = await feed.articles().allTextContents();
  const next = page.waitForRequest((r) => r.url().includes("/social/posts/public?") && new URL(r.url()).searchParams.get("page") === "2");
  await page.getByRole("button", { name: "Next posts", exact: true }).click();
  expect(new URL((await next).url()).searchParams.get("page_size")).toBe("20");
  await expect(feed.articles()).toHaveCount(1);
  expect(firstPage).not.toContain((await feed.articles().allTextContents())[0]);
  await page.getByRole("combobox", { name: "Feed order" }).selectOption("most_liked");
  await expect(feed.articles()).toHaveCount(20);
  await expect(page.getByText("Page 1", { exact: true })).toBeVisible();
  await feed.search(`${marker} 100%`);
  await expect(feed.articles()).toHaveCount(20);
  await feed.search(`${marker} absent`);
  await expect(page.getByText("No matching posts", { exact: true })).toBeVisible();
  await page.route("**/api/v1/social/posts/public?**", (route) => route.fulfill({ status: 503, contentType: "application/json", body: '{"detail":"Temporarily unavailable"}' }), { times: 1 });
  await feed.search(marker);
  await expect(page.getByRole("alert").filter({ hasText: "Couldn’t load posts" })).toBeVisible();
  await expect(page.getByText("No matching posts", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(feed.articles()).toHaveCount(20);
  await authorContext.close();
});
