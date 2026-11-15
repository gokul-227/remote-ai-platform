import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
vi.mock("@/lib/site", async (orig) => ({
  ...(await orig<typeof import("@/lib/site")>()),
  SITE_URL: "https://remoteaiplatform.com",
  API_URL: "https://api.example.com",
}));
import { BRAND, breadcrumbJsonLd, organizationJsonLd, websiteJsonLd } from "./brand";
import { PLACES, fetchPlaceJobs } from "./seo";
import { landingSitemap, staticSitemap } from "./sitemaps";
import manifest from "@/app/manifest";
import { Breadcrumbs, JsonLd, PublicFooter } from "@/app/PublicChrome";

afterEach(() => vi.unstubAllGlobals());

describe("brand identity", () => {
  it("uses the Figma palette in the manifest", () => {
    const m = manifest();
    expect(m.theme_color).toBe("#175CD3");
    expect(m.icons?.some((i) => i.purpose === "maskable")).toBe(true);
  });
  it("describes the organisation and site for search engines", () => {
    const org = organizationJsonLd("https://s", "hi@s");
    expect(org.logo.url).toBe("https://s/icons/icon-512.png");
    expect(websiteJsonLd("https://s").publisher).toEqual({ "@id": "https://s/#organization" });
    const crumbs = breadcrumbJsonLd("https://s", [
      ["Home", "/"],
      ["Jobs", "/remote-jobs"],
    ]);
    expect(crumbs.itemListElement[1]).toMatchObject({ position: 2, item: "https://s/remote-jobs" });
    expect(BRAND.navy).toBe("#102A43");
  });
});

describe("public chrome", () => {
  it("has a trust footer with privacy, terms, trust, status and contact", () => {
    const html = renderToStaticMarkup(<PublicFooter />);
    for (const href of ["/privacy", "/terms", "/trust", "/status", "/impressum", "mailto:"])
      expect(html).toContain(href);
  });
  it("marks the current breadcrumb and escapes JSON-LD", () => {
    const html = renderToStaticMarkup(
      <Breadcrumbs
        trail={[
          ["Home", "/"],
          ["Jobs", "/remote-jobs"],
        ]}
      />,
    );
    expect(html).toContain('aria-current="page"');
    expect(renderToStaticMarkup(<JsonLd data={{ x: "</script>" }} />)).not.toContain("</script><");
  });
});

describe("location landing pages", () => {
  it("are listed in the landing sitemap only when they have enough jobs", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("/employers")) return new Response("[]");
        const thin = url.includes("location=usa") ? 1 : 0;
        return new Response(
          JSON.stringify({
            total:
              url.includes("location=") && !url.includes("query=") && !url.includes("job_type=") ? (thin ? 2 : 9) : 0,
            new_last_7_days: 0,
            top_companies: [],
          }),
        );
      }),
    );
    const xml = await landingSitemap();
    vi.unstubAllGlobals();
    for (const p of PLACES.filter((p) => p.slug !== "usa")) expect(xml).toContain(`/remote-jobs/in/${p.slug}<`);
    expect(xml).not.toContain("/remote-jobs/in/usa<");
    expect(staticSitemap()).toContain("/trust");
  });
  it("query the API's location filter and read the total", async () => {
    const fetch = vi.fn(async (_url: string) => new Response("[]", { headers: { "x-total-count": "7" } }));
    vi.stubGlobal("fetch", fetch);
    expect((await fetchPlaceJobs(PLACES[0], 1)).total).toBe(7);
    expect(String(fetch.mock.calls[0][0])).toContain("location=usa");
  });
});
