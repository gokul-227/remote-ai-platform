import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readRoute } from "./App";

describe("resource deep links", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  afterEach(() => {
    window.history.replaceState(null, "", "/");
  });

  it("stores the id from a shared link before the screen reads it", () => {
    window.history.replaceState(null, "", "/#engineer/7f1c-abc");
    expect(readRoute()).toEqual({ route: "engineer", id: "7f1c-abc" });
    expect(sessionStorage.getItem("rap-person-id")).toBe("7f1c-abc");
  });

  it("uses localStorage for the selected job", () => {
    window.history.replaceState(null, "", "/#jobdetail/job-42");
    readRoute();
    expect(localStorage.getItem("rap-selected-job")).toBe("job-42");
  });

  it("rewrites a bare detail route to include the selected id so it can be shared", () => {
    sessionStorage.setItem("rap-company-id", "co-9");
    window.history.replaceState(null, "", "/#company");
    expect(readRoute()).toEqual({ route: "company", id: "co-9" });
    expect(window.location.hash).toBe("#company/co-9");
  });

  it("leaves ordinary routes alone", () => {
    window.history.replaceState(null, "", "/#Jobs");
    expect(readRoute()).toEqual({ route: "jobs", id: null });
    expect(window.location.hash).toBe("#Jobs");
  });

  it("survives a malformed percent-escape instead of crashing (UX-01)", () => {
    window.history.replaceState(null, "", "/#jobdetail/%E0%A4");
    expect(readRoute()).toEqual({ route: "jobdetail", id: "%E0%A4" });
  });

  it("still decodes well-formed escapes", () => {
    window.history.replaceState(null, "", "/#engineer/a%20b");
    expect(readRoute().id).toBe("a b");
  });
});
