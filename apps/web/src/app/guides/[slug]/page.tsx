import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { GUIDES, guideBySlug, guideJsonLd, type Guide } from "@/lib/guides";
import { SITE_URL } from "@/lib/site";
import { breadcrumbJsonLd } from "@/lib/brand";
import { socialMetadata } from "@/lib/share";
import { PLACES, topicBySlug, type Topic } from "@/lib/seo";
import {
  MIN_INDEXABLE_JOBS,
  ROLES,
  fetchLandingStats,
  money,
  perPeriod,
  placeFilter,
  topicFilter,
  topicHeading,
  type LandingStats,
} from "@/lib/landing";
import { Breadcrumbs, JsonLd, PublicFrame } from "../../PublicChrome";

export const revalidate = 3600;
export const dynamicParams = false;
export const generateStaticParams = () => GUIDES.map((g) => ({ slug: g.slug }));

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const g = guideBySlug((await params).slug);
  if (!g) return { title: "Not found | Remote AI Platform", robots: { index: false } };
  const title = `${g.title} | Remote AI Platform`;
  return {
    title,
    description: g.description,
    alternates: { canonical: `/guides/${g.slug}` },
    ...socialMetadata({ title, description: g.description, path: `/guides/${g.slug}`, type: "article" }),
  };
}

const fmt = (n: number) => n.toLocaleString("en-US");
const H2 = ({ children }: { children: ReactNode }) => <h2 className="mt-8 text-xl font-bold text-navy">{children}</h2>;
const P = ({ children }: { children: ReactNode }) => <p className="mt-3 leading-relaxed text-slate-700">{children}</p>;
const A = ({ href, children }: { href: string; children: ReactNode }) => (
  <Link href={href} className="font-semibold text-brand underline">
    {children}
  </Link>
);

async function FindRemoteJob() {
  const all = await fetchLandingStats({});
  const worldwide = await fetchLandingStats(placeFilter(PLACES.find((p) => p.slug === "worldwide") ?? PLACES[0]));
  return (
    <>
      {all && all.total > 0 && (
        <P>
          Right now there are {fmt(all.total)} open remote roles on this site
          {all.new_last_7_days ? `, ${fmt(all.new_last_7_days)} of them posted in the last 7 days` : ""}. That turnover
          is why the steps below put speed and focus first.
        </P>
      )}
      <H2>1. Decide what you are searching for</H2>
      <P>
        Pick one or two role titles and a short list of skills you can show evidence for. Searching by role (
        <A href="/remote-jobs/backend">backend</A>, <A href="/remote-jobs/product-manager">product management</A>,{" "}
        <A href="/remote-jobs/designer">design</A>) gives better results than searching for &quot;remote&quot; alone.
        Every category page lists live openings, newest first, with the employers hiring most.
      </P>
      <H2>2. Check where you are allowed to work from</H2>
      <P>
        Most remote jobs are remote within a country or region, not anywhere in the world. Read the location line of
        each listing first and use the <A href="/remote-jobs/in/worldwide">work-from-anywhere listings</A>
        {worldwide && worldwide.total > 0 ? ` (${fmt(worldwide.total)} open now)` : ""} or the page for your country.
        Our <A href="/guides/remote-work-location-and-time-zones">location and time-zone guide</A> explains the common
        rules.
      </P>
      <H2>3. Apply early, and apply properly</H2>
      <P>
        Some roles close once they have enough candidates, so apply soon after a listing appears. Set up alerts for your
        categories, then tailor each application: mirror the skills the listing names, link to work you can show, and
        say which time zone you work in. Applying through the original employer page, which every listing here links to,
        is usually best.
      </P>
      <H2>4. Know the pay range before you talk money</H2>
      <P>
        Where employers publish pay, our <A href="/guides/remote-salary-guide">remote salary guide</A> summarises it by
        role and seniority. Many employers do not publish pay, so treat any figure as a guide rather than a rule.
      </P>
      <H2>5. Keep a simple tracker</H2>
      <P>
        Note the company, date, contact and next step for each application. A free profile here keeps saved jobs and
        applications in one place and can send alerts for new roles that match your skills.
      </P>
      <P>
        Start browsing: <A href="/remote-jobs">all remote jobs</A> · <A href="/remote-jobs/at">companies hiring</A> ·{" "}
        <A href="/sitemap">every category and location</A>.
      </P>
    </>
  );
}

async function SalaryGuide() {
  const slugs = [...ROLES, "product-manager", "designer", "data-analyst"];
  const topics = slugs.map((s) => topicBySlug(s)).filter((t): t is Topic => !!t);
  const stats = await Promise.all(topics.map((t) => fetchLandingStats(topicFilter(t))));
  const rows = topics
    .map((t, i) => ({ t, s: stats[i] }))
    .filter((r): r is { t: Topic; s: LandingStats & { salary: NonNullable<LandingStats["salary"]> } } =>
      Boolean(r.s?.salary && r.s.salary.count >= MIN_INDEXABLE_JOBS),
    );
  return (
    <>
      <P>
        This guide summarises the pay that employers publish in their remote job listings. Each figure is the midpoint
        of the listings that state a salary, in that role&apos;s most common currency and pay period. The range shown is
        the 10th to 90th percentile. Nothing is converted between currencies and nothing is estimated: roles with fewer
        than {MIN_INDEXABLE_JOBS} published salaries are left out.
      </P>
      <H2>Published pay by role</H2>
      {rows.length ? (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-slate-600">
              <tr>
                <th className="py-1 pr-4 font-medium">Role</th>
                <th className="py-1 pr-4 font-medium">Typical range</th>
                <th className="py-1 pr-4 font-medium">Median</th>
                <th className="py-1 font-medium">Listings with pay</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ t, s }) => (
                <tr key={t.slug} className="border-t border-slate-100">
                  <td className="py-1 pr-4">
                    <A href={`/remote-jobs/${t.slug}`}>{t.name}</A>
                  </td>
                  <td className="py-1 pr-4">
                    {money(s.salary.low, s.salary.currency)} – {money(s.salary.high, s.salary.currency)}{" "}
                    {perPeriod(s.salary.period)}
                  </td>
                  <td className="py-1 pr-4">{money(s.salary.median, s.salary.currency)}</td>
                  <td className="py-1">{s.salary.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <P>Not enough listings publish pay right now to show reliable figures. Check back soon.</P>
      )}
      {rows.some((r) => r.s.salary_by_seniority?.length) && <H2>By seniority</H2>}
      {rows
        .filter((r) => r.s.salary_by_seniority?.length)
        .map(({ t, s }) => (
          <section key={t.slug} className="mt-4">
            <h3 className="font-semibold">{topicHeading(t)}</h3>
            <ul className="mt-1 list-disc pl-5 text-sm text-slate-700">
              {s.salary_by_seniority!.map((b) => (
                <li key={b.seniority}>
                  {b.seniority.charAt(0).toUpperCase() + b.seniority.slice(1)}: median {money(b.median, b.currency)}{" "}
                  {perPeriod(b.period)} ({b.count} listings)
                </li>
              ))}
            </ul>
          </section>
        ))}
      <H2>How to use these numbers</H2>
      <P>
        Only some employers publish pay (in some places the law requires it), so these figures describe the listings
        that do, not the whole market. Compare a listing&apos;s own range with the role&apos;s median here, and check
        the location rules: pay for a role limited to one country often differs from a work-from-anywhere one.
      </P>
    </>
  );
}

async function LocationGuide() {
  const places = await Promise.all(PLACES.map((p) => fetchLandingStats(placeFilter(p))));
  const rows = PLACES.map((p, i) => ({ p, total: places[i]?.total ?? 0 }))
    .filter((r) => r.total >= MIN_INDEXABLE_JOBS)
    .sort((a, b) => b.total - a.total);
  return (
    <>
      <P>
        &quot;Remote&quot; describes where the work happens, not who may be hired. Most employers can only hire in
        countries where they have a legal entity, an employer-of-record arrangement, or contractors they can pay and tax
        correctly. That is why listings often say &quot;Remote (US)&quot;, &quot;Remote – EMEA&quot; or name a time-zone
        band.
      </P>
      <H2>Where the open remote roles are</H2>
      {rows.length ? (
        <>
          <P>Live remote listings on this site whose location names each place:</P>
          <ul className="mt-2 grid gap-1 text-sm sm:grid-cols-2">
            {rows.map(({ p, total }) => (
              <li key={p.slug}>
                <A href={`/remote-jobs/in/${p.slug}`}>{p.name}</A> – {fmt(total)} open roles
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-slate-600">
            Counted by matching the listing&apos;s location text, so one listing can count towards a country and its
            region.
          </p>
        </>
      ) : null}
      <H2>How to read location rules</H2>
      <ul className="mt-3 list-disc space-y-2 pl-5 text-slate-700">
        <li>
          <strong>A country or state</strong> (&quot;Remote, US&quot;): you normally need to live there and have the
          right to work there.
        </li>
        <li>
          <strong>A region</strong> (&quot;Europe&quot;, &quot;EMEA&quot;, &quot;LATAM&quot;): any country in it may
          qualify, but the employer may still exclude some. Ask before you invest time.
        </li>
        <li>
          <strong>A time-zone band</strong> (&quot;UTC−5 to UTC+1&quot;): you must overlap the team&apos;s working
          hours, usually by several hours a day.
        </li>
        <li>
          <strong>Anywhere / worldwide</strong>: the rarest kind. Often contract or freelance work paid by invoice.
        </li>
      </ul>
      <H2>Visas, tax and contracts</H2>
      <P>
        Working remotely for a foreign employer does not, by itself, give you a right to live or work in that
        employer&apos;s country, and moving abroad while keeping a remote job can create tax and immigration duties.
        Several countries offer &quot;digital nomad&quot; or remote-worker visas with their own income and insurance
        rules. These rules change often and differ by country, so check the official government source for each country
        involved, and the employer&apos;s policy, before you accept an offer. This guide is general information, not
        legal or tax advice.
      </P>
      <P>
        Browse <A href="/remote-jobs/in/worldwide">work-from-anywhere roles</A> or find your country on the{" "}
        <A href="/sitemap">full list of locations</A>.
      </P>
    </>
  );
}

const BODIES: Record<string, () => Promise<ReactNode>> = {
  "how-to-find-a-remote-job": FindRemoteJob,
  "remote-salary-guide": SalaryGuide,
  "remote-work-location-and-time-zones": LocationGuide,
};

export default async function GuidePage({ params }: Props) {
  const guide: Guide | null = guideBySlug((await params).slug);
  if (!guide) notFound();
  const site = SITE_URL || "https://remoteaiplatform.com";
  const trail: [string, string][] = [
    ["Remote AI Platform", "/"],
    ["Guides", "/guides"],
    [guide.title, `/guides/${guide.slug}`],
  ];
  const body = await BODIES[guide.slug]();
  return (
    <PublicFrame>
      <Breadcrumbs trail={trail} />
      <article className="mt-4 rounded-xl border border-slate-200 bg-white p-6 sm:p-8">
        <h1 className="text-3xl font-bold text-navy">{guide.title}</h1>
        <p className="mt-2 text-sm text-slate-600">
          By the Remote AI Platform team · updated {guide.updated} · figures from live listings, refreshed hourly
        </p>
        {body}
      </article>
      <nav aria-label="More guides" className="mt-8">
        <h2 className="mb-2 text-lg font-bold">More guides</h2>
        <ul className="list-disc pl-5">
          {GUIDES.filter((g) => g.slug !== guide.slug).map((g) => (
            <li key={g.slug}>
              <A href={`/guides/${g.slug}`}>{g.title}</A>
            </li>
          ))}
        </ul>
      </nav>
      <JsonLd data={[guideJsonLd(guide, site), breadcrumbJsonLd(site, trail)]} />
    </PublicFrame>
  );
}
