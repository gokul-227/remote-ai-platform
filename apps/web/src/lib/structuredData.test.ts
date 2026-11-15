/**
 * Shape checks for every JSON-LD block the public pages emit, against the
 * properties schema.org and Google's rich-result docs require. A failing check
 * here would be a Search Console "invalid item" error in production.
 */
import { describe, expect, it } from "vitest";
import { breadcrumbJsonLd, organizationJsonLd, websiteJsonLd } from "./brand";
import { GUIDES, guideJsonLd } from "./guides";
import { jobHighlights, jobPostingJsonLd, type PublicJob } from "./site";
import { topicForSearch } from "./seo";

type LD = Record<string, unknown>;
const SITE = "https://remoteaiplatform.com";
const isUrl = (v: unknown) => typeof v === "string" && /^https:\/\/[^\s]+$/.test(v);
const isIsoDate = (v: unknown) => typeof v === "string" && !Number.isNaN(Date.parse(v));

/** Problems with a JSON-LD object, by its @type; empty when valid. */
export function validate(ld: LD): string[] {
  const errs: string[] = [];
  const need = (k: string) => {
    if (ld[k] === undefined || ld[k] === null || ld[k] === "") errs.push(`missing ${k}`);
  };
  if (!String(ld["@context"] ?? "").startsWith("https://schema.org")) errs.push("bad @context");
  switch (ld["@type"]) {
    case "JobPosting": {
      ["title", "description", "datePosted", "hiringOrganization"].forEach(need);
      if (!isIsoDate(ld.datePosted)) errs.push("datePosted not ISO");
      if (ld.validThrough && !isIsoDate(ld.validThrough)) errs.push("validThrough not ISO");
      const org = ld.hiringOrganization as LD | undefined;
      if (!org?.name) errs.push("hiringOrganization.name");
      // Google: either a jobLocation or a remote job (TELECOMMUTE).
      if (!ld.jobLocation && ld.jobLocationType !== "TELECOMMUTE") errs.push("no jobLocation or TELECOMMUTE");
      if (ld.applicantLocationRequirements && ld.jobLocationType !== "TELECOMMUTE")
        errs.push("applicantLocationRequirements without TELECOMMUTE");
      for (const c of (ld.applicantLocationRequirements as LD[] | undefined) ?? [])
        if (c["@type"] !== "Country" || !/^[A-Z]{2}$/.test(String(c.name))) errs.push("bad country");
      const pay = ld.baseSalary as LD | undefined;
      if (pay) {
        const v = pay.value as LD;
        if (!/^[A-Z]{3}$/.test(String(pay.currency))) errs.push("baseSalary.currency");
        if (!["HOUR", "DAY", "WEEK", "MONTH", "YEAR"].includes(String(v?.unitText))) errs.push("unitText");
        if (v?.minValue == null && v?.maxValue == null && v?.value == null) errs.push("salary value");
      }
      const types = ["FULL_TIME", "PART_TIME", "CONTRACTOR", "TEMPORARY", "INTERN", "VOLUNTEER", "PER_DIEM", "OTHER"];
      if (ld.employmentType && !types.includes(String(ld.employmentType))) errs.push("employmentType");
      break;
    }
    case "BreadcrumbList": {
      const items = ld.itemListElement as LD[];
      if (!items?.length) errs.push("empty breadcrumb");
      items?.forEach((it, i) => {
        if (it.position !== i + 1) errs.push(`position ${i}`);
        if (!it.name) errs.push(`name ${i}`);
        if (i < items.length - 1 && !isUrl(it.item)) errs.push(`item ${i}`);
      });
      break;
    }
    case "Article":
      ["headline", "author", "publisher", "datePublished", "dateModified"].forEach(need);
      if (String(ld.headline).length > 110) errs.push("headline too long");
      if ((ld.author as LD)?.["@type"] !== "Organization") errs.push("author must be the site");
      break;
    case "Organization":
      ["name", "url"].forEach(need);
      break;
    case "WebSite": {
      need("url");
      const action = ld.potentialAction as LD | undefined;
      if (action) {
        const target = action.target as LD | string;
        const tpl = typeof target === "string" ? target : String(target?.urlTemplate ?? "");
        if (!tpl.includes("{search_term_string}")) errs.push("SearchAction template");
      }
      break;
    }
    default:
      errs.push(`unknown @type ${String(ld["@type"])}`);
  }
  return errs;
}

const job = (over: Partial<PublicJob> = {}): PublicJob => ({
  id: "0b1f2c4e-0000-4000-8000-000000000001",
  title: "Backend Engineer",
  company_name: "Acme",
  description: "Build APIs in Python.",
  is_remote: true,
  location: "Remote, Germany",
  posted_at: "2026-11-01T00:00:00Z",
  job_type: "full-time",
  salary_min: 70000,
  salary_max: 90000,
  currency: "EUR",
  salary_period: "year",
  skills: ["Python", "PostgreSQL"],
  source: "DIRECT",
  ...over,
});

describe("structured data validates", () => {
  it.each([
    ["remote with pay and country", job()],
    ["remote, no country, no pay", job({ location: "Remote", salary_min: null, salary_max: null })],
    ["on-site", job({ is_remote: false, location: "Berlin, Germany", job_type: "contract" })],
    ["unknown employment type", job({ job_type: "unspecified" })],
    ["hourly", job({ salary_period: "hour", salary_min: 50, salary_max: null })],
  ])("JobPosting: %s", (_, j) => {
    expect(validate(jobPostingJsonLd(j, SITE))).toEqual([]);
  });

  it("never claims worldwide eligibility the listing does not state", () => {
    expect(jobPostingJsonLd(job({ location: "Remote" }), SITE).applicantLocationRequirements).toBeUndefined();
  });

  it("breadcrumbs, organisation, website and guides", () => {
    const trail: [string, string][] = [
      ["Remote AI Platform", "/"],
      ["Guides", "/guides"],
      ["How to find a remote job", "/guides/how-to-find-a-remote-job"],
    ];
    expect(validate(breadcrumbJsonLd(SITE, trail))).toEqual([]);
    expect(validate(organizationJsonLd(SITE, "contact@example.com"))).toEqual([]);
    expect(validate(websiteJsonLd(SITE))).toEqual([]);
    for (const g of GUIDES) expect(validate(guideJsonLd(g, SITE))).toEqual([]);
  });

  it("the validator catches broken items", () => {
    expect(validate({ "@context": "https://schema.org", "@type": "JobPosting", title: "x" })).toContain(
      "missing hiringOrganization",
    );
  });
});

describe("job highlights", () => {
  it("lists only what the listing states", () => {
    const h = Object.fromEntries(jobHighlights(job({ seniority: "senior", visa_sponsorship: false })));
    expect(h.Salary).toBe("€70,000 – €90,000 a year");
    expect(h["Hiring in"]).toBe("DE (as named in the listing)");
    expect(h.Seniority).toBe("Senior");
    expect(h["Visa sponsorship"]).toBe("Not offered");
    expect(h["Employment type"]).toBe("Full time");
    const bare = Object.fromEntries(
      jobHighlights(job({ salary_min: null, salary_max: null, job_type: "unspecified", location: "Remote" })),
    );
    expect(bare.Salary).toBeUndefined();
    expect(bare["Employment type"]).toBeUndefined();
    expect(bare["Hiring in"]).toBeUndefined();
  });

  it("formats time-zone bands", () => {
    const h = Object.fromEntries(jobHighlights(job({ tz_min: -5, tz_max: 1 })));
    expect(h["Time zones"]).toBe("UTC−5 to UTC+1");
  });
});

describe("search terms that name a category", () => {
  it("map to the landing page", () => {
    expect(topicForSearch("Python")?.slug).toBe("python");
    expect(topicForSearch(" full stack ")?.slug).toBe("full-stack");
    expect(topicForSearch("python django")).toBeNull();
  });
});
