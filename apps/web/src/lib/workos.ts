/**
 * WorkOS AuthKit sign-in, behind NEXT_PUBLIC_AUTH_PROVIDER=workos.
 *
 * The app keeps its own sign-in screens: email codes, Google/GitHub/Microsoft,
 * refresh and sign-out go through this app's API (/api/v1/auth/workos/*),
 * which holds the WorkOS API key. Tokens are WorkOS's own access/refresh
 * tokens, stored exactly where the Supabase ones were, so the rest of the app
 * does not care which provider signed the user in.
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const BASE = `${API_URL}/api/v1/auth/workos`;

export const WORKOS_ENABLED = process.env.NEXT_PUBLIC_AUTH_PROVIDER === "workos";

/** The app's names for sign-in options; "azure" is Supabase's name for Microsoft. */
export type AppOAuthProvider = "google" | "azure" | "github";
const TO_WORKOS: Record<AppOAuthProvider, string> = { google: "google", azure: "microsoft", github: "github" };

export interface Tokens {
  access_token: string;
  refresh_token: string | null;
}

/** Shaped like an axios error so extractErrorMessage() shows the API's own wording. */
export class WorkOSAuthError extends Error {
  response: { status: number; data: { detail: string } };
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.response = { status, data: { detail: message } };
  }
}

async function call<T>(path: string, body: unknown, token?: string | null): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, { method: "POST", headers, body: JSON.stringify(body) });
  const text = await res.text();
  let parsed: unknown = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = null;
  }
  if (!res.ok) {
    const detail = (parsed as { detail?: unknown } | null)?.detail;
    throw new WorkOSAuthError(
      res.status,
      typeof detail === "string" ? detail : "Something went wrong. Please try again.",
    );
  }
  return parsed as T;
}

/** Email a one-time sign-in code. `existingOnly`: staff console, never creates accounts. */
export async function sendCode(email: string, opts: { existingOnly?: boolean } = {}): Promise<void> {
  await call("/magic-auth/send", { email: email.trim(), existing_only: Boolean(opts.existingOnly) });
}

export function verifyCode(email: string, code: string): Promise<Tokens> {
  return call<Tokens>("/magic-auth/verify", { email: email.trim(), code: code.trim() });
}

export function refreshTokens(refreshToken: string): Promise<Tokens> {
  return call<Tokens>("/refresh", { refresh_token: refreshToken });
}

/** Ends the WorkOS session (or all of them). Never throws: local sign-out must always finish. */
export async function signOut(accessToken: string | null, everywhere = false): Promise<void> {
  if (!accessToken) return;
  try {
    await call("/logout", { everywhere }, accessToken);
  } catch {
    // Offline or already signed out.
  }
}

/** Which OAuth options the API has switched on (all three once WorkOS is configured). */
export async function enabledProviders(): Promise<AppOAuthProvider[] | null> {
  try {
    const res = await fetch(`${BASE}/config`);
    if (!res.ok) return null;
    const cfg = (await res.json()) as { oauth_providers?: string[] };
    const on = new Set(cfg.oauth_providers ?? []);
    return (Object.keys(TO_WORKOS) as AppOAuthProvider[]).filter((p) => on.has(TO_WORKOS[p]));
  } catch {
    return null;
  }
}

const OAUTH_STATE_KEY = "rap_workos_oauth";

function randomString(bytes: number): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return base64url(buf);
}

function base64url(buf: Uint8Array): string {
  let s = "";
  buf.forEach((b) => (s += String.fromCharCode(b)));
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function challengeFor(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return base64url(new Uint8Array(digest));
}

/** Start a Google/GitHub/Microsoft sign-in: state + PKCE kept in this tab only. */
export async function startOAuth(provider: AppOAuthProvider, redirectUri: string): Promise<string> {
  const state = randomString(24);
  const verifier = randomString(48);
  sessionStorage.setItem(OAUTH_STATE_KEY, JSON.stringify({ state, verifier }));
  const { url } = await call<{ url: string }>("/authorize", {
    provider: TO_WORKOS[provider],
    redirect_uri: redirectUri,
    state,
    code_challenge: await challengeFor(verifier),
  });
  return url;
}

/** Finish an OAuth sign-in on /auth/callback. null when this URL is not a WorkOS callback. */
export async function completeOAuth(search: string): Promise<Tokens | null> {
  const params = new URLSearchParams(search);
  const code = params.get("code");
  if (params.get("error")) throw new WorkOSAuthError(400, "Sign-in was cancelled or didn't complete.");
  if (!code) return null;
  let saved: { state?: string; verifier?: string } = {};
  try {
    saved = JSON.parse(sessionStorage.getItem(OAUTH_STATE_KEY) || "{}");
  } catch {
    saved = {};
  }
  sessionStorage.removeItem(OAUTH_STATE_KEY);
  // A callback this tab did not start (or a replayed link) is refused.
  if (!saved.state || saved.state !== params.get("state")) {
    throw new WorkOSAuthError(400, "Sign-in was cancelled or didn't complete. Choose another method or try again.");
  }
  return call<Tokens>("/callback", { code, code_verifier: saved.verifier });
}
