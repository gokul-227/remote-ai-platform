import { describe, expect, it } from "vitest";
import { deployEnvProblems, isIndexable } from "./deployEnv";

const good = {
  NEXT_PUBLIC_DEPLOY_ENV: "production",
  NEXT_PUBLIC_API_URL: "https://api.example.com",
  NEXT_PUBLIC_SUPABASE_URL: "https://abc.supabase.co",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_x",
  NEXT_PUBLIC_SITE_URL: "https://example.com",
};

describe("deployEnvProblems", () => {
  it("accepts a complete deployed configuration", () => {
    expect(deployEnvProblems(good)).toEqual([]);
    expect(deployEnvProblems({ ...good, NEXT_PUBLIC_DEPLOY_ENV: "dev" })).toEqual([]);
  });

  it("rejects missing, local or placeholder values in a deployed build (SEC-05)", () => {
    expect(deployEnvProblems({ ...good, NEXT_PUBLIC_API_URL: undefined })).toHaveLength(1);
    expect(deployEnvProblems({ ...good, NEXT_PUBLIC_API_URL: "http://localhost:8000" })).toHaveLength(1);
    expect(deployEnvProblems({ ...good, NEXT_PUBLIC_API_URL: "http://api.example.com" })).toHaveLength(1);
    expect(deployEnvProblems({ ...good, NEXT_PUBLIC_SUPABASE_URL: "https://placeholder.supabase.co" })).toHaveLength(1);
    expect(deployEnvProblems({ ...good, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "" })).toHaveLength(1);
    expect(deployEnvProblems({ NEXT_PUBLIC_DEPLOY_ENV: "production" })).toHaveLength(4);
    expect(deployEnvProblems({ ...good, NEXT_PUBLIC_SITE_URL: undefined })).toHaveLength(1);
    expect(deployEnvProblems({ ...good, NEXT_PUBLIC_DEPLOY_ENV: "dev", NEXT_PUBLIC_SITE_URL: undefined })).toEqual([]);
  });

  it("does not constrain local, CI or E2E builds", () => {
    expect(deployEnvProblems({})).toEqual([]);
    expect(deployEnvProblems({ NEXT_PUBLIC_API_URL: "http://localhost:18000" })).toEqual([]);
  });
});

describe("isIndexable", () => {
  it("allows indexing only for production (SEO-02)", () => {
    expect(isIndexable({ NEXT_PUBLIC_DEPLOY_ENV: "production" })).toBe(true);
    expect(isIndexable({ NEXT_PUBLIC_DEPLOY_ENV: "dev" })).toBe(false);
    expect(isIndexable({})).toBe(false);
  });
});
