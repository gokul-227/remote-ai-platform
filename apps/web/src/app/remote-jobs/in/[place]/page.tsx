import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SITE_URL } from "@/lib/site";
import { PLACES, fetchPlaceJobs, placeBySlug } from "@/lib/seo";
import { breadcrumbJsonLd } from "@/lib/brand";
import { Breadcrumbs, JsonLd, PublicFrame } from "../../../PublicChrome";
import { JobList, JoinCta } from "../../JobList";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ place: string }> };

const heading = (name: string) => `Remote jobs in ${name}`;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const place = placeBySlug((await params).place);
  if (!place) return { title: "Not found | Remote AI Platform", robots: { index: false } };
  const { total } = await fetchPlaceJobs(place, 1);
  const title = `${heading(place.name)} (${total}) | Remote AI Platform`;
  const description = `${total} open remote roles for people in ${place.name}, from employers and job boards. Updated every few hours; apply at the source or join free for alerts.`;
  return {
    title,
    description,
    alternates: { canonical: `/remote-jobs/in/${place.slug}` },
    robots: total ? undefined : { index: false, follow: true },
    openGraph: { title, description, url: `/remote-jobs/in/${place.slug}` },
  };
}

export default async function PlacePage({ params }: Props) {
  const place = placeBySlug((await params).place);
  if (!place) notFound();
  const { jobs, total } = await fetchPlaceJobs(place, 50);
  const live = jobs.filter((j) => !j.expired_at);
  const trail: [string, string][] = [
    ["Remote AI Platform", "/"],
    ["Remote jobs", "/remote-jobs"],
    [heading(place.name), `/remote-jobs/in/${place.slug}`],
  ];
  return (
    <PublicFrame wide>
      <Breadcrumbs trail={trail} />
      <h1 className="mt-3 text-3xl font-bold text-[#102A43]">{heading(place.name)}</h1>
      <p className="mt-2 max-w-3xl text-slate-600">
        {total} open roles whose posting mentions {place.name}, newest first. Check each listing for residency or
        time-zone requirements.
      </p>
      <div className="mt-6">
        <JobList jobs={live} />
      </div>
      <JoinCta />
      <section aria-labelledby="other-places">
        <h2 id="other-places" className="mb-3 text-lg font-bold">
          Other locations
        </h2>
        <div className="flex flex-wrap gap-2">
          {PLACES.filter((p) => p.slug !== place.slug).map((p) => (
            <Link
              key={p.slug}
              href={`/remote-jobs/in/${p.slug}`}
              className="rounded-full border border-slate-300 bg-white px-4 py-1.5 text-sm hover:border-[#175CD3] hover:text-[#175CD3]"
            >
              {heading(p.name)}
            </Link>
          ))}
        </div>
      </section>
      <JsonLd
        data={[
          breadcrumbJsonLd(SITE_URL, trail),
          {
            "@context": "https://schema.org",
            "@type": "ItemList",
            itemListElement: live.map((j, i) => ({
              "@type": "ListItem",
              position: i + 1,
              url: `${SITE_URL}/jobs/${j.id}`,
            })),
          },
        ]}
      />
    </PublicFrame>
  );
}
