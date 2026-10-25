import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionLink, PublicFrame } from "../../PublicChrome";
import { fetchCompany, fetchCompanyJobs, ldJson } from "@/lib/publicPages";
import { SITE_URL, summary } from "@/lib/site";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const c = await fetchCompany((await params).id);
  if (!c) return { title: "Company not found | Remote AI Platform", robots: { index: false } };
  const title = `${c.name} – jobs and company page | Remote AI Platform`;
  const description = summary(
    c.description || `${c.name}${c.industry ? `, ${c.industry}` : ""}: open roles and company profile.`,
  );
  return {
    title,
    description,
    alternates: { canonical: `/companies/${c.id}` },
    openGraph: { title, description, url: `/companies/${c.id}` },
  };
}

export default async function CompanyPage({ params }: Props) {
  const { id } = await params;
  const c = await fetchCompany(id);
  if (!c) notFound();
  const jobs = (await fetchCompanyJobs(c.id)).filter((j) => !j.expired_at);
  return (
    <PublicFrame>
      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <h1 className="text-2xl font-bold">{c.name}</h1>
        <p className="text-slate-600">
          {[c.industry, c.company_size ? `${c.company_size} employees` : "", c.location].filter(Boolean).join(" · ")}
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          <ActionLink href={`/#company/${c.id}`} primary>
            Follow
          </ActionLink>
          {c.website && (
            <a
              href={c.website}
              rel="nofollow noopener noreferrer"
              target="_blank"
              className="inline-flex rounded-full border border-slate-300 px-5 py-2 font-semibold"
            >
              Website
            </a>
          )}
        </div>
        {c.description && <p className="mt-6 whitespace-pre-line">{c.description}</p>}
      </section>
      <section className="mt-6">
        <h2 className="mb-3 text-xl font-bold">Open jobs at {c.name}</h2>
        {jobs.length ? (
          <ul className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white">
            {jobs.map((j) => (
              <li key={j.id} className="p-4">
                <Link href={`/jobs/${j.id}`} className="font-semibold text-[#0552CC] hover:underline">
                  {j.title}
                </Link>
                <p className="text-sm text-slate-600">{j.location || (j.is_remote ? "Remote" : "On-site")}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-slate-600">No open roles right now.</p>
        )}
      </section>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: ldJson({
            "@context": "https://schema.org",
            "@type": "Organization",
            name: c.name,
            description: c.description || undefined,
            url: `${SITE_URL}/companies/${c.id}`,
            sameAs: c.website ? [c.website] : undefined,
            address: c.location || undefined,
          }),
        }}
      />
    </PublicFrame>
  );
}
