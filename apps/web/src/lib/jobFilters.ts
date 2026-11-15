/**
 * Job search filter state, shared by the in-app #jobs screen and the public
 * /remote-jobs pages. The state round-trips through a query string with the
 * same parameter names as GET /api/v1/jobs, so a URL is shareable and is
 * also exactly what "Save this search" stores.
 */

export type Option = { value: string; label: string };

const opts = (pairs: [string, string][]): Option[] => pairs.map(([value, label]) => ({ value, label }));

export const WORKPLACE = opts([
  ["remote", "Remote"],
  ["hybrid", "Hybrid"],
  ["onsite", "On-site"],
]);
export const POSTED = opts([
  ["24h", "Past 24 hours"],
  ["3d", "Past 3 days"],
  ["7d", "Past week"],
  ["30d", "Past month"],
  ["90d", "Past 3 months"],
]);
export const SENIORITY = opts([
  ["internship", "Internship"],
  ["entry", "Entry level"],
  ["associate", "Associate"],
  ["mid_senior", "Mid-Senior level"],
  ["director", "Director"],
  ["executive", "Executive"],
]);
export const JOB_TYPES = opts([
  ["full-time", "Full-time"],
  ["part-time", "Part-time"],
  ["contract", "Contract"],
  ["temporary", "Temporary"],
  ["internship", "Internship"],
  ["volunteer", "Volunteer"],
  ["freelance", "Freelance"],
]);
export const REGIONS = opts([
  ["worldwide", "Remote worldwide"],
  ["north_america", "North America"],
  ["latam", "Latin America"],
  ["europe", "Europe"],
  ["africa", "Africa"],
  ["middle_east", "Middle East"],
  ["apac", "Asia-Pacific"],
]);
export const INDUSTRIES = opts([
  ["software_it", "Software & IT"],
  ["finance", "Finance"],
  ["healthcare", "Healthcare"],
  ["education", "Education"],
  ["ecommerce_retail", "E-commerce & retail"],
  ["marketing_advertising", "Marketing & advertising"],
  ["media_entertainment", "Media & entertainment"],
  ["gaming", "Gaming"],
  ["crypto_web3", "Crypto & Web3"],
  ["government", "Government"],
  ["nonprofit", "Non-profit"],
  ["consulting", "Consulting"],
  ["logistics", "Logistics"],
  ["travel_hospitality", "Travel & hospitality"],
  ["energy", "Energy"],
  ["telecom", "Telecom"],
  ["real_estate", "Real estate"],
  ["legal", "Legal"],
  ["manufacturing", "Manufacturing"],
]);
export const FUNCTIONS = opts([
  ["engineering", "Engineering"],
  ["data", "Data & AI"],
  ["design", "Design"],
  ["product", "Product"],
  ["project_management", "Project management"],
  ["marketing", "Marketing"],
  ["sales", "Sales"],
  ["customer_support", "Customer support"],
  ["operations", "Operations"],
  ["finance_accounting", "Finance & accounting"],
  ["hr_recruiting", "HR & recruiting"],
  ["legal", "Legal"],
  ["writing_content", "Writing & content"],
  ["education", "Education"],
  ["healthcare", "Healthcare"],
]);
export const LANGUAGES = opts([
  ["en", "English"],
  ["de", "German"],
  ["fr", "French"],
  ["es", "Spanish"],
  ["pt", "Portuguese"],
  ["nl", "Dutch"],
  ["it", "Italian"],
  ["pl", "Polish"],
]);
export const SORTS = opts([
  ["recent", "Most recent"],
  ["relevant", "Most relevant"],
  ["salary", "Highest salary"],
]);
export const PERIODS = opts([
  ["year", "per year"],
  ["month", "per month"],
  ["week", "per week"],
  ["day", "per day"],
  ["hour", "per hour"],
]);
export const CURRENCIES = ["USD", "EUR", "GBP", "CAD", "AUD", "CHF", "INR", "SEK", "PLN", "BRL"];

/** Multi-value filters (repeatable query params). */
export const LIST_KEYS = [
  "workplace",
  "job_type",
  "seniority",
  "region",
  "country",
  "industry",
  "job_function",
  "language",
  "company",
  "skills",
  "source",
] as const;
/** Single-value filters. */
export const SCALAR_KEYS = [
  "query",
  "location",
  "posted_within",
  "min_salary",
  "max_salary",
  "salary_currency",
  "salary_period",
  "has_salary",
  "apply",
  "visa_sponsorship",
  "tz",
  "verified",
  "sort",
] as const;

export type ListKey = (typeof LIST_KEYS)[number];
export type ScalarKey = (typeof SCALAR_KEYS)[number];
export type Filters = Partial<Record<ListKey, string[]>> & Partial<Record<ScalarKey, string>>;

export const EMPTY: Filters = {};

const isList = (k: string): k is ListKey => (LIST_KEYS as readonly string[]).includes(k);
const isScalar = (k: string): k is ScalarKey => (SCALAR_KEYS as readonly string[]).includes(k);

/** Parse a query string (with or without "?", or a "#jobs?..." hash). Unknown keys are ignored. */
export function parseFilters(input: string | URLSearchParams | Record<string, string | string[] | undefined>): Filters {
  const out: Filters = {};
  const add = (k: string, v: string) => {
    const value = v.trim();
    if (!value) return;
    if (isList(k)) {
      const list = out[k] ?? [];
      if (!list.includes(value)) out[k] = [...list, value];
    } else if (isScalar(k)) out[k] = value.slice(0, 200);
  };
  if (typeof input === "string") {
    const q = input.includes("?") ? input.slice(input.indexOf("?") + 1) : input.replace(/^#/, "");
    new URLSearchParams(q).forEach((v, k) => add(k, v));
  } else if (input instanceof URLSearchParams) input.forEach((v, k) => add(k, v));
  else
    Object.entries(input).forEach(([k, v]) => (Array.isArray(v) ? v : v == null ? [] : [v]).forEach((x) => add(k, x)));
  if (out.sort === "recent") delete out.sort;
  // A salary amount is only meaningful with its units (the API refuses it otherwise).
  if ((out.min_salary || out.max_salary) && !out.salary_currency) out.salary_currency = "USD";
  if ((out.min_salary || out.max_salary) && !out.salary_period) out.salary_period = "year";
  return out;
}

/** Stable query string (keys in a fixed order) for URLs and cache keys. */
export function toQueryString(f: Filters): string {
  const p = new URLSearchParams();
  for (const k of SCALAR_KEYS) if (f[k]) p.append(k, f[k] as string);
  for (const k of LIST_KEYS) for (const v of f[k] ?? []) p.append(k, v);
  return p.toString();
}

/** Params for GET /jobs and /jobs/facets. */
export function toApiParams(f: Filters): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {};
  for (const k of SCALAR_KEYS) if (f[k]) out[k] = f[k] as string;
  for (const k of LIST_KEYS) if (f[k]?.length) out[k] = f[k] as string[];
  if (!(out.min_salary || out.max_salary)) {
    delete out.salary_currency;
    delete out.salary_period;
  }
  return out;
}

export function toggle(f: Filters, key: ListKey, value: string): Filters {
  const list = f[key] ?? [];
  const next = list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
  return withValue(f, key, next);
}

export function withValue(f: Filters, key: ListKey | ScalarKey, value: string | string[] | undefined): Filters {
  const next: Filters = { ...f };
  if (value == null || value === "" || (Array.isArray(value) && !value.length)) delete next[key];
  else (next as Record<string, unknown>)[key] = value;
  if (key === "min_salary" || key === "max_salary") {
    if (next.min_salary || next.max_salary) {
      next.salary_currency ??= "USD";
      next.salary_period ??= "year";
    } else {
      delete next.salary_currency;
      delete next.salary_period;
    }
  }
  return next;
}

/** Everything except the sort order: a different order is not a different search. */
export function activeCount(f: Filters): number {
  return chips(f).length;
}

export function clearAll(f: Filters): Filters {
  return f.sort ? { sort: f.sort } : {};
}

const CATALOG: Partial<Record<ListKey | ScalarKey, Option[]>> = {
  workplace: WORKPLACE,
  job_type: JOB_TYPES,
  seniority: SENIORITY,
  region: REGIONS,
  industry: INDUSTRIES,
  job_function: FUNCTIONS,
  language: LANGUAGES,
  posted_within: POSTED,
};

export function labelOf(key: ListKey | ScalarKey, value: string): string {
  return CATALOG[key]?.find((o) => o.value === value)?.label ?? value;
}

export type Chip = { key: ListKey | ScalarKey; value: string; label: string; remove: (f: Filters) => Filters };

/** One removable chip per active value (salary bounds share one chip). */
export function chips(f: Filters): Chip[] {
  const out: Chip[] = [];
  for (const k of LIST_KEYS)
    for (const v of f[k] ?? [])
      out.push({
        key: k,
        value: v,
        label: k === "skills" || k === "company" || k === "country" || k === "source" ? v : labelOf(k, v),
        remove: (x) => toggle(x, k, v),
      });
  const scalar = (k: ScalarKey, label: string) =>
    f[k] && out.push({ key: k, value: f[k] as string, label, remove: (x) => withValue(x, k, undefined) });
  scalar("query", `“${f.query}”`);
  scalar("location", `Near ${f.location}`);
  if (f.posted_within) scalar("posted_within", labelOf("posted_within", f.posted_within));
  if (f.min_salary || f.max_salary) {
    const range = [f.min_salary, f.max_salary].map((n) => (n ? Number(n).toLocaleString("en-US") : "…")).join("–");
    out.push({
      key: "min_salary",
      value: range,
      label: `${f.salary_currency ?? "USD"} ${range} ${labelOf("salary_period", f.salary_period ?? "year")}`.replace(
        / year$/,
        "/yr",
      ),
      remove: (x) => withValue(withValue(x, "min_salary", undefined), "max_salary", undefined),
    });
  }
  scalar("has_salary", "Has salary");
  if (f.apply) scalar("apply", f.apply === "platform" ? "Easy Apply" : "Apply on company site");
  if (f.visa_sponsorship)
    scalar("visa_sponsorship", f.visa_sponsorship === "true" ? "Visa sponsorship" : "No visa sponsorship");
  if (f.tz) scalar("tz", `Overlaps UTC${Number(f.tz) >= 0 ? "+" : ""}${f.tz}`);
  scalar("verified", "Verified companies");
  return out;
}

/** "Save this search" default name: the most telling parts of the search. */
export function describe(f: Filters): string {
  const parts = chips(f)
    .slice(0, 3)
    .map((c) => c.label);
  return parts.length ? parts.join(" · ") : "All jobs";
}

export type Facets = Record<string, { value: string | boolean; count: number }[]>;

export function facetCount(facets: Facets | undefined, key: string, value: string | boolean): number | undefined {
  const list = facets?.[key];
  if (!list) return undefined;
  return list.find((x) => String(x.value) === String(value))?.count ?? 0;
}

/** The viewer's UTC offset in whole hours (for the timezone filter). */
export function localUtcOffset(): number {
  return Math.round(-new Date().getTimezoneOffset() / 60);
}
