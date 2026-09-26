import { describe, expect, it } from "vitest";
import { homeFor, safeRedirect } from "./destinations";

describe("auth destinations", () => {
  it("routes each role to its home", () => {
    expect(homeFor("ENGINEER")).toBe("/feed");
    expect(homeFor("COMPANY")).toBe("/company/dashboard");
    expect(homeFor("ADMIN")).toBe("/admin/dashboard");
    expect(homeFor(undefined)).toBe("/feed");
  });

  it("only accepts same-origin path redirects", () => {
    expect(safeRedirect("/jobs/123?tab=x")).toBe("/jobs/123?tab=x");
    expect(safeRedirect("//evil.com")).toBeNull();
    expect(safeRedirect("/\\evil.com")).toBeNull();
    expect(safeRedirect("https://evil.com")).toBeNull();
    expect(safeRedirect("/auth/login")).toBeNull();
    expect(safeRedirect(null)).toBeNull();
  });
});
