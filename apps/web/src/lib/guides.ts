/**
 * Evergreen guides (/guides/<slug>). Written by the site (author: the
 * Remote AI Platform organisation, never a made-up person); every figure on
 * them is read live from the same aggregates as the landing pages.
 */
export type Guide = { slug: string; title: string; description: string; updated: string };

export const GUIDES: Guide[] = [
  {
    slug: "how-to-find-a-remote-job",
    title: "How to find a remote job",
    description:
      "A practical, step-by-step approach to finding remote work: where openings are, how to read location rules, and how to apply well.",
    updated: "2026-11-15",
  },
  {
    slug: "remote-salary-guide",
    title: "Remote salary guide by role",
    description:
      "Published pay for remote roles, by role and seniority, calculated from live listings that state a salary.",
    updated: "2026-11-15",
  },
  {
    slug: "remote-work-location-and-time-zones",
    title: "Remote work location rules, time zones and visas",
    description:
      "Why many remote jobs are limited to certain countries or time zones, how to read those rules, and what to check before you apply.",
    updated: "2026-11-15",
  },
];

export const guideBySlug = (slug: string) => GUIDES.find((g) => g.slug === slug) ?? null;

/** schema.org Article for a guide, authored and published by the site itself. */
export function guideJsonLd(guide: Guide, site: string): Record<string, unknown> {
  const org = { "@type": "Organization", name: "Remote AI Platform", url: `${site}/` };
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: guide.title,
    description: guide.description,
    url: `${site}/guides/${guide.slug}`,
    mainEntityOfPage: `${site}/guides/${guide.slug}`,
    dateModified: guide.updated,
    datePublished: guide.updated,
    author: org,
    publisher: org,
    inLanguage: "en",
  };
}
