import { describe, expect, it } from "vitest";
import { jobPostingJsonLd } from "./site";

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
        skills: ["Python"],
      },
      "https://remoteaiplatform.com",
    );
    expect(ld["@type"]).toBe("JobPosting");
    expect(ld.employmentType).toBe("FULL_TIME");
    expect(ld.jobLocationType).toBe("TELECOMMUTE");
    expect(ld.jobLocation).toBeUndefined();
    expect(ld.url).toBe("https://remoteaiplatform.com/jobs/j1");
    expect(ld.validThrough).toBe("2026-12-30T00:00:00.000Z");
    expect((ld.baseSalary as { currency: string }).currency).toBe("EUR");
    expect(ld.directApply).toBe(false);
  });

  it("can be embedded without closing the script tag", () => {
    const ld = jobPostingJsonLd({ id: "x", title: "T", company_name: "C", description: "</script><b>" }, "https://s");
    expect(JSON.stringify(ld).replace(/</g, "\\u003c")).not.toContain("</script>");
  });
});
