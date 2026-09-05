import { describe, expect, it } from "vitest";
import { extractErrorMessage } from "./api";

// Regression coverage for a real bug this comment documents in api.ts:
// backend 422s return `detail` as an array of {field, msg} objects, while
// other errors return a plain string -- rendering `detail` directly crashes
// React when it's an array of objects, so every caller must go through this.
describe("extractErrorMessage", () => {
  it("returns a plain string detail as-is", () => {
    const err = { response: { data: { detail: "Invalid credentials" } } };
    expect(extractErrorMessage(err, "fallback")).toBe("Invalid credentials");
  });

  it("joins an array of {field, msg} validation errors into one string", () => {
    const err = {
      response: {
        data: {
          detail: [
            { loc: ["body", "email"], msg: "field required" },
            { loc: ["body", "password"], msg: "ensure this value has at least 8 characters" },
          ],
        },
      },
    };
    expect(extractErrorMessage(err, "fallback")).toBe(
      "field required ensure this value has at least 8 characters",
    );
  });

  it("falls back when there is no response data at all", () => {
    expect(extractErrorMessage(new Error("network error"), "Something went wrong")).toBe(
      "Something went wrong",
    );
  });

  it("falls back when detail is an empty array", () => {
    const err = { response: { data: { detail: [] } } };
    expect(extractErrorMessage(err, "fallback")).toBe("fallback");
  });

  it("skips array entries with no usable msg field", () => {
    const err = { response: { data: { detail: [{ loc: ["body"] }, { msg: "required" }] } } };
    expect(extractErrorMessage(err, "fallback")).toBe("required");
  });
});
