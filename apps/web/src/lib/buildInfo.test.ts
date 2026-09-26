import { afterEach, describe, expect, it, vi } from "vitest";
import { buildInfo } from "./buildInfo";

describe("buildInfo", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("reports the injected build metadata", () => {
    vi.stubEnv("NEXT_PUBLIC_BUILD_SHA", "abc123");
    vi.stubEnv("NEXT_PUBLIC_DEPLOY_ENV", "dev");
    expect(buildInfo()).toMatchObject({ git_sha: "abc123", environment: "dev" });
  });

  it("says unknown instead of guessing when nothing was injected", () => {
    vi.stubEnv("NEXT_PUBLIC_BUILD_SHA", "");
    expect(buildInfo().git_sha).toBe("unknown");
  });
});
