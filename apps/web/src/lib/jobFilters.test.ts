import { describe, expect, it } from "vitest";
import {
  activeCount,
  chips,
  clearAll,
  describe as describeFilters,
  facetCount,
  parseFilters,
  toApiParams,
  toQueryString,
  toggle,
  withValue,
} from "./jobFilters";

describe("job filter URL state", () => {
  it("round-trips through a shareable query string", () => {
    const f = parseFilters("#jobs?workplace=remote&workplace=hybrid&posted_within=7d&query=%22data+eng%22&junk=1");
    expect(f).toEqual({ workplace: ["remote", "hybrid"], posted_within: "7d", query: '"data eng"' });
    expect(parseFilters(toQueryString(f))).toEqual(f);
    // Stable order: scalars first, then lists.
    expect(toQueryString(f)).toBe("query=%22data+eng%22&posted_within=7d&workplace=remote&workplace=hybrid");
  });

  it("parses server searchParams objects and drops duplicates and blanks", () => {
    expect(parseFilters({ seniority: ["entry", "entry", " "], sort: "recent", tz: "2" })).toEqual({
      seniority: ["entry"],
      tz: "2",
    });
  });

  it("adds salary units whenever an amount is set, and drops them with it", () => {
    let f = withValue({}, "min_salary", "90000");
    expect(f).toMatchObject({ min_salary: "90000", salary_currency: "USD", salary_period: "year" });
    expect(toApiParams(f)).toEqual({ min_salary: "90000", salary_currency: "USD", salary_period: "year" });
    f = withValue(f, "min_salary", undefined);
    expect(f).toEqual({});
    expect(parseFilters("max_salary=50")).toMatchObject({ salary_currency: "USD", salary_period: "year" });
  });

  it("toggles multi-value filters and builds removable chips", () => {
    let f = toggle({}, "job_type", "contract");
    f = toggle(f, "job_type", "freelance");
    f = toggle(f, "job_type", "contract");
    expect(f.job_type).toEqual(["freelance"]);
    f = { ...f, apply: "platform", has_salary: "true", sort: "salary" };
    const labels = chips(f).map((c) => c.label);
    expect(labels).toEqual(["Freelance", "Has salary", "Easy Apply"]);
    expect(activeCount(f)).toBe(3); // sort is not a filter
    const without = chips(f)[0].remove(f);
    expect(without.job_type).toBeUndefined();
    expect(clearAll(f)).toEqual({ sort: "salary" });
    expect(describeFilters(f)).toBe("Freelance · Has salary · Easy Apply");
    expect(describeFilters({})).toBe("All jobs");
  });

  it("reads facet counts, zero for absent values, undefined when not loaded", () => {
    const facets = { workplace: [{ value: "remote", count: 12 }], has_salary: [{ value: true, count: 3 }] };
    expect(facetCount(facets, "workplace", "remote")).toBe(12);
    expect(facetCount(facets, "workplace", "hybrid")).toBe(0);
    expect(facetCount(facets, "has_salary", true)).toBe(3);
    expect(facetCount(undefined, "workplace", "remote")).toBeUndefined();
  });
});
