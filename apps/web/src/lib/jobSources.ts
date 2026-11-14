/** Source-specific distribution rules. Keep in sync with API jobs/source_policy.py.
 * Remotive and Himalayas prohibit Google Jobs. Other restricted sources stay
 * excluded pending a reviewed redistribution agreement.
 */
export const permitsGoogleJobs = (source?: string | null) =>
  !["REMOTIVE", "HIMALAYAS", "WORKINGNOMADS", "ADZUNA"].includes((source ?? "").toUpperCase());

const names: Record<string, string> = {
  REMOTIVE: "Remotive",
  HIMALAYAS: "Himalayas",
  REMOTEOK: "Remote OK",
  ARBEITNOW: "Arbeitnow",
  JOBICY: "Jobicy",
  WORKINGNOMADS: "Working Nomads",
  HACKERNEWS: "Hacker News",
  THEMUSE: "The Muse",
  USAJOBS: "USAJOBS",
};
export const jobSourceName = (source?: string | null) =>
  names[(source ?? "").toUpperCase()] ?? source ?? "Original source";

/** Imported URLs are untrusted; never render executable or relative schemes. */
export function originalJobUrl(value?: string | null): string | undefined {
  try {
    const url = new URL(value ?? "");
    return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password ? url.href : undefined;
  } catch {
    return undefined;
  }
}
