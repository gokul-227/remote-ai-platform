import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ActionLink, PublicFrame } from "../../PublicChrome";
import { fetchPerson, ldJson } from "@/lib/publicPages";
import { SITE_URL, summary } from "@/lib/site";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const p = await fetchPerson((await params).id);
  if (!p) return { title: "Profile not found | Remote AI Platform", robots: { index: false } };
  const name = p.full_name || "Professional";
  const title = `${name}${p.headline ? ` – ${p.headline}` : ""} | Remote AI Platform`;
  const description = summary(
    p.bio ||
      `${name}${p.headline ? `, ${p.headline}` : ""}${p.location ? `, ${p.location}` : ""}. Connect on Remote AI Platform.`,
  );
  return {
    title,
    description,
    alternates: { canonical: `/people/${p.id}` },
    openGraph: { title, description, type: "profile", url: `/people/${p.id}` },
  };
}

export default async function PersonPage({ params }: Props) {
  const p = await fetchPerson((await params).id);
  if (!p) notFound();
  const name = p.full_name || "Professional";
  const app = `/#engineer/${p.id}`;
  return (
    <PublicFrame>
      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <div className="flex items-center gap-4">
          <div className="grid h-20 w-20 place-items-center rounded-full bg-[#0552CC] text-3xl font-bold text-white">
            {name.charAt(0)}
          </div>
          <div>
            <h1 className="text-2xl font-bold">{name}</h1>
            {p.headline && <p className="text-slate-600">{p.headline}</p>}
            <p className="text-sm text-slate-500">
              {[p.location, p.years_of_experience ? `${p.years_of_experience} years of experience` : ""]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          <ActionLink href={app} primary>
            Connect
          </ActionLink>
          <ActionLink href={app}>Message</ActionLink>
        </div>
        {p.bio && <p className="mt-6 whitespace-pre-line">{p.bio}</p>}
        {!!p.skills?.length && (
          <div className="mt-6">
            <h2 className="mb-2 font-bold">Skills</h2>
            <div className="flex flex-wrap gap-2">
              {p.skills.map((s) => (
                <span key={s} className="rounded-full bg-slate-100 px-3 py-1 text-sm">
                  {s}
                </span>
              ))}
            </div>
          </div>
        )}
      </section>
      <p className="mt-4 text-sm text-slate-500">Sign in or join free to connect, message or hire {name}.</p>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: ldJson({
            "@context": "https://schema.org",
            "@type": "ProfilePage",
            dateModified: p.updated_at,
            mainEntity: {
              "@type": "Person",
              name,
              jobTitle: p.headline || p.primary_role || undefined,
              description: p.bio || undefined,
              address: p.location || undefined,
              knowsAbout: p.skills,
              url: `${SITE_URL}/people/${p.id}`,
            },
          }),
        }}
      />
    </PublicFrame>
  );
}
