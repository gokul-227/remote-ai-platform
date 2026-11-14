import { describe, expect, it } from "vitest";
import { permitsGoogleJobs, originalJobUrl, jobSourceName } from "./jobSources";

describe("job distribution policies", () => {
  it("excludes sources that prohibit Google Jobs redistribution", () => {
    for (const source of ["REMOTIVE", "remotive", "HIMALAYAS"]) expect(permitsGoogleJobs(source)).toBe(false);
    expect(permitsGoogleJobs("DIRECT")).toBe(true);
  });
  it("links visibly to the named source without unsafe URLs", () => {
    expect(jobSourceName("REMOTEOK")).toBe("Remote OK");
    expect(originalJobUrl("https://remotive.com/jobs/example")).toBe("https://remotive.com/jobs/example");
    for (const bad of ["javascript:alert(1)", "//example.com", "https://user:secret@example.com", "data:text/html,x"])
      expect(originalJobUrl(bad)).toBeUndefined();
  });
});
