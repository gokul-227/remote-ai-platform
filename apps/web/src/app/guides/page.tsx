import type { Metadata } from "next";
import Link from "next/link";
import { GUIDES } from "@/lib/guides";
import { SITE_URL } from "@/lib/site";
import { breadcrumbJsonLd } from "@/lib/brand";
import { Breadcrumbs, JsonLd, PublicFrame } from "../PublicChrome";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Remote work guides | Remote AI Platform",
  description:
    "Guides to finding remote work, remote pay by role and seniority, and location and time-zone rules, based on live job listings.",
  alternates: { canonical: "/guides" },
};

const trail: [string, string][] = [
  ["Remote AI Platform", "/"],
  ["Guides", "/guides"],
];

export default function GuidesIndex() {
  const site = SITE_URL || "https://remoteaiplatform.com";
  return (
    <PublicFrame>
      <Breadcrumbs trail={trail} />
      <h1 className="mt-3 text-3xl font-bold text-navy">Remote work guides</h1>
      <p className="mt-2 text-slate-600">
        Written by the Remote AI Platform team. Figures come from the live job listings on this site.
      </p>
      <ul className="mt-6 space-y-4">
        {GUIDES.map((g) => (
          <li key={g.slug} className="rounded-xl border border-slate-200 bg-white p-5">
            <Link href={`/guides/${g.slug}`} className="text-lg font-semibold text-brand hover:underline">
              {g.title}
            </Link>
            <p className="mt-1 text-sm text-slate-600">{g.description}</p>
          </li>
        ))}
      </ul>
      <JsonLd data={breadcrumbJsonLd(site, trail)} />
    </PublicFrame>
  );
}
