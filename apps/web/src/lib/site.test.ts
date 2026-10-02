import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchSitemapEntries } from "./site";

const entry = (i: number) => ({ id: `id-${i}`, posted_at: "2026-10-01T00:00:00Z", updated_at: "2026-10-01T00:00:00Z" });
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe("fetchSitemapEntries (SEO-01)", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("pages until a short page, covering more than 100 jobs", async () => {
    const pages = [[0, 1, 2].map(entry), [3, 4, 5].map(entry), [6].map(entry)];
    const fetchMock = vi.fn(async (url: string) => (void url, json(pages.shift())));
    vi.stubGlobal("fetch", fetchMock);
    const out = await fetchSitemapEntries(50000, 3);
    expect(out?.map((e) => e.id)).toEqual(["id-0", "id-1", "id-2", "id-3", "id-4", "id-5", "id-6"]);
    expect(String(fetchMock.mock.calls[1][0])).toContain("skip=3&limit=3");
  });

  it("is bounded by max", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json([0, 1, 2].map(entry))));
    expect(await fetchSitemapEntries(5, 3)).toHaveLength(5);
  });

  it("returns null when the endpoint is missing so the caller can fall back", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ detail: "x" }, 422)));
    expect(await fetchSitemapEntries()).toBeNull();
  });

  it("keeps what it read when a later page fails", async () => {
    const responses = [json([0, 1].map(entry)), json({}, 503)];
    vi.stubGlobal("fetch", vi.fn(async () => responses.shift()));
    expect(await fetchSitemapEntries(50000, 2)).toHaveLength(2);
  });
});
