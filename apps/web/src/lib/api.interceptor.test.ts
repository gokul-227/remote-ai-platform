import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const refreshSession = vi.fn();
const signOut = vi.fn();
vi.mock("@/lib/supabase", () => ({ supabase: { auth: { refreshSession: () => refreshSession(), signOut: () => signOut() } } }));

import api from "./api";

describe("401 handling", () => {
  beforeEach(() => {
    localStorage.clear();
    window.location.hash = "#jobs";
    refreshSession.mockReset().mockResolvedValue({ data: { session: null }, error: new Error("no session") });
    signOut.mockReset().mockResolvedValue({});
    api.defaults.adapter = async (config) => Promise.reject({ config, response: { status: 401, data: {} } });
  });
  afterEach(() => { api.defaults.adapter = undefined; });

  it("never sends an anonymous visitor to sign-in", async () => {
    await expect(api.get("/auth/me")).rejects.toBeTruthy();
    expect(refreshSession).not.toHaveBeenCalled();
    expect(window.location.hash).toBe("#jobs");
  });

  it("tries to refresh an expired session, then signs out and goes to sign-in", async () => {
    localStorage.setItem("remote_ai_platform_token", "expired");
    await expect(api.get("/auth/me")).rejects.toBeTruthy();
    expect(refreshSession).toHaveBeenCalledTimes(1);
    expect(signOut).toHaveBeenCalled();
    expect(localStorage.getItem("remote_ai_platform_token")).toBeNull();
    expect(window.location.hash).toBe("#login");
  });
});
