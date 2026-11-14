import Link from "next/link";
import { OPERATOR } from "@/figma/legal_content";
import { Brand } from "@/components/Brand";
import { AppEntry } from "./AppEntry";
import { TOPICS } from "@/lib/seo";

const workflows = [
  ["Connect", "Build your professional profile, find people and share updates with your network.", "/#engineers"],
  ["Find work", "Explore remote roles, save opportunities and manage your applications in one place.", "/remote-jobs"],
  ["Hire", "Publish a role, review applications and connect with professionals.", "/#postjob"],
  ["Get work done", "Bring projects, conversations, meetings and deliverables into a shared workspace.", "/#projects"],
];

export default function Home() {
  return (
    <AppEntry>
      <div className="min-h-screen bg-[#f0f2f5] text-[#1c1e21]">
        <header className="border-b border-slate-200 bg-white">
          <nav
            aria-label="Main navigation"
            className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-4"
          >
            <Link href="/" className="flex items-center gap-2 font-bold text-[#0552CC]">
              <Brand s={40} />
              Remote AI Platform
            </Link>
            <div className="flex items-center gap-5 text-sm font-semibold">
              <Link href="/remote-jobs" className="text-[#0552CC] hover:underline">
                Find jobs
              </Link>
              <a href="#login" className="hover:underline">
                Sign in
              </a>
              <a href="#register" className="rounded-lg bg-[#0552CC] px-4 py-2 text-white">
                Join free
              </a>
            </div>
          </nav>
        </header>
        <main className="mx-auto max-w-6xl px-5 py-12 sm:py-20">
          <section className="grid items-center gap-10 md:grid-cols-2">
            <div>
              <p className="font-semibold text-[#0552CC]">Your professional network and workspace</p>
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
                <a href="#register" className="rounded-lg bg-[#0552CC] px-6 py-3 font-semibold text-white">
                  Create your free account
                </a>
                <Link
                  href="/remote-jobs"
                  className="rounded-lg border border-slate-300 bg-white px-6 py-3 font-semibold text-[#0552CC]"
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
                  <strong className="text-[#0552CC]">1. Build your profile.</strong> Share your skills and what you are
                  looking for.
                </li>
                <li>
                  <strong className="text-[#0552CC]">2. Find your next connection.</strong> Explore jobs, people and
                  companies.
                </li>
                <li>
                  <strong className="text-[#0552CC]">3. Work together.</strong> Organise tasks, discuss ideas and share
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
                <a href={href} className="mt-4 inline-block font-semibold text-[#0552CC] hover:underline">
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
                  className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-[#0552CC] hover:border-[#0552CC]"
                >
                  {topic.name} jobs
                </Link>
              ))}
            </div>
            <Link href="/remote-jobs" className="mt-5 inline-block font-semibold text-[#0552CC] hover:underline">
              Browse all categories →
            </Link>
          </section>
        </main>
        <footer className="border-t border-slate-200 bg-white px-5 py-6">
          <nav aria-label="Footer" className="mx-auto flex max-w-6xl flex-wrap gap-5 text-sm text-slate-600">
            <span>Remote AI Platform</span>
            <a href={`mailto:${OPERATOR.contactEmail}`}>{OPERATOR.contactEmail}</a>
            <Link href="/privacy">Privacy</Link>
            <Link href="/terms">Terms</Link>
            <Link href="/impressum">Legal notice</Link>
            <a href="#help">Help</a>
          </nav>
        </footer>
      </div>
    </AppEntry>
  );
}
