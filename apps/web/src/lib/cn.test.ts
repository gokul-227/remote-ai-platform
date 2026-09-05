import { describe, expect, it } from "vitest";
import { cn } from "./cn";

describe("cn", () => {
  it("joins plain string arguments with a space", () => {
    expect(cn("card", "card-enterprise")).toBe("card card-enterprise");
  });

  it("drops falsy values (undefined, null, false, empty string)", () => {
    expect(cn("btn", undefined, null, false, "")).toBe("btn");
  });

  it("includes only the truthy keys of a conditional-class object", () => {
    expect(cn({ active: true, disabled: false, pending: true })).toBe("active pending");
  });

  it("flattens nested arrays", () => {
    expect(cn(["a", ["b", "c"]])).toBe("a b c");
  });

  it("combines strings, objects, and arrays in one call", () => {
    expect(cn("base", { "is-open": true }, ["extra"])).toBe("base is-open extra");
  });
});
