import { afterEach, describe, expect, it, vi } from "vitest";
import { APPLY_FAQ, faqJsonLd, landingFaq, livePlaces, nonThin } from "./hubs";
import { PLACES, placeBySlug, placeMatches } from "./seo";
import { validate } from "./structuredData.test";
import type { LandingStats } from "./landing";

afterEach(() => vi.unstubAllGlobals());

const stats = (over: Partial<LandingStats> = {}): LandingStats => ({
  total: 120,
  new_last_7_days: 30,
  top_companies: [
    { name: "Acme", count: 9 },
    { name: "Globex", count: 4 },
  ],
  ...over,
});

describe("hub FAQ", () => {
  it("answers only what the data supports", () => {
    const faqs = landingFaq("remote Python roles", stats());
    expect(faqs.map((f) => f.q)).toEqual([
      "How many remote Python roles are open right now?",
      "Which companies are hiring for remote Python roles?",
      APPLY_FAQ.q,
    ]);
    expect(faqs[0].a).toContain("120 open listings");
    expect(faqs[0].a).toContain("30 of them posted in the last 7 days");
    expect(faqs[1].a).toBe("The employers with the most open listings are Acme (9), Globex (4).");
  });

  it("adds pay and skills only with enough data", () => {
    const faqs = landingFaq(
      "remote jobs",
      stats({
        salary: { currency: "USD", period: "year", count: 12, low: 80000, median: 120000, high: 180000 },
        top_skills: [
          { name: "Python", count: 40 },
          { name: "SQL", count: 20 },
          { name: "AWS", count: 10 },
        ],
      }),
    );
    expect(faqs.find((f) => f.q.startsWith("How much"))?.a).toContain("$80,000 to $180,000 a year");
    expect(faqs.find((f) => f.q.startsWith("Which skills"))?.a).toContain("Python (40)");
    const thinPay = landingFaq(
      "remote jobs",
      stats({ salary: { currency: "USD", period: "year", count: 2, low: 1, median: 2, high: 3 } }),
    );
    expect(thinPay.some((f) => f.q.startsWith("How much"))).toBe(false);
  });

  it("is empty for thin or unknown pages", () => {
    expect(landingFaq("x", null)).toEqual([]);
    expect(landingFaq("x", stats({ total: 2 }))).toEqual([]);
  });

  it("emits valid FAQPage markup matching the visible text", () => {
    const faqs = landingFaq("remote jobs", stats());
    const ld = faqJsonLd(faqs)!;
    expect(validate(ld)).toEqual([]);
    expect((ld.mainEntity as { name: string }[]).map((q) => q.name)).toEqual(faqs.map((f) => f.q));
    expect(faqJsonLd([])).toBeNull();
  });
});

describe("non-thin hubs", () => {
  it("keeps only known counts >= 3, biggest first", () => {
    const out = nonThin(["a", "b", "c", "d"], [stats({ total: 5 }), stats({ total: 2 }), null, stats({ total: 50 })]);
    expect(out).toEqual([
      { item: "d", total: 50 },
      { item: "a", total: 5 },
    ]);
  });

  it("falls back to the first items when every lookup failed", () => {
    expect(nonThin(["a", "b", "c"], [null, null, null], 2)).toEqual([
      { item: "a", total: 0 },
      { item: "b", total: 0 },
    ]);
  });

  it("asks the API with every spelling of a place", async () => {
    const urls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        urls.push(decodeURIComponent(String(url).replace(/\+/g, " ")));
        return new Response(JSON.stringify(stats({ total: url.includes("germany") ? 40 : 1 })));
      }),
    );
    const live = await livePlaces();
    expect(live.map((p) => p.item.slug)).toEqual(["germany"]);
    expect(urls.some((u) => u.includes("location=usa|united states|u.s."))).toBe(true);
    expect(urls).toHaveLength(PLACES.length);
  });
});

describe("place matching", () => {
  it("matches any spelling, case-insensitively", () => {
    const usa = placeBySlug("usa")!;
    expect(placeMatches(usa, "Remote, United States")).toBe(true);
    expect(placeMatches(usa, "USA only")).toBe(true);
    expect(placeMatches(usa, "Canada")).toBe(false);
    expect(placeMatches(usa, null)).toBe(false);
  });
  it("does not equate EMEA with Europe or North Korea with South Korea", () => {
    expect(placeMatches(placeBySlug("europe")!, "EMEA")).toBe(false);
    expect(placeMatches(placeBySlug("south-korea")!, "North Korea")).toBe(false);
    expect(placeMatches(placeBySlug("south-korea")!, "South Korea")).toBe(true);
  });
  it("has unique slugs and a kind for every place", () => {
    expect(new Set(PLACES.map((p) => p.slug)).size).toBe(PLACES.length);
    expect(PLACES.every((p) => ["country", "region", "anywhere"].includes(p.kind))).toBe(true);
  });
});
