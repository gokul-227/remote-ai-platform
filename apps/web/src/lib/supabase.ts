import axios from "axios";
import { createClient, type Session } from "@supabase/supabase-js";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
// @supabase/supabase-js's createClient() throws synchronously on an empty
// URL, which crashes the entire static build (every page that imports this
// module, even transitively) rather than just failing the auth calls that
// actually need it. A syntactically-valid placeholder keeps module
// evaluation safe everywhere except real Supabase network calls, which
// simply fail cleanly if this ever ships genuinely unconfigured.
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "placeholder";

// The publishable key is safe to expose client-side by design -- it only
// grants what Supabase's Row Level Security policies allow for anonymous/
// authenticated users, same as any other public API key.
export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

/**
 * Supabase's session carries identity (id/email), not this app's business
 * data (role, full_name, avatar_url) -- that lives only in our own `users`
 * table, per the deliberate design that role is never read from an
 * identity provider's token. Call this right after a Supabase sign-in to
 * fetch the real user record (auto-provisioned server-side on first sight)
 * so callers can hand it to AuthContext's login().
 */
export async function fetchBackendUser(session: Session) {
  const res = await axios.get(`${API_URL}/api/v1/auth/me`, {
    headers: { Authorization: `Bearer ${session.access_token}` },
  });
  return res.data;
}

interface PendingRegistration {
  email: string;
  fullName: string;
  role: "ENGINEER" | "COMPANY";
}

/**
 * Registration stashes the chosen role/name locally (see auth/register)
 * since Supabase Auth has no concept of either. Call this right after the
 * FIRST successful sign-in for a given email -- applies the choice via
 * this app's own self-service endpoints, then clears it so it never
 * re-applies on a later, unrelated login.
 */
export async function applyPendingRegistration(session: Session, currentUser: { email: string; full_name?: string; role: string }) {
  if (typeof window === "undefined") return currentUser;
  const raw = localStorage.getItem("pending_registration");
  if (!raw) return currentUser;
  let pending: PendingRegistration;
  try {
    pending = JSON.parse(raw);
  } catch {
    localStorage.removeItem("pending_registration");
    return currentUser;
  }
  if (pending.email !== currentUser.email) return currentUser;

  localStorage.removeItem("pending_registration");
  const headers = { Authorization: `Bearer ${session.access_token}` };
  try {
    if (pending.role !== currentUser.role) {
      await axios.patch(`${API_URL}/api/v1/auth/role`, { role: pending.role }, { headers });
    }
    if (pending.fullName && pending.fullName !== currentUser.full_name) {
      await axios.patch(`${API_URL}/api/v1/auth/me`, { full_name: pending.fullName }, { headers });
    }
  } catch {
    // Best-effort -- the account still works with defaults if this fails;
    // don't block sign-in over a cosmetic profile-completion step.
    return currentUser;
  }
  return fetchBackendUser(session);
}
