/**
 * Broad "remote" hubs (home, /remote-work, /work-from-home-jobs, /remote-jobs/in):
 * which categories and places have enough live jobs to link, and FAQ answers
 * built only from live aggregates and from what the site actually does.
 */
import {
  MIN_INDEXABLE_JOBS,
  fetchLandingStats,
  money,
  perPeriod,
  placeFilter,
  topicFilter,
  type LandingStats,
} from "./landing";
import { PLACES, TOPICS, type Place, type Topic } from "./seo";

export type Counted<T> = { item: T; total: number };

/** Items whose live count is known to be >= MIN_INDEXABLE_JOBS, biggest first.
 * When every lookup failed (API down) the first `fallback` items are returned
 * uncounted (total 0) so navigation never disappears. */
export function nonThin<T>(items: T[], stats: (LandingStats | null)[], fallback = 12): Counted<T>[] {
  if (stats.every((s) => s === null)) return items.slice(0, fallback).map((item) => ({ item, total: 0 }));
  return items
    .map((item, i) => ({ item, total: stats[i]?.total ?? 0 }))
    .filter((c) => c.total >= MIN_INDEXABLE_JOBS)
    .sort((a, b) => b.total - a.total);
}

/** Places (countries, regions, worldwide) with enough live remote jobs to be a hub. */
export async function livePlaces(): Promise<Counted<Place>[]> {
  return nonThin(PLACES, await Promise.all(PLACES.map((p) => fetchLandingStats(placeFilter(p)))));
}

/** Categories with enough live remote jobs to be a hub. */
export async function liveTopics(): Promise<Counted<Topic>[]> {
  return nonThin(TOPICS, await Promise.all(TOPICS.map((t) => fetchLandingStats(topicFilter(t)))));
}

export type Faq = { q: string; a: string };
const fmt = (n: number) => n.toLocaleString("en-US");

/**
 * Questions answered from the live aggregates for one page. A question is left
 * out when there is no data to answer it; nothing is estimated.
 */
export function landingFaq(subject: string, stats: LandingStats | null): Faq[] {
  if (!stats || stats.total < MIN_INDEXABLE_JOBS) return [];
  const out: Faq[] = [
    {
      q: `How many ${subject} are open right now?`,
      a:
        `${fmt(stats.total)} open listings at the last update` +
        (stats.new_last_7_days ? `, ${fmt(stats.new_last_7_days)} of them posted in the last 7 days.` : ".") +
        " Listings are refreshed from employers and job boards every few hours.",
    },
  ];
  const top = stats.top_companies.slice(0, 5);
  if (top.length >= 2)
    out.push({
      q: `Which companies are hiring for ${subject}?`,
      a: `The employers with the most open listings are ${top.map((c) => `${c.name} (${c.count})`).join(", ")}.`,
    });
  const s = stats.salary;
  if (s && s.count >= MIN_INDEXABLE_JOBS)
    out.push({
      q: `How much do ${subject} pay?`,
      a:
        `${fmt(s.count)} listings publish pay in ${s.currency}. The middle 80% of them pay ` +
        `${money(s.low, s.currency)} to ${money(s.high, s.currency)} ${perPeriod(s.period)}, ` +
        `with a median of ${money(s.median, s.currency)}. Many employers don't publish pay.`,
    });
  const skills = (stats.top_skills ?? []).slice(0, 6);
  if (skills.length >= 3)
    out.push({
      q: `Which skills are most often asked for?`,
      a: `Among the newest listings: ${skills.map((k) => `${k.name} (${k.count})`).join(", ")}.`,
    });
  out.push(APPLY_FAQ);
  return out;
}

/** How applying works on this site (true for every listing). */
export const APPLY_FAQ: Faq = {
  q: "How do I apply?",
  a:
    "Every listing links to the employer's own page or the job board it came from, and you apply there; " +
    "no Remote AI Platform account is needed. A free account adds saved jobs, alerts and your applications in one place.",
};

/** Where remote jobs can be done from: an honest, general answer. */
export const LOCATION_FAQ: Faq = {
  q: "Can I do these jobs from any country?",
  a:
    "Not always. Many remote listings are limited to a country, region or time-zone band, usually because the " +
    "employer can only hire where it can employ people legally. Each listing shows its location; work-from-anywhere " +
    "roles are collected on the worldwide page.",
};

/** schema.org FAQPage for the questions shown on the page (the text must match). */
export function faqJsonLd(faqs: Faq[]): Record<string, unknown> | null {
  if (!faqs.length) return null;
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };
}
