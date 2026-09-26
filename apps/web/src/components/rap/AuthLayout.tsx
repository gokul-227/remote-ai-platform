import Link from "next/link";
import type { ReactNode } from "react";
import { Brand, Ic } from "./kit";

const POINTS: Array<[icon: string, title: string, copy: string]> = [
  ["users", "Connect with your community", "Share your work and learn from other engineers."],
  ["target", "Find a role that fits", "Understand the skills and experience behind every match."],
  ["board", "Go from opportunity to delivery", "Manage contracts, milestones and project work in one place."],
];

/** Figma "AuthFlow" frame: brand story on the left, the auth card on the right. */
export function AuthLayout({ children, heroHeading = false }: { children: ReactNode; heroHeading?: boolean }) {
  const Headline = heroHeading ? "h1" : "p";
  return (
    <div className="min-h-screen bg-[#F0F2F5] text-[#1c1e21]">
      <main className="mx-auto grid min-h-screen max-w-[1080px] items-center gap-16 px-6 py-12 lg:grid-cols-[1fr_420px]">
        <section>
          <Link href="/" className="flex items-center gap-3"><Brand s={52} /><span className="text-2xl font-bold text-[#0866FF]">Remote AI Platform</span></Link>
          <Headline className="mt-7 !text-[44px] font-bold !leading-[1.1] tracking-[-0.02em]">Your network.<br />Your next opportunity.</Headline>
          <p className="mt-5 max-w-lg text-xl leading-8 text-slate-600">Meet engineers, find remote work, and bring great projects to life together.</p>
          <div className="mt-8 hidden space-y-5 sm:block">
            {POINTS.map(([icon, title, copy]) => (
              <div key={title} className="flex items-start gap-4">
                <span className="rounded-full bg-white p-3 text-[#0866FF]"><Ic n={icon} /></span>
                <div><b>{title}</b><p className="mt-1 text-sm text-slate-500">{copy}</p></div>
              </div>
            ))}
          </div>
        </section>
        <section>
          <div className="rounded-xl border border-slate-200 bg-white p-7 shadow-[0_4px_24px_rgba(0,0,0,.09)]">{children}</div>
          <nav aria-label="Legal" className="mt-5 flex justify-center gap-5 text-xs text-slate-500">
            <Link href="/terms" className="hover:underline">Terms</Link>
            <Link href="/privacy" className="hover:underline">Privacy</Link>
            <Link href="/impressum" className="hover:underline">Impressum</Link>
          </nav>
          <p className="mt-4 text-center text-xs text-slate-500">Remote AI Platform · {new Date().getFullYear()}</p>
        </section>
      </main>
    </div>
  );
}

export const authButton = "flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-[#0866FF] px-5 py-3 font-semibold text-white hover:bg-[#0756d8] disabled:opacity-50";

export function AuthError({ children }: { children: ReactNode }) {
  return <p role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{children}</p>;
}

export function Divider({ label }: { label: string }) {
  return <div className="my-5 flex items-center gap-3 text-xs text-slate-500"><span className="h-px flex-1 bg-slate-200" />{label}<span className="h-px flex-1 bg-slate-200" /></div>;
}

export function Spinner() {
  return <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/60 border-t-transparent" aria-hidden="true" />;
}
