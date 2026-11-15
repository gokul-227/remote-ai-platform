import type { Metadata } from "next";
import Link from "next/link";
import { SITE_URL } from "@/lib/site";
import { breadcrumbJsonLd } from "@/lib/brand";
import { MIN_INDEXABLE_JOBS, fetchEmployers } from "@/lib/landing";
import { Breadcrumbs, JsonLd, PublicFrame } from "../../PublicChrome";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Companies hiring remotely | Remote AI Platform",
  description: "Employers with open remote roles right now, by number of openings. Each links to their current jobs.",
  alternates: { canonical: "/remote-jobs/at" },
};

export default async function EmployersIndex() {
  const employers = await fetchEmployers(MIN_INDEXABLE_JOBS, 500);
  const trail: [string, string][] = [
    ["Remote AI Platform", "/"],
    ["Remote jobs", "/remote-jobs"],
    ["Companies hiring", "/remote-jobs/at"],
  ];
  return (
    <PublicFrame wide>
      <Breadcrumbs trail={trail} />
      <h1 className="mt-3 text-3xl font-bold text-[#102A43]">Companies hiring remotely</h1>
      <p className="mt-2 max-w-3xl text-slate-600">
        {employers.length.toLocaleString("en-US")} employers with at least {MIN_INDEXABLE_JOBS} open remote roles, most
        openings first.
      </p>
      <ul className="mt-6 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {employers.map((e) => (
          <li key={e.slug}>
            <Link href={`/remote-jobs/at/${e.slug}`} className="text-[#175CD3] hover:underline">
              {e.name}
            </Link>{" "}
            <span className="text-sm text-slate-600">({e.count})</span>
          </li>
        ))}
      </ul>
      <JsonLd data={breadcrumbJsonLd(SITE_URL || "https://remoteaiplatform.com", trail)} />
    </PublicFrame>
  );
}
