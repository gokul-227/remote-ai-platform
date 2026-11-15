/**
 * Staff sign-in, provider-neutral: Supabase Auth today, WorkOS AuthKit when the
 * console is built with NEXT_PUBLIC_AUTH_PROVIDER=workos. Email codes only, for
 * existing accounts only (the console never creates users).
 *
 * WorkOS calls go through the API (/api/v1/auth/workos/*), which holds the
 * WorkOS key; the tokens are kept in this browser's storage like Supabase's.
 */
import { createClient } from "@supabase/supabase-js";
import { API_URL, AUTH_PROVIDER, SUPABASE_KEY, SUPABASE_URL } from "./env";

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  // Inert with WorkOS sign-in, so Supabase can be switched off entirely.
  auth: {
    persistSession: AUTH_PROVIDER !== "workos",
    autoRefreshToken: AUTH_PROVIDER !== "workos",
    detectSessionInUrl: AUTH_PROVIDER !== "workos",
    storageKey: "rap-admin-auth",
  },
});

export interface StaffSession {
  access_token: string;
  refresh_token: string | null;
}

const WORKOS_KEY = "rap-admin-workos";
const listeners = new Set<(s: StaffSession | null) => void>();

function readWorkOS(): StaffSession | null {
  try {
    const raw = localStorage.getItem(WORKOS_KEY);
    return raw ? (JSON.parse(raw) as StaffSession) : null;
  } catch {
    return null;
  }
}

function writeWorkOS(s: StaffSession | null) {
  try {
    if (s) localStorage.setItem(WORKOS_KEY, JSON.stringify(s));
    else localStorage.removeItem(WORKOS_KEY);
  } catch {
    // Storage blocked: the session lasts for this page only.
  }
  listeners.forEach((cb) => cb(s));
}

async function workosCall<T>(path: string, body: unknown, token?: string | null): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API_URL}/api/v1/auth/workos${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const text = await res.text();
  const parsed = text ? (JSON.parse(text) as { detail?: unknown }) : null;
  if (!res.ok) throw new Error(typeof parsed?.detail === "string" ? parsed.detail : "Sign-in failed. Try again.");
  return parsed as T;
}

export const isWorkOS = () => AUTH_PROVIDER === "workos";

export async function getSession(): Promise<StaffSession | null> {
  if (isWorkOS()) return readWorkOS();
  const { data } = await supabase.auth.getSession();
  return data.session ? { access_token: data.session.access_token, refresh_token: data.session.refresh_token } : null;
}

export function onSessionChange(cb: (s: StaffSession | null) => void): () => void {
  if (isWorkOS()) {
    listeners.add(cb);
    return () => listeners.delete(cb);
  }
  const { data } = supabase.auth.onAuthStateChange((_e, s) =>
    cb(s ? { access_token: s.access_token, refresh_token: s.refresh_token } : null),
  );
  return () => data.subscription.unsubscribe();
}

/** Returns an error message, or "" when the code was sent. */
export async function sendCode(email: string): Promise<string> {
  if (isWorkOS()) {
    try {
      await workosCall("/magic-auth/send", { email: email.trim(), existing_only: true });
      return "";
    } catch (e) {
      return (e as Error).message;
    }
  }
  const { error } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: false } });
  return error ? error.message : "";
}

/** Returns an error message, or "" when signed in. */
export async function verifyCode(email: string, code: string): Promise<string> {
  if (isWorkOS()) {
    try {
      writeWorkOS(await workosCall<StaffSession>("/magic-auth/verify", { email: email.trim(), code: code.trim() }));
      return "";
    } catch (e) {
      return (e as Error).message;
    }
  }
  const { error } = await supabase.auth.verifyOtp({ email, token: code, type: "email" });
  return error ? error.message : "";
}

/** WorkOS: a new access token from the stored refresh token (rotated). null when the session is over. */
export async function refreshSession(): Promise<StaffSession | null> {
  if (!isWorkOS()) return null;
  const current = readWorkOS();
  if (!current?.refresh_token) return null;
  try {
    const next = await workosCall<StaffSession>("/refresh", { refresh_token: current.refresh_token });
    writeWorkOS(next);
    return next;
  } catch {
    return null;
  }
}

export async function signOut(): Promise<void> {
  if (isWorkOS()) {
    const current = readWorkOS();
    try {
      if (current) await workosCall("/logout", { everywhere: false }, current.access_token);
    } catch {
      // Offline or already ended; this browser is signed out below either way.
    }
    writeWorkOS(null);
    return;
  }
  await supabase.auth.signOut();
}
