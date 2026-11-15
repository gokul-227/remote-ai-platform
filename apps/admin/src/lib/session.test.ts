import { afterEach, describe, expect, it, vi } from "vitest";

async function load(provider: string) {
  vi.stubEnv("NEXT_PUBLIC_AUTH_PROVIDER", provider);
  vi.resetModules();
  return import("./session");
}

function mockFetch(handler: (path: string, body: Record<string, unknown>) => [number, unknown?]) {
  const fn = vi.fn(async (url: string, init?: RequestInit) => {
    const path = url.replace(/^.*\/api\/v1\/auth\/workos/, "");
    const [status, body] = handler(path, init?.body ? JSON.parse(String(init.body)) : {});
    return new Response(body === undefined ? null : JSON.stringify(body), { status });
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

describe("staff session (WorkOS)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    localStorage.clear();
  });

  it("sends codes to existing accounts only, verifies, refreshes and signs out", async () => {
    const s = await load("workos");
    expect(s.isWorkOS()).toBe(true);
    const seen: [string, Record<string, unknown>][] = [];
    mockFetch((path, body) => {
      seen.push([path, body]);
      if (path === "/magic-auth/send") return [204];
      if (path === "/magic-auth/verify") return [200, { access_token: "a1", refresh_token: "r1" }];
      if (path === "/refresh") return [200, { access_token: "a2", refresh_token: "r2" }];
      return [204];
    });
    const changes: (string | null)[] = [];
    const off = s.onSessionChange((x) => changes.push(x?.access_token ?? null));

    expect(await s.sendCode("staff@example.com")).toBe("");
    expect(seen[0]).toEqual(["/magic-auth/send", { email: "staff@example.com", existing_only: true }]);
    expect(await s.verifyCode("staff@example.com", "123456")).toBe("");
    expect((await s.getSession())?.access_token).toBe("a1");
    expect((await s.refreshSession())?.refresh_token).toBe("r2");
    await s.signOut();
    expect(await s.getSession()).toBeNull();
    expect(changes).toEqual(["a1", "a2", null]);
    off();
  });

  it("returns the API's message on a wrong code and ends a dead session", async () => {
    const s = await load("workos");
    mockFetch((path) =>
      path === "/magic-auth/verify" ? [400, { detail: "That code is wrong or has expired." }] : [401],
    );
    expect(await s.verifyCode("a@example.com", "000000")).toBe("That code is wrong or has expired.");
    expect(await s.refreshSession()).toBeNull();
    localStorage.setItem("rap-admin-workos", JSON.stringify({ access_token: "x", refresh_token: "r" }));
    expect(await s.refreshSession()).toBeNull();
  });

  it("stays on Supabase by default", async () => {
    const s = await load("");
    expect(s.isWorkOS()).toBe(false);
    expect(await s.refreshSession()).toBeNull();
  });
});
