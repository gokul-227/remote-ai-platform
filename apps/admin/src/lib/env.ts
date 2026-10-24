/** Build-time public configuration. Nothing here is secret. */
export const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co";
export const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "placeholder";
/** "production" | "development" | "local" — which API this console was built to operate. */
export const CONSOLE_ENV = process.env.NEXT_PUBLIC_DEPLOY_ENV || "local";

const norm = (e: string) => {
  const v = e.toLowerCase();
  if (v.startsWith("prod")) return "production";
  if (v.startsWith("dev") || v === "staging") return "development";
  return "local";
};

/**
 * Writes are only allowed when the API reports the same environment the console
 * was built for, so a development console can never operate production data
 * (and vice versa) because of a misconfigured URL.
 */
export function envMatches(apiEnv: string | null | undefined): boolean {
  if (!apiEnv) return false;
  return norm(apiEnv) === norm(CONSOLE_ENV);
}

export const envLabel = (e: string) =>
  ({ production: "Production", development: "Development", local: "Local" })[norm(e)];
