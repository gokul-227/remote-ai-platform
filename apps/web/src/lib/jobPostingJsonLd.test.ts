import { describe, expect, it } from "vitest";
import { inferCountries, jobPostingJsonLd } from "./site";

describe("jobPostingJsonLd", () => {
  it("describes a remote job for Google's job search", () => {
    const ld = jobPostingJsonLd(
      {
        id: "j1",
        title: "Backend Engineer",
        company_name: "Acme",
        description: "<p>Python</p>",
        is_remote: true,
        location: "Remote",
        posted_at: "2026-10-01T00:00:00Z",
        job_type: "full-time",
        salary_min: 70000,
        salary_max: 90000,
        currency: "EUR",
        salary_period: "year",
        skills: ["Python"],
      },
      "https://remoteaiplatform.com",
    );
    expect(ld["@type"]).toBe("JobPosting");
    expect(ld.employmentType).toBe("FULL_TIME");
    expect(ld.jobLocationType).toBe("TELECOMMUTE");
    expect(ld.jobLocation).toBeUndefined();
    expect(ld.url).toBe("https://remoteaiplatform.com/jobs/j1");
    expect(ld.validThrough).toBe("2027-03-30T00:00:00.000Z");
    expect((ld.baseSalary as { currency: string }).currency).toBe("EUR");
    expect(ld.directApply).toBe(false);
  });

  it("can be embedded without closing the script tag", () => {
    const ld = jobPostingJsonLd({ id: "x", title: "T", company_name: "C", description: "</script><b>" }, "https://s");
    expect(JSON.stringify(ld).replace(/</g, "\\u003c")).not.toContain("</script>");
  });
  it("states only the countries a remote posting names, and no office address", () => {
    const ld = jobPostingJsonLd(
      { id: "x", title: "T", company_name: "C", description: "D", is_remote: true, location: "Remote (Germany)" },
      "https://s",
    );
    expect(ld.applicantLocationRequirements).toEqual([{ "@type": "Country", name: "DE" }]);
    expect(ld.jobLocation).toBeUndefined();
    const anywhere = jobPostingJsonLd(
      { id: "x", title: "T", company_name: "C", description: "D", is_remote: true, location: "Worldwide" },
      "https://s",
    );
    expect(anywhere.applicantLocationRequirements).toBeUndefined();
    expect(ld.jobLocationType).toBe("TELECOMMUTE");
  });
  it("does not invent an annual salary when the source omits its pay period", () => {
    const ld = jobPostingJsonLd(
      { id: "x", title: "T", company_name: "C", description: "D", salary_min: 3000, currency: "EUR" },
      "https://s",
    );
    expect(ld.baseSalary).toBeUndefined();
  });
  it("adds addressCountry to on-site locations when it is unambiguous", () => {
    const ld = jobPostingJsonLd(
      { id: "x", title: "T", company_name: "C", description: "D", is_remote: false, location: "Pittsburgh, PA" },
      "https://s",
    );
    expect((ld.jobLocation as { address: { addressCountry?: string } }).address.addressCountry).toBe("US");
  });
  it("infers countries conservatively", () => {
    expect(inferCountries("Latin America")).toEqual([]);
    expect(inferCountries("Toronto, ON; Remote USA")).toEqual(["US", "CA"]);
    expect(inferCountries(null)).toEqual([]);
  });
});
