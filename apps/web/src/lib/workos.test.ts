import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as workos from "./workos";

type Call = { url: string; body: Record<string, unknown> | null; auth: string | null };

function mockFetch(responses: Record<string, { status: number; body?: unknown }>) {
  const calls: Call[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const headers = (init?.headers ?? {}) as Record<string, string>;
      calls.push({
        url,
        body: init?.body ? JSON.parse(String(init.body)) : null,
        auth: headers.Authorization ?? null,
      });
      const key = Object.keys(responses).find((k) => url.endsWith(k));
      const r = key ? responses[key] : { status: 404 };
      return new Response(r.body === undefined ? null : JSON.stringify(r.body), { status: r.status });
    }),
  );
  return calls;
}

describe("WorkOS sign-in client", () => {
  beforeEach(() => sessionStorage.clear());
  afterEach(() => vi.unstubAllGlobals());

  it("sends and verifies a code through the API", async () => {
    const calls = mockFetch({
      "/magic-auth/send": { status: 204 },
      "/magic-auth/verify": { status: 200, body: { access_token: "a", refresh_token: "r" } },
    });
    await workos.sendCode(" person@example.com ", { existingOnly: true });
    expect(calls[0].body).toEqual({ email: "person@example.com", existing_only: true });
    expect(await workos.verifyCode("person@example.com", " 123456 ")).toEqual({
      access_token: "a",
      refresh_token: "r",
    });
    expect(calls[1].body).toEqual({ email: "person@example.com", code: "123456" });
  });

  it("surfaces the API's message in the shape extractErrorMessage reads", async () => {
    mockFetch({ "/magic-auth/verify": { status: 400, body: { detail: "That code is wrong or has expired." } } });
    const err = await workos.verifyCode("a@example.com", "000000").catch((e) => e);
    expect(err).toBeInstanceOf(workos.WorkOSAuthError);
    expect(err.response.data.detail).toBe("That code is wrong or has expired.");
  });

  it("uses a generic message when the API gives none", async () => {
    mockFetch({ "/refresh": { status: 500 } });
    const err = await workos.refreshTokens("r").catch((e) => e);
    expect(err.status).toBe(500);
    expect(err.message).toMatch(/try again/);
  });

  it("starts OAuth with state and PKCE, then completes only the matching callback", async () => {
    const calls = mockFetch({
      "/authorize": { status: 200, body: { url: "https://api.workos.com/user_management/authorize?x" } },
      "/callback": { status: 200, body: { access_token: "a", refresh_token: "r" } },
    });
    const url = await workos.startOAuth("azure", "http://localhost/auth/callback");
    expect(url).toContain("workos.com");
    const sent = calls[0].body!;
    expect(sent.provider).toBe("microsoft");
    expect(String(sent.code_challenge)).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const state = String(sent.state);
    const saved = JSON.parse(sessionStorage.getItem("rap_workos_oauth")!);

    expect(await workos.completeOAuth(`?code=abc12345&state=${state}`)).toEqual({
      access_token: "a",
      refresh_token: "r",
    });
    expect(calls[1].body).toEqual({ code: "abc12345", code_verifier: saved.verifier });
    // Replayed: the saved state is gone.
    await expect(workos.completeOAuth(`?code=abc12345&state=${state}`)).rejects.toBeInstanceOf(workos.WorkOSAuthError);
  });

  it("treats a non-callback URL as nothing and a provider error as failure", async () => {
    expect(await workos.completeOAuth("")).toBeNull();
    await expect(workos.completeOAuth("?error=access_denied")).rejects.toBeInstanceOf(workos.WorkOSAuthError);
  });

  it("signs out with the bearer token and never throws", async () => {
    const calls = mockFetch({ "/logout": { status: 500 } });
    await workos.signOut("tok", true);
    expect(calls[0].auth).toBe("Bearer tok");
    expect(calls[0].body).toEqual({ everywhere: true });
    await workos.signOut(null);
    expect(calls).toHaveLength(1);
  });

  it("maps the enabled providers to the app's names", async () => {
    mockFetch({ "/config": { status: 200, body: { oauth_providers: ["google", "microsoft"] } } });
    expect(await workos.enabledProviders()).toEqual(["google", "azure"]);
    mockFetch({ "/config": { status: 503 } });
    expect(await workos.enabledProviders()).toBeNull();
  });
});
