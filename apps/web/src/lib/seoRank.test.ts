import { afterEach, describe, expect, it, vi } from "vitest";
import { isLandingHub, landingSitemap, staticSitemap } from "./sitemaps";
import { landingTotal, trendSentence } from "./landing";

afterEach(() => vi.unstubAllGlobals());
const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers });

describe("landing sitemap", () => {
  it("lists hubs when stats are unknown, combinations only when known big enough, and every employer", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        const u = String(url);
        if (u.includes("/jobs/employers")) return json([{ slug: "acme", name: "Acme", count: 9 }]);
        if (u.includes("query=python") && u.includes("location=germany")) return json({ total: 12, top_companies: [] });
        if (u.includes("query=rust") && !u.includes("location")) return json({ total: 1, top_companies: [] });
        return json({}, 503); // unknown
      }),
    );
    const xml = await landingSitemap();
    expect(xml).toContain("/remote-jobs/python</loc>"); // hub, unknown: kept
    expect(xml).toContain("/remote-jobs/in/germany</loc>");
    expect(xml).toContain("/remote-jobs/python/in/germany</loc>"); // known 12
    expect(xml).not.toContain("/remote-jobs/rust</loc>"); // known thin
    expect(xml).not.toContain("/remote-jobs/java/in/germany</loc>"); // unknown combination
    expect(xml).toContain("/remote-jobs/at/acme</loc>");
  });

  it("answers within its budget even when every lookup hangs", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        String(url).includes("employers")
          ? json([])
          : new Promise<Response>((r) => setTimeout(() => r(json({}, 503)), 5)),
      ),
    );
    const started = Date.now();
    const xml = await landingSitemap(20);
    expect(Date.now() - started).toBeLessThan(2000);
    expect(xml).toContain("/remote-jobs/python</loc>");
  });

  it("recognises hubs and lists guides and the HTML site map", () => {
    expect(isLandingHub("/remote-jobs/python")).toBe(true);
    expect(isLandingHub("/remote-jobs/in/germany")).toBe(true);
    expect(isLandingHub("/remote-jobs/python/in/germany")).toBe(false);
    expect(isLandingHub("/remote-jobs/backend/python")).toBe(false);
    const xml = staticSitemap();
    expect(xml).toContain("/guides/remote-salary-guide</loc>");
    expect(xml).toContain("/sitemap</loc>");
  });
});

describe("landing totals", () => {
  it("falls back to the job list, and reports unknown instead of zero", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        String(url).includes("landing-stats") ? json({}, 504) : json([{ id: "a" }], 200, { "x-total-count": "42" }),
      ),
    );
    expect((await landingTotal({ query: "python" })).total).toBe(42);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => json({}, 504)),
    );
    expect((await landingTotal({ query: "python" })).total).toBeNull();
  });

  it("describes the weekly trend only with data", () => {
    expect(trendSentence([1, 2, 3, 4])).toContain("1, 2, 3 and 4");
    expect(trendSentence([0, 0, 0, 0])).toBeNull();
    expect(trendSentence(undefined)).toBeNull();
  });
});
