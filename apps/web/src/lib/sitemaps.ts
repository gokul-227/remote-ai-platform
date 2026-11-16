import { API_URL, SITE_URL } from "./site";
import { GUIDES } from "./guides";
import { MIN_INDEXABLE_JOBS, fetchEmployers, fetchLandingStats, landingCandidates } from "./landing";

export const SITEMAP_PAGE_SIZE = 5000;
export const SITEMAP_KINDS = ["jobs", "people", "companies", "posts"] as const;
export type SitemapKind = (typeof SITEMAP_KINDS)[number];
type Entry = { id: string; updated_at?: string; posted_at?: string };
const XML_HEADER = '<?xml version="1.0" encoding="UTF-8"?>';
const XML_NS = 'xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"';
export const escapeXml = (value: string) =>
  value.replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[c]!);
export const xmlResponse = (body: string) =>
  new Response(body, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=900, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
export const emptySitemap = () => `${XML_HEADER}<urlset ${XML_NS}></urlset>`;

async function read(path: string): Promise<Response> {
  return fetch(`${API_URL}/api/v1${path}`, { next: { revalidate: 900 }, signal: AbortSignal.timeout(15000) });
}

/** Older API deployments can still enumerate their inventory, without a fixed URL cap. */
export async function sitemapCounts(): Promise<Record<SitemapKind, number>> {
  const response = await read("/public/sitemap-counts");
  if (response.ok) {
    const counts = await response.json();
    for (const kind of SITEMAP_KINDS) {
      if (!Number.isSafeInteger(counts[kind]) || counts[kind] < 0) throw new Error("Invalid sitemap count");
    }
    return counts;
  }
  if (response.status !== 404) throw new Error(`Sitemap counts: ${response.status}`);
  const counts = {} as Record<SitemapKind, number>;
  for (const kind of SITEMAP_KINDS) {
    let count = 0;
    while (true) {
      const entries = await sitemapEntries(kind, count);
      count += entries.length;
      if (entries.length < SITEMAP_PAGE_SIZE) break;
    }
    counts[kind] = count;
  }
  return counts;
}

export async function sitemapEntries(kind: SitemapKind, skip: number): Promise<Entry[]> {
  const path =
    kind === "jobs"
      ? `/jobs/sitemap-entries?skip=${skip}&limit=${SITEMAP_PAGE_SIZE}`
      : `/public/sitemap-entries?kind=${kind}&skip=${skip}&limit=${SITEMAP_PAGE_SIZE}`;
  const response = await read(path);
  if (!response.ok) throw new Error(`Sitemap entries: ${response.status}`);
  const entries: Entry[] = await response.json();
  if (!Array.isArray(entries) || entries.length > SITEMAP_PAGE_SIZE) throw new Error("Invalid sitemap page");
  return entries;
}

export function sitemapIndex(counts: Record<SitemapKind, number>): string {
  const urls = [`${SITE_URL}/sitemaps/static/0.xml`, `${SITE_URL}/sitemaps/landing/0.xml`];
  for (const kind of SITEMAP_KINDS) {
    const pages = Math.ceil(counts[kind] / SITEMAP_PAGE_SIZE);
    if (pages > 50000 - urls.length) throw new Error("Sitemap index capacity exceeded");
    for (let page = 0; page < pages; page++) urls.push(`${SITE_URL}/sitemaps/${kind}/${page}.xml`);
  }
  return `${XML_HEADER}<sitemapindex ${XML_NS}>${urls.map((url) => `<sitemap><loc>${escapeXml(url)}</loc></sitemap>`).join("")}</sitemapindex>`;
}

export function urlSet(entries: { url: string; changed?: string }[]): string {
  return `${XML_HEADER}<urlset ${XML_NS}>${entries
    .map(({ url, changed }) => {
      const date = changed ? new Date(changed) : null;
      const lastmod = date && Number.isFinite(date.getTime()) ? `<lastmod>${date.toISOString()}</lastmod>` : "";
      return `<url><loc>${escapeXml(url)}</loc>${lastmod}</url>`;
    })
    .join("")}</urlset>`;
}

export function staticSitemap(): string {
  return urlSet(
    [
      "/",
      "/remote-jobs",
      "/privacy",
      "/terms",
      "/impressum",
      "/trust",
      "/legal",
      "/cookies",
      "/community-guidelines",
      "/employer-terms",
      "/copyright",
      "/security",
      "/accessibility",
      "/remote-jobs/at",
      "/remote-jobs/in",
      "/remote-work",
      "/work-from-home-jobs",
      "/sitemap",
      "/guides",
      ...GUIDES.map((g) => `/guides/${g.slug}`),
    ].map((path) => ({
      url: `${SITE_URL}${path}`,
    })),
  );
}

export function resourceSitemap(kind: SitemapKind, entries: Entry[]): string {
  return urlSet(
    entries.map((entry) => ({
      url: `${SITE_URL}/${kind}/${encodeURIComponent(entry.id)}`,
      changed: entry.updated_at ?? entry.posted_at,
    })),
  );
}

/** Run `fn` over `items` with at most `limit` in flight; items not started before
 * `deadline` (ms since epoch) are skipped and stay undefined. */
async function pooled<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
  deadline = Infinity,
): Promise<(R | undefined)[]> {
  const out: (R | undefined)[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length && Date.now() < deadline) {
        const i = next++;
        out[i] = await fn(items[i]);
      }
    }),
  );
  return out;
}

/** How long the landing sitemap may spend on stats before answering. */
export const LANDING_SITEMAP_BUDGET_MS = 40_000;

/** /remote-jobs/<topic> and /remote-jobs/in/<place>: the hubs every combination hangs off. */
export const isLandingHub = (path: string) => /^\/remote-jobs\/(in\/)?[a-z0-9-]+$/.test(path);

/**
 * Landing pages worth crawling. Employer pages come straight from the employer
 * list (already >= MIN_INDEXABLE_JOBS each). Category and place hubs are always
 * listed unless their count is known to be thin; combinations are listed only
 * when their count is known to be big enough. Stats lookups share a time
 * budget so the sitemap always answers quickly (it used to time out).
 */
export async function landingSitemap(budgetMs = LANDING_SITEMAP_BUDGET_MS): Promise<string> {
  const employers = await fetchEmployers(MIN_INDEXABLE_JOBS, 2000);
  const candidates = landingCandidates([]);
  const stats = await pooled(candidates, 8, (c) => fetchLandingStats(c.filter), Date.now() + budgetMs);
  const keep = candidates.filter((c, i) => {
    const s = stats[i];
    return s ? s.total >= MIN_INDEXABLE_JOBS : isLandingHub(c.path);
  });
  const urls: { url: string; changed?: string }[] = keep.map((c) => ({ url: `${SITE_URL}${c.path}` }));
  for (const e of employers)
    urls.push({ url: `${SITE_URL}/remote-jobs/at/${e.slug}`, changed: e.latest_posted_at ?? undefined });
  return urlSet(urls);
}
