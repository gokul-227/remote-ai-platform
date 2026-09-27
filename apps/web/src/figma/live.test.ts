import { describe, expect, it } from "vitest";
import { formatPay, safeHref, toFigmaJob, type ApiJob } from "./live";

const job = (over: Partial<ApiJob>): ApiJob => ({ id: "1", title: "Role", ...over });

describe("formatPay", () => {
  it("uses the period the source states", () => {
    expect(formatPay(job({ salary_min: 70000, salary_max: 80000, salary_period: "year", currency: "USD" }))).toBe(
      "$70K - $80K/yr",
    );
    expect(formatPay(job({ salary_min: 45, salary_max: 45, salary_period: "hour", currency: "EUR" }))).toBe(
      "EUR 45/hr",
    );
  });
  it("does not guess hourly from a small amount", () => {
    expect(formatPay(job({ salary_min: 500, salary_max: 900 }))).toBe("$500 - $900");
  });
  it("labels a project budget", () => {
    expect(formatPay(job({ budget_min: 2000, budget_max: 5000 }))).toBe("$2,000 - $5,000 budget");
  });
  it("is empty without pay data", () => {
    expect(formatPay(job({}))).toBe("");
  });
});

describe("toFigmaJob", () => {
  it("hides an unspecified job type instead of claiming full-time", () => {
    expect(toFigmaJob(job({ job_type: "unspecified" })).type).toBe("");
    expect(toFigmaJob(job({})).type).toBe("");
    expect(toFigmaJob(job({ job_type: "part-time" })).type).toBe("Part-time");
  });
});

describe("safeHref", () => {
  it("keeps http(s) links", () => {
    expect(safeHref("https://example.com/a?b=1")).toBe("https://example.com/a?b=1");
    expect(safeHref(" http://example.com ")).toBe("http://example.com/");
  });
  it("drops script, data and other schemes, and junk", () => {
    for (const bad of [
      "javascript:alert(1)",
      " JavaScript:alert(1)",
      "data:text/html,x",
      "vbscript:x",
      "ftp://x.org",
      "not a url",
      "",
      null,
      undefined,
    ]) {
      expect(safeHref(bad)).toBeUndefined();
    }
  });
});

describe("return after sign-in", () => {
  it("returns once to the page the visitor was on", async () => {
    const { rememberReturnTo, takeReturnTo } = await import("./live");
    rememberReturnTo("jobdetail/3f2a-uuid");
    expect(takeReturnTo("feed")).toBe("jobdetail/3f2a-uuid");
    expect(takeReturnTo("feed")).toBe("feed");
  });
  it("never returns to an auth screen or anything that isn't a plain route", async () => {
    const { rememberReturnTo, takeReturnTo } = await import("./live");
    rememberReturnTo("login");
    expect(takeReturnTo("feed")).toBe("feed");
    for (const bad of ["https://evil.example", "//evil.example", "jobs?x=1", "javascript:alert(1)", "jobs/../../x/y"]) {
      sessionStorage.setItem("rap-return-to", bad);
      expect(takeReturnTo("feed")).toBe("feed");
    }
  });
});
