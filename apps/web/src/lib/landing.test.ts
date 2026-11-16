import { afterEach, describe, expect, it, vi } from "vitest";
import {
  MIN_INDEXABLE_JOBS,
  PAGE_SIZE,
  landingCandidates,
  landingIntro,
  lastPage,
  pageHref,
  parsePage,
  roleSkill,
} from "./landing";
import { PLACES, TOPICS } from "./seo";
import { websiteJsonLd } from "./brand";
import { employerSpec, placeSpec, roleSkillSpec, topicPlaceSpec, topicSpec } from "@/app/remote-jobs/specs";
import { landingMetadata } from "@/app/remote-jobs/Landing";
import { GONE_HTML, proxy } from "@/proxy";
import { NextRequest } from "next/server";

const stats = {
  total: 120,
  new_last_7_days: 14,
  top_companies: [
    { name: "Acme", count: 9 },
    { name: "Beta", count: 4 },
  ],
  salary: { currency: "USD", period: "year", count: 20, low: 90000, median: 130000, high: 180000 },
};

afterEach(() => vi.unstubAllGlobals());

describe("landing intro", () => {
  it("uses only the real aggregates", () => {
    const text = landingIntro("remote Python roles", stats).join(" ");
    expect(text).toContain("120 open remote Python roles");
    expect(text).toContain("14 of them posted in the last 7 days");
    expect(text).toContain("Acme (9), Beta (4)");
    expect(text).toContain("$90,000 to $180,000 a year");
    expect(text).not.toMatch(/guarantee|top 10|#1/i);
  });
  it("says nothing for empty pages and skips pay with too few samples", () => {
    expect(landingIntro("x", null)).toEqual([]);
    expect(landingIntro("x", { ...stats, total: 0 })).toEqual([]);
    const few = landingIntro("x", { ...stats, salary: { ...stats.salary, count: 1 } }).join(" ");
    expect(few).not.toContain("publish pay");
  });
});

describe("pagination", () => {
  it("parses only sane page numbers and builds real hrefs", () => {
    expect(parsePage(undefined)).toBe(1);
    expect(parsePage("3")).toBe(3);
    expect(parsePage("0")).toBeNull();
    expect(parsePage("abc")).toBeNull();
    expect(parsePage(["1", "2"])).toBeNull();
    expect(pageHref("/remote-jobs/python", 1)).toBe("/remote-jobs/python");
    expect(pageHref("/remote-jobs/python", 2)).toBe("/remote-jobs/python?page=2");
    expect(lastPage(0)).toBe(1);
    expect(lastPage(PAGE_SIZE + 1)).toBe(2);
  });
});

describe("landing specs", () => {
  it("resolves every page type and rejects unknown slugs", () => {
    expect(topicSpec("python")?.heading).toBe("Remote Python jobs");
    expect(topicSpec("nope")).toBeNull();
    expect(placeSpec("germany")?.filter).toEqual({ location: "germany|deutschland" });
    expect(topicPlaceSpec("python", "germany")?.filter).toEqual({ query: "python", location: "germany|deutschland" });
    expect(roleSkillSpec("backend", "python")?.filter).toEqual({ query: "backend python" });
    expect(roleSkillSpec("python", "backend")).toBeNull();
    expect(roleSkill("in", "python")).toBeNull();
    expect(employerSpec({ slug: "acme", name: "Acme", count: 5 })?.filter).toEqual({ employer: "Acme" });
  });
  it("breadcrumb trails end at the page itself", () => {
    for (const spec of [
      topicSpec("react"),
      placeSpec("uk"),
      topicPlaceSpec("react", "uk"),
      roleSkillSpec("frontend", "react"),
    ]) {
      expect(spec!.trail[0]).toEqual(["Remote AI Platform", "/"]);
      expect(spec!.trail.at(-1)![1]).toBe(spec!.path);
    }
  });
  it("enumerates role×place, role×skill and employer pages with unique paths", () => {
    const all = landingCandidates([{ slug: "acme", name: "Acme", count: 4 }]);
    const paths = all.map((c) => c.path);
    expect(new Set(paths).size).toBe(paths.length);
    expect(paths).toContain("/remote-jobs/python/in/germany");
    expect(paths).toContain("/remote-jobs/backend/python");
    expect(paths).toContain("/remote-jobs/at/acme");
    expect(all.length).toBeGreaterThan(TOPICS.length * PLACES.length);
  });
});

describe("landing metadata", () => {
  const stub = (total: number) =>
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ ...stats, total }), { status: 200 })),
    );
  it("is self-canonical with a data-driven description", async () => {
    stub(120);
    const md = await landingMetadata(topicSpec("python"), Promise.resolve({ page: "2" }));
    expect(md.alternates?.canonical).toBe("/remote-jobs/python?page=2");
    expect(md.title).toBe("Remote Python jobs (120) – page 2 | Remote AI Platform");
    expect(md.description).toContain("14 new this week");
    expect(md.robots).toBeUndefined();
  });
  it("noindexes thin and out-of-range pages", async () => {
    stub(MIN_INDEXABLE_JOBS - 1);
    expect((await landingMetadata(topicSpec("python"), Promise.resolve({}))).robots).toEqual({
      index: false,
      follow: true,
    });
    stub(120);
    expect((await landingMetadata(topicSpec("python"), Promise.resolve({ page: "99" }))).robots).toMatchObject({
      index: false,
    });
  });
});

describe("structured data", () => {
  it("WebSite declares a SearchAction that points at a real search URL", () => {
    const ld = websiteJsonLd("https://s") as unknown as { potentialAction: { target: { urlTemplate: string } } };
    expect(ld.potentialAction.target.urlTemplate).toBe("https://s/remote-jobs?q={search_term_string}");
  });
});

describe("410 proxy", () => {
  const id = "52b9b391-db5a-4615-a575-11ad2492069f";
  it("answers 410 for long-gone jobs", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ state: "gone" }))),
    );
    const res = await proxy(new NextRequest(`https://s/jobs/${id}`));
    expect(res.status).toBe(410);
    expect(await res.text()).toBe(GONE_HTML);
  });
  it("lets live, recently expired and unknown jobs through, and fails open", async () => {
    for (const r of [
      new Response(JSON.stringify({ state: "live" })),
      new Response(JSON.stringify({ state: "expired" })),
      new Response("{}", { status: 404 }),
    ]) {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => r),
      );
      expect((await proxy(new NextRequest(`https://s/jobs/${id}`))).status).toBe(200);
    }
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Promise.reject(new Error("down"))),
    );
    expect((await proxy(new NextRequest(`https://s/jobs/${id}`))).status).toBe(200);
    expect((await proxy(new NextRequest("https://s/jobs/not-a-uuid"))).status).toBe(200);
  });
});
