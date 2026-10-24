import { describe, expect, it, vi } from "vitest";

describe("envMatches", () => {
  it("only allows writes when the API environment matches the console's", async () => {
    vi.stubEnv("NEXT_PUBLIC_DEPLOY_ENV", "production");
    vi.resetModules();
    const { envMatches } = await import("./env");
    expect(envMatches("production")).toBe(true);
    expect(envMatches("prod")).toBe(true);
    expect(envMatches("development")).toBe(false);
    expect(envMatches("")).toBe(false);
    expect(envMatches(undefined)).toBe(false);
  });

  it("treats dev and staging as development", async () => {
    vi.stubEnv("NEXT_PUBLIC_DEPLOY_ENV", "dev");
    vi.resetModules();
    const { envMatches } = await import("./env");
    expect(envMatches("development")).toBe(true);
    expect(envMatches("production")).toBe(false);
  });
});
