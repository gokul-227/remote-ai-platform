// Build-time checks for deployed builds. Public env values are inlined at
// build time, so a missing one used to fall back silently to localhost or a
// placeholder Supabase project -- a "successful" deploy that cannot sign in.

type Env = Record<string, string | undefined>;

/** Environments that are deployed and must be fully configured. */
const DEPLOYED = new Set(["production", "dev"]);

const isLocal = (url: string) => /^(https?:\/\/)?(localhost|127\.|0\.0\.0\.0|\[::1\])/i.test(url);

function httpsUrl(value: string | undefined): URL | null {
  try {
    const u = new URL(value ?? "");
    return u.protocol === "https:" ? u : null;
  } catch {
    return null;
  }
}

/** Problems with the public env for a deployed build; empty when fine or not a deployed build. */
export function deployEnvProblems(env: Env): string[] {
  const target = env.NEXT_PUBLIC_DEPLOY_ENV;
  if (!target || !DEPLOYED.has(target)) return [];
  const problems: string[] = [];
  const api = env.NEXT_PUBLIC_API_URL;
  if (!httpsUrl(api) || isLocal(api ?? "")) problems.push("NEXT_PUBLIC_API_URL must be an https URL that is not local");
  const supabase = env.NEXT_PUBLIC_SUPABASE_URL;
  if (!httpsUrl(supabase) || isLocal(supabase ?? "") || /placeholder/i.test(supabase ?? "")) {
    problems.push("NEXT_PUBLIC_SUPABASE_URL must be the project's https URL");
  }
  const key = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!key || /placeholder/i.test(key)) problems.push("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY is missing");
  // Canonical URLs and the sitemap need the public address of the production site.
  if (target === "production" && (!httpsUrl(env.NEXT_PUBLIC_SITE_URL) || isLocal(env.NEXT_PUBLIC_SITE_URL ?? "")))
    problems.push("NEXT_PUBLIC_SITE_URL must be the site's https URL");
  return problems;
}

/** Only the production site may be indexed; dev, previews and local builds are not. */
export function isIndexable(env: Env): boolean {
  return env.NEXT_PUBLIC_DEPLOY_ENV === "production";
}
