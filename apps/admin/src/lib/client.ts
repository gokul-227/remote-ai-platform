import { createClient } from "@supabase/supabase-js";
import { API_URL, SUPABASE_KEY, SUPABASE_URL } from "./env";

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: "rap-admin-auth" },
});

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

function detail(body: unknown, fallback: string): string {
  const b = body as { detail?: unknown; error?: unknown } | null;
  if (typeof b?.detail === "string") return b.detail;
  if (Array.isArray(b?.detail)) {
    const msgs = (b!.detail as { msg?: string }[]).map((d) => d?.msg).filter(Boolean);
    if (msgs.length) return msgs.join(" ");
  }
  if (typeof b?.error === "string") return b.error;
  return fallback;
}

export interface ApiResult<T> {
  data: T;
  total: number | null;
}

/** Authenticated JSON call to /api/v1. Throws ApiError with the API's message. */
export async function api<T>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<ApiResult<T>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const headers = new Headers(init.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  let body = init.body;
  if (init.json !== undefined) {
    headers.set("Content-Type", "application/json");
    body = JSON.stringify(init.json);
  }
  const res = await fetch(`${API_URL}/api/v1${path}`, { ...init, headers, body });
  const text = await res.text();
  let parsed: unknown = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = null;
  }
  if (!res.ok) throw new ApiError(res.status, detail(parsed, `Request failed (${res.status})`));
  const total = res.headers.get("x-total-count");
  return { data: parsed as T, total: total != null ? Number(total) : null };
}

/** Unauthenticated health/version endpoints live at the API root. */
export async function publicGet<T>(path: string): Promise<T> {
  const res = await fetch(`${API_URL}${path}`);
  if (!res.ok) throw new ApiError(res.status, `Request failed (${res.status})`);
  return (await res.json()) as T;
}
