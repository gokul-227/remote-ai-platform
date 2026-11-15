import type { Metadata } from "next";
import Link from "next/link";
import { PLACES, TOPICS } from "@/lib/seo";
import { ROLES, SKILLS, fetchEmployers, topicHeading } from "@/lib/landing";
import { topicBySlug } from "@/lib/seo";
import { GUIDES } from "@/lib/guides";
import { SITE_URL } from "@/lib/site";
import { breadcrumbJsonLd } from "@/lib/brand";
import { Breadcrumbs, JsonLd, PublicFrame } from "../PublicChrome";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Site map: every remote job category, location and employer | Remote AI Platform",
  description:
    "Every remote job category, location, role and skill combination, employer page and guide on Remote AI Platform, in one place.",
  alternates: { canonical: "/sitemap" },
};

const trail: [string, string][] = [
  ["Remote AI Platform", "/"],
  ["Site map", "/sitemap"],
];
const linkClass = "text-brand hover:underline";

function Group({ title, links }: { title: string; links: [string, string][] }) {
  return (
    <section className="mt-8">
      <h2 className="mb-3 text-lg font-bold text-navy">{title}</h2>
      <ul className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2 lg:grid-cols-3">
        {links.map(([href, label]) => (
          <li key={href}>
            <Link href={href} className={linkClass}>
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Human-readable site map: one crawlable page that links every hub (hub-and-spoke). */
export default async function SiteMapPage() {
  const employers = await fetchEmployers(3, 500);
  const site = SITE_URL || "https://remoteaiplatform.com";
  const groups = [...new Set(TOPICS.map((t) => t.group))];
  return (
    <PublicFrame wide>
      <Breadcrumbs trail={trail} />
      <h1 className="mt-3 text-3xl font-bold text-navy">Site map</h1>
      <p className="mt-2 text-slate-600">
        Every public section of the site. Job pages are linked from the category, location and employer pages.
      </p>
      <Group
        title="Start here"
        links={[
          ["/remote-jobs", "All remote jobs"],
          ["/remote-jobs/at", "Companies hiring remotely"],
          ["/guides", "Guides"],
          ...GUIDES.map((g): [string, string] => [`/guides/${g.slug}`, g.title]),
        ]}
      />
      {groups.map((g) => (
        <Group
          key={g}
          title={`Categories: ${g}`}
          links={TOPICS.filter((t) => t.group === g).map((t) => [`/remote-jobs/${t.slug}`, topicHeading(t)])}
        />
      ))}
      <Group title="Locations" links={PLACES.map((p) => [`/remote-jobs/in/${p.slug}`, `Remote jobs in ${p.name}`])} />
      <Group
        title="Roles by skill"
        links={ROLES.flatMap((r) =>
          SKILLS.map((s): [string, string] => [
            `/remote-jobs/${r}/${s}`,
            `${topicBySlug(r)!.name} ${topicBySlug(s)!.name} jobs`,
          ]),
        )}
      />
      {PLACES.slice(0, 12).map((p) => (
        <Group
          key={p.slug}
          title={`Categories in ${p.name}`}
          links={TOPICS.map((t) => [`/remote-jobs/${t.slug}/in/${p.slug}`, `${topicHeading(t)} in ${p.name}`])}
        />
      ))}
      {employers.length > 0 && (
        <Group
          title="Employers"
          links={employers.map((e) => [`/remote-jobs/at/${e.slug}`, `${e.name} (${e.count})`])}
        />
      )}
      <Group
        title="About"
        links={[
          ["/trust", "Security and trust"],
          ["/privacy", "Privacy"],
          ["/terms", "Terms"],
          ["/impressum", "Legal notice"],
          ["/legal", "All legal policies"],
          ["/cookies", "Cookies"],
          ["/community-guidelines", "Community guidelines"],
          ["/employer-terms", "Job posting and employer terms"],
          ["/copyright", "Copyright and takedown"],
          ["/security", "Security policy"],
          ["/accessibility", "Accessibility"],
        ]}
      />
      <JsonLd data={breadcrumbJsonLd(site, trail)} />
    </PublicFrame>
  );
}
