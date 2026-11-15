import Link from "next/link";
import { OPERATOR } from "@/figma/legal_content";
import { Brand } from "@/components/Brand";
import { AppEntry } from "./AppEntry";
import { PLACES, TOPICS } from "@/lib/seo";
import { SITE_URL } from "@/lib/site";
import { organizationJsonLd, websiteJsonLd } from "@/lib/brand";
import { BrandLockup, JsonLd, PublicFooter } from "./PublicChrome";

const workflows = [
  ["Connect", "Build your professional profile, find people and share updates with your network.", "/#engineers"],
  ["Find work", "Explore remote roles, save opportunities and manage your applications in one place.", "/remote-jobs"],
  ["Hire", "Publish a role, review applications and connect with professionals.", "/#postjob"],
  ["Get work done", "Bring projects, conversations, meetings and deliverables into a shared workspace.", "/#projects"],
];

export default function Home() {
  return (
    <AppEntry>
      <div className="min-h-screen bg-mist text-charcoal">
        <header className="border-b border-slate-200 bg-white">
          <nav
            aria-label="Main navigation"
            className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-4"
          >
            <BrandLockup size={40} />
            <div className="flex items-center gap-5 text-sm font-semibold">
              <Link href="/remote-jobs" className="text-brand hover:underline">
                Find jobs
              </Link>
              <a href="#login" className="hover:underline">
                Sign in
              </a>
              <a href="#register" className="rounded-lg bg-brand px-4 py-2 text-white">
                Join free
              </a>
            </div>
          </nav>
        </header>
        <main id="main" className="mx-auto max-w-6xl px-5 py-12 sm:py-20">
          <section className="grid items-center gap-10 md:grid-cols-2">
            <div>
              <p className="font-semibold text-brand">Your professional network and workspace</p>
              <h1 className="mt-4 font-bold" style={{ fontSize: "clamp(2.25rem, 4vw, 3.5rem)", lineHeight: 1.12 }}>
                Connect. Find work.
                <br />
                Get work done.
              </h1>
              <p className="mt-5 max-w-xl text-lg text-slate-600">
                Discover remote jobs and freelance opportunities, meet professionals and collaborate with your team on
                Remote AI Platform.
              </p>
              <div className="mt-7 flex flex-wrap gap-3">
                <a href="#register" className="rounded-lg bg-brand px-6 py-3 font-semibold text-white">
                  Create your free account
                </a>
                <Link
                  href="/remote-jobs"
                  className="rounded-lg border border-slate-300 bg-white px-6 py-3 font-semibold text-brand"
                >
                  Explore remote jobs
                </Link>
              </div>
              <p className="mt-3 text-sm text-slate-600">Browse public jobs before signing up.</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
              <Brand s={88} />
              <h2 className="mt-5 text-2xl font-bold">From opportunity to delivery</h2>
              <ol className="mt-5 space-y-4 text-slate-600">
                <li>
                  <strong className="text-brand">1. Build your profile.</strong> Share your skills and what you are
                  looking for.
                </li>
                <li>
                  <strong className="text-brand">2. Find your next connection.</strong> Explore jobs, people and
                  companies.
                </li>
                <li>
                  <strong className="text-brand">3. Work together.</strong> Organise tasks, discuss ideas and share
                  deliverables.
                </li>
              </ol>
            </div>
          </section>
          <section aria-label="What you can do" className="mt-16 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {workflows.map(([title, text, href]) => (
              <article key={title} className="rounded-xl border border-slate-200 bg-white p-6">
                <h2 className="text-xl font-bold">{title}</h2>
                <p className="mt-3 text-sm leading-relaxed text-slate-600">{text}</p>
                <a href={href} className="mt-4 inline-block font-semibold text-brand hover:underline">
                  Explore {title.toLowerCase()} →
                </a>
              </article>
            ))}
          </section>
          <section className="mt-14">
            <h2 className="text-2xl font-bold">Find remote work by skill</h2>
            <div className="mt-5 flex flex-wrap gap-2">
              {TOPICS.slice(0, 12).map((topic) => (
                <Link
                  key={topic.slug}
                  href={`/remote-jobs/${topic.slug}`}
                  className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-brand hover:border-brand"
                >
                  {topic.name} jobs
                </Link>
              ))}
            </div>
            <Link href="/remote-jobs" className="mt-5 inline-block font-semibold text-brand hover:underline">
              Browse all categories →
            </Link>
          </section>
          <section className="mt-10">
            <h2 className="text-2xl font-bold">Find remote work by location</h2>
            <div className="mt-5 flex flex-wrap gap-2">
              {PLACES.map((place) => (
                <Link
                  key={place.slug}
                  href={`/remote-jobs/in/${place.slug}`}
                  className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-brand hover:border-brand"
                >
                  Remote jobs in {place.name}
                </Link>
              ))}
            </div>
          </section>
        </main>
        <PublicFooter />
        <JsonLd data={[organizationJsonLd(SITE_URL, OPERATOR.contactEmail), websiteJsonLd(SITE_URL)]} />
      </div>
    </AppEntry>
  );
}
