import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const refreshSession = vi.fn();
const signOut = vi.fn();
vi.mock("@/lib/supabase", () => ({
  supabase: { auth: { refreshSession: () => refreshSession(), signOut: () => signOut() } },
}));

import api from "./api";

describe("401 handling", () => {
  beforeEach(() => {
    localStorage.clear();
    window.location.hash = "#jobs";
    refreshSession.mockReset().mockResolvedValue({ data: { session: null }, error: new Error("no session") });
    signOut.mockReset().mockResolvedValue({});
    api.defaults.adapter = async (config) => Promise.reject({ config, response: { status: 401, data: {} } });
  });
  afterEach(() => {
    api.defaults.adapter = undefined;
  });

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

  it("shares one refresh between concurrent expired requests (AUTH-02)", async () => {
    localStorage.setItem("remote_ai_platform_token", "expired");
    let resolve!: (v: unknown) => void;
    refreshSession.mockReturnValue(new Promise((r) => (resolve = r)));
    const seen: string[] = [];
    api.defaults.adapter = async (config) => {
      const auth = String(config.headers?.Authorization);
      seen.push(auth);
      if (auth === "Bearer fresh") return { config, data: { ok: true }, status: 200, statusText: "OK", headers: {} };
      return Promise.reject({ config, response: { status: 401, data: {} } });
    };
    const calls = [api.get("/a"), api.get("/b"), api.get("/c")];
    await new Promise((r) => setTimeout(r, 0));
    resolve({ data: { session: { access_token: "fresh", refresh_token: "r2" } }, error: null });
    const results = await Promise.all(calls);
    expect(refreshSession).toHaveBeenCalledTimes(1);
    expect(results.every((r) => r.status === 200)).toBe(true);
    expect(signOut).not.toHaveBeenCalled();
    expect(localStorage.getItem("remote_ai_platform_token")).toBe("fresh");
  });

  it("keeps working signed-out when storage is blocked", async () => {
    const getItem = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("denied", "SecurityError");
    });
    try {
      api.defaults.adapter = async (config) => ({ config, data: config.headers?.Authorization ?? "anon", status: 200, statusText: "OK", headers: {} });
      const res = await api.get("/jobs");
      expect(res.data).toBe("anon");
    } finally {
      getItem.mockRestore();
    }
  });
});
