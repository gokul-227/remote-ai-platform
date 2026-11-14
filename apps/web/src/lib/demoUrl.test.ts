import { describe, expect, it } from "vitest";
import { demoUrl } from "./demoUrl";

describe("direct demo previews", () => {
  it("allows public HTTPS pages and normalises a bare hostname", () => {
    expect(demoUrl("example.com/demo")).toBe("https://example.com/demo");
    expect(demoUrl("https://github.com/morluto/rea")).toBe("https://github.com/morluto/rea");
  });
  it.each([
    "http://example.com",
    "http://127.0.0.1:8000",
    "https://2130706433",
    "https://[::1]",
    "https://localhost",
    "https://app.local",
    "https://user:pass@example.com",
    "javascript:alert(1)",
  ])("refuses unsafe preview %s", (url) => {
    expect(demoUrl(url)).toBeUndefined();
  });
});
