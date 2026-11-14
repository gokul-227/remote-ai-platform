import { afterEach, describe, expect, it, vi } from "vitest";
import { resourceSitemap, sitemapCounts, sitemapEntries, sitemapIndex, urlSet } from "./sitemaps";

afterEach(() => vi.unstubAllGlobals());
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe("sitemap shards", () => {
  it("discovers every shard after 50,000 combined resources", () => {
    const xml = sitemapIndex({ jobs: 50001, people: 20001, companies: 1, posts: 10000 });
    expect(xml.match(/<sitemap>/g)).toHaveLength(20);
    expect(xml).toContain("/sitemaps/jobs/10.xml");
    expect(xml).toContain("/sitemaps/people/4.xml");
    expect(xml).toContain("/sitemaps/posts/1.xml");
  });
  it("escapes XML and skips invalid dates", () => {
    expect(urlSet([{ url: "https://example.com/?a=1&b=<x>", changed: "bad" }])).toContain("?a=1&amp;b=&lt;x&gt;");
    expect(urlSet([{ url: "https://example.com", changed: "bad" }])).not.toContain("lastmod");
    expect(resourceSitemap("jobs", [{ id: "x/y", updated_at: "2026-11-05T00:00:00Z" }])).toContain("/jobs/x%2Fy");
  });
  it("requests a bounded resource page without reading prior pages", async () => {
    const mock = vi.fn(async (url: string) => (void url, json([{ id: "last" }])));
    vi.stubGlobal("fetch", mock);
    expect(await sitemapEntries("jobs", 50000)).toEqual([{ id: "last" }]);
    expect(String(mock.mock.calls[0][0])).toContain("skip=50000&limit=5000");
  });
  it("uses cheap counts and rejects corrupt values", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => json({ jobs: 50001, people: 0, companies: 1, posts: 0 })),
    );
    expect((await sitemapCounts()).jobs).toBe(50001);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => json({ jobs: -1, people: 0, companies: 0, posts: 0 })),
    );
    await expect(sitemapCounts()).rejects.toThrow("Invalid sitemap count");
  });
  it("supports older APIs by walking entry pages and does not hide provider outages", async () => {
    const mock = vi
      .fn()
      .mockResolvedValueOnce(json({}, 404))
      .mockResolvedValueOnce(json([{ id: "j" }]))
      .mockResolvedValueOnce(json([]))
      .mockResolvedValueOnce(json([]))
      .mockResolvedValueOnce(json([]));
    vi.stubGlobal("fetch", mock);
    expect(await sitemapCounts()).toEqual({ jobs: 1, people: 0, companies: 0, posts: 0 });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => json({}, 503)),
    );
    await expect(sitemapCounts()).rejects.toThrow("503");
  });
});
