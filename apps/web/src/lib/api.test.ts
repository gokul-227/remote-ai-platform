import { describe, expect, it } from "vitest";
import { extractErrorMessage } from "./api";

const err = (data: unknown) => ({ response: { data } });

describe("extractErrorMessage", () => {
  it("reads a string detail", () => {
    expect(extractErrorMessage(err({ detail: "Not found" }), "fallback")).toBe("Not found");
  });
  it("joins validation messages", () => {
    expect(extractErrorMessage(err({ detail: [{ msg: "a" }, { msg: "b" }] }), "fallback")).toBe("a b");
  });
  it("reads the { error } envelope used for AI limits and domain errors", () => {
    expect(extractErrorMessage(err({ success: false, error: "You've used this month's AI allowance." }), "fallback")).toBe(
      "You've used this month's AI allowance.",
    );
  });
  it("falls back when there is no usable message", () => {
    expect(extractErrorMessage(new Error("network"), "fallback")).toBe("fallback");
  });
});
