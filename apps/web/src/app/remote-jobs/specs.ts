/** Which landing page a URL is, and what it links to (pure; tested in specs.test.ts). */
import { PLACES, TOPICS, placeBySlug, topicBySlug, type Place, type Topic } from "@/lib/seo";
import { ROLES, SKILLS, placeFilter, roleSkill, topicFilter, topicHeading, type Employer } from "@/lib/landing";
import type { LandingSpec } from "./Landing";

const ROOT: [string, string][] = [
  ["Remote AI Platform", "/"],
  ["Remote jobs", "/remote-jobs"],
];
const subjectOf = (t: Topic) => (t.jobType ? `${t.name.toLowerCase()} remote roles` : `remote ${t.name} roles`);
const placeLinks = (t: Topic, except?: string) =>
  PLACES.filter((p) => p.slug !== except).map((p) => ({
    href: `/remote-jobs/${t.slug}/in/${p.slug}`,
    label: `${topicHeading(t)} in ${p.name}`,
  }));

export function topicSpec(slug: string): LandingSpec | null {
  const t = topicBySlug(slug);
  if (!t) return null;
  const path = `/remote-jobs/${t.slug}`;
  const related = [
    {
      title: "Related categories",
      links: TOPICS.filter((o) => o.group === t.group && o.slug !== t.slug).map((o) => ({
        href: `/remote-jobs/${o.slug}`,
        label: topicHeading(o),
      })),
    },
    { title: "By location", links: placeLinks(t) },
  ];
  if (ROLES.includes(t.slug))
    related.push({
      title: "By skill",
      links: SKILLS.map((s) => ({ href: `${path}/${s}`, label: `${t.name} ${topicBySlug(s)!.name} jobs` })),
    });
  if (SKILLS.includes(t.slug))
    related.push({
      title: "By role",
      links: ROLES.map((r) => ({
        href: `/remote-jobs/${r}/${t.slug}`,
        label: `${topicBySlug(r)!.name} ${t.name} jobs`,
      })),
    });
  return {
    path,
    heading: topicHeading(t),
    subject: subjectOf(t),
    filter: topicFilter(t),
    trail: [...ROOT, [topicHeading(t), path]],
    related,
  };
}

export function placeSpec(slug: string): LandingSpec | null {
  const p = placeBySlug(slug);
  if (!p) return null;
  const path = `/remote-jobs/in/${p.slug}`;
  return {
    path,
    heading: `Remote jobs in ${p.name}`,
    subject: `remote roles open to people in ${p.name}`,
    filter: placeFilter(p),
    trail: [...ROOT, [`Remote jobs in ${p.name}`, path]],
    note: `Postings mention ${p.name}; check each listing for residency or time-zone requirements.`,
    related: [
      {
        title: "Popular categories here",
        links: TOPICS.slice(0, 24).map((t) => ({
          href: `/remote-jobs/${t.slug}/in/${p.slug}`,
          label: `${topicHeading(t)} in ${p.name}`,
        })),
      },
      {
        title: "Other locations",
        links: PLACES.filter((o) => o.slug !== p.slug).map((o) => ({
          href: `/remote-jobs/in/${o.slug}`,
          label: `Remote jobs in ${o.name}`,
        })),
      },
    ],
  };
}

export function topicPlaceSpec(topic: string, place: string): LandingSpec | null {
  const t = topicBySlug(topic);
  const p: Place | undefined = placeBySlug(place);
  if (!t || !p) return null;
  const path = `/remote-jobs/${t.slug}/in/${p.slug}`;
  const heading = `${topicHeading(t)} in ${p.name}`;
  return {
    path,
    heading,
    subject: `${subjectOf(t)} open to people in ${p.name}`,
    filter: { ...topicFilter(t), ...placeFilter(p) },
    trail: [...ROOT, [topicHeading(t), `/remote-jobs/${t.slug}`], [heading, path]],
    note: `Check each listing for residency or time-zone requirements.`,
    related: [
      {
        title: `All ${topicHeading(t).toLowerCase()}`,
        links: [{ href: `/remote-jobs/${t.slug}`, label: topicHeading(t) }],
      },
      {
        title: `More remote jobs in ${p.name}`,
        links: [{ href: `/remote-jobs/in/${p.slug}`, label: `Remote jobs in ${p.name}` }],
      },
      { title: "Same role, other locations", links: placeLinks(t, p.slug) },
    ],
  };
}

export function roleSkillSpec(role: string, skill: string): LandingSpec | null {
  const pair = roleSkill(role, skill);
  if (!pair) return null;
  const { role: r, skill: s } = pair;
  const path = `/remote-jobs/${r.slug}/${s.slug}`;
  const heading = `Remote ${r.name} ${s.name} jobs`;
  return {
    path,
    heading,
    subject: `remote ${r.name.toLowerCase()} roles that mention ${s.name}`,
    filter: { query: `${r.query} ${s.query}` },
    trail: [...ROOT, [topicHeading(r), `/remote-jobs/${r.slug}`], [heading, path]],
    related: [
      {
        title: `Other ${r.name} skills`,
        links: SKILLS.filter((o) => o !== s.slug).map((o) => ({
          href: `/remote-jobs/${r.slug}/${o}`,
          label: `${r.name} ${topicBySlug(o)!.name} jobs`,
        })),
      },
      { title: "Categories", links: [r, s].map((t) => ({ href: `/remote-jobs/${t.slug}`, label: topicHeading(t) })) },
    ],
  };
}

export function employerSpec(e: Employer | null, others: Employer[] = []): LandingSpec | null {
  if (!e) return null;
  const path = `/remote-jobs/at/${e.slug}`;
  const heading = `Remote jobs at ${e.name}`;
  return {
    path,
    heading,
    subject: `remote roles at ${e.name}`,
    filter: { employer: e.name },
    trail: [...ROOT, ["Companies hiring", "/remote-jobs/at"], [heading, path]],
    related: [
      {
        title: "Other companies hiring remotely",
        links: others
          .filter((o) => o.slug !== e.slug)
          .slice(0, 20)
          .map((o) => ({ href: `/remote-jobs/at/${o.slug}`, label: `${o.name} (${o.count})` })),
      },
    ],
  };
}
