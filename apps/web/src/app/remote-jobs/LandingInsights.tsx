import Link from "next/link";
import { MIN_INDEXABLE_JOBS, money, perPeriod, trendSentence, type LandingStats } from "@/lib/landing";
import { TOPICS } from "@/lib/seo";

const employerSlug = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const topicFor = (skill: string) => TOPICS.find((t) => !t.jobType && t.name.toLowerCase() === skill.toLowerCase());

/**
 * "At a glance" facts for a landing page, every figure an aggregate over the
 * live jobs it lists (GET /jobs/landing-stats). Sections without enough data
 * are left out rather than filled with estimates.
 */
export function LandingInsights({ subject, stats }: { subject: string; stats: LandingStats | null }) {
  if (!stats || stats.total < MIN_INDEXABLE_JOBS) return null;
  const bands = stats.salary_by_seniority ?? [];
  const skills = stats.top_skills ?? [];
  const trend = trendSentence(stats.weekly_new);
  const companies = stats.top_companies ?? [];
  if (!bands.length && !skills.length && !trend && companies.length < 2) return null;
  return (
    <section aria-labelledby="at-a-glance" className="mt-8 rounded-xl border border-slate-200 bg-white p-6">
      <h2 id="at-a-glance" className="text-xl font-bold text-navy">
        {cap(subject)} at a glance
      </h2>
      <p className="mt-1 text-sm text-slate-600">
        Calculated from the {stats.total.toLocaleString("en-US")} live listings on this page; refreshed every few hours.
      </p>
      {bands.length > 0 && (
        <div className="mt-5">
          <h3 className="font-semibold">Published pay by seniority</h3>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-slate-600">
                <tr>
                  <th className="py-1 pr-4 font-medium">Level</th>
                  <th className="py-1 pr-4 font-medium">Typical range</th>
                  <th className="py-1 pr-4 font-medium">Median</th>
                  <th className="py-1 font-medium">Listings</th>
                </tr>
              </thead>
              <tbody>
                {bands.map((b) => (
                  <tr key={b.seniority} className="border-t border-slate-100">
                    <td className="py-1 pr-4">{cap(b.seniority)}</td>
                    <td className="py-1 pr-4">
                      {money(b.low, b.currency)} – {money(b.high, b.currency)} {perPeriod(b.period)}
                    </td>
                    <td className="py-1 pr-4">{money(b.median, b.currency)}</td>
                    <td className="py-1">{b.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-1 text-xs text-slate-600">
            Midpoints of listings that state pay in {bands[0].currency} per {bands[0].period}; the range is the 10th to
            90th percentile. Nothing is converted or estimated.
          </p>
        </div>
      )}
      {skills.length > 0 && (
        <div className="mt-5">
          <h3 className="font-semibold">Skills most often asked for</h3>
          <ul className="mt-2 flex flex-wrap gap-2 text-sm">
            {skills.map((s) => {
              const t = topicFor(s.name);
              return (
                <li key={s.name} className="rounded-full border border-slate-200 px-3 py-1">
                  {t ? (
                    <Link href={`/remote-jobs/${t.slug}`} className="text-brand underline">
                      {s.name}
                    </Link>
                  ) : (
                    s.name
                  )}{" "}
                  <span className="text-slate-600">({s.count})</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
      {companies.length > 1 && (
        <div className="mt-5">
          <h3 className="font-semibold">Employers with the most openings</h3>
          <ul className="mt-2 list-disc pl-5 text-sm">
            {companies.map((c) => (
              <li key={c.name}>
                {c.count >= MIN_INDEXABLE_JOBS ? (
                  <Link href={`/remote-jobs/at/${employerSlug(c.name)}`} className="text-brand underline">
                    {c.name}
                  </Link>
                ) : (
                  c.name
                )}{" "}
                – {c.count} open {c.count === 1 ? "role" : "roles"}
              </li>
            ))}
          </ul>
        </div>
      )}
      {trend && <p className="mt-5 text-sm text-slate-700">{trend}</p>}
    </section>
  );
}
