import { describe, expect, it } from "vitest";
import { formatPay, toFigmaJob, type ApiJob } from "./live";

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
