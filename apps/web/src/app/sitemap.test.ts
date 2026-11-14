import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/site", () => ({ SITE_URL: "https://remoteaiplatform.com", API_URL: "https://api.example.com" }));
import { GET as index } from "./sitemap.xml/route";
import { GET as shard } from "./sitemaps/[kind]/[page]/route";
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const context = (kind: string, page: string) => ({ params: Promise.resolve({ kind, page }) });

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("sitemap HTTP routes", () => {
  it("publishes an index and bounded shards for production", async () => {
    vi.stubEnv("NEXT_PUBLIC_DEPLOY_ENV", "production");
    const mock = vi
      .fn()
      .mockResolvedValueOnce(json({ jobs: 50001, people: 0, companies: 0, posts: 0 }))
      .mockResolvedValueOnce(json([{ id: "job-50000", updated_at: "2026-11-05T00:00:00Z" }]));
    vi.stubGlobal("fetch", mock);
    const response = await index();
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/xml");
    expect(await response.text()).toContain("/sitemaps/jobs/10.xml");
    const jobs = await shard(new Request("https://s"), context("jobs", "10.xml"));
    expect(await jobs.text()).toContain("https://remoteaiplatform.com/jobs/job-50000");
    expect(String(mock.mock.calls[1][0])).toContain("skip=50000&limit=5000");
  });
  it("never exports test inventory or accepts malformed shard paths", async () => {
    vi.stubEnv("NEXT_PUBLIC_DEPLOY_ENV", "dev");
    const mock = vi.fn();
    vi.stubGlobal("fetch", mock);
    expect(await (await index()).text()).not.toContain("/jobs/");
    expect(await (await shard(new Request("https://s"), context("jobs", "0.xml"))).text()).not.toContain("/jobs/");
    for (const [kind, page] of [
      ["private", "0.xml"],
      ["jobs", "-1.xml"],
      ["jobs", "1.0.xml"],
      ["static", "1.xml"],
    ]) {
      expect((await shard(new Request("https://s"), context(kind, page))).status).toBe(404);
    }
    expect(mock).not.toHaveBeenCalled();
  });
  it("asks crawlers to retry provider failures instead of removing listings", async () => {
    vi.stubEnv("NEXT_PUBLIC_DEPLOY_ENV", "production");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => json({}, 503)),
    );
    for (const response of [await index(), await shard(new Request("https://s"), context("jobs", "0.xml"))]) {
      expect(response.status).toBe(503);
      expect(response.headers.get("retry-after")).toBe("900");
    }
  });
});
