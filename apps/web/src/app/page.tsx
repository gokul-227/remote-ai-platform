import Link from "next/link";
import { ArrowRight, Building2, CheckCircle2, Search, ShieldCheck, Users } from "lucide-react";

export default function Home() {
  return (
    <div className="mx-auto max-w-6xl space-y-6 py-4 sm:py-8">
      <section className="card-enterprise overflow-hidden p-8 sm:p-12">
        <div className="grid items-center gap-10 lg:grid-cols-[1.25fr_0.75fr]">
          <div className="space-y-6">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#0A66C2]">Remote AI Platform · Remote work ecosystem</p>
            <h1 className="max-w-3xl text-4xl font-bold leading-tight text-slate-900 sm:text-5xl">The professional network for remote engineering work.</h1>
            <p className="max-w-2xl text-base leading-7 text-slate-600">Find roles that fit your skills, build a credible engineering profile, and help teams make better hiring decisions with structured talent data.</p>
            <div className="flex flex-wrap gap-3">
              <Link href="/jobs" className="btn-primary-brand"><Search className="h-4 w-4" /> Browse Jobs Marketplace <ArrowRight className="h-4 w-4" /></Link>
              <Link href="/auth/register" className="btn-secondary-brand">Join the network</Link>
            </div>
            <div className="flex flex-wrap gap-5 border-t border-slate-200 pt-5 text-xs font-medium text-slate-600">
              <span className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-emerald-600" />Verified identity</span>
              <span className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-[#0A66C2]" />Structured profiles</span>
              <span className="flex items-center gap-2"><Users className="h-4 w-4 text-[#0A66C2]" />Remote-first teams</span>
            </div>
          </div>
          <div className="border-l border-slate-200 pl-6 lg:pl-10">
            <p className="text-sm font-semibold text-slate-900">One workspace for both sides of the market</p>
            <div className="mt-4 space-y-3">
              <Link href="/engineer/dashboard" className="block rounded-xl border border-slate-200 bg-slate-50 p-4 hover:border-[#0A66C2]">
                <Users className="h-5 w-5 text-[#0A66C2]" /><h2 className="mt-3 font-semibold text-slate-900">Career Dashboard</h2><p className="mt-1 text-xs leading-5 text-slate-600">Manage your profile, applications, saved roles, and recommendations.</p>
              </Link>
              <Link href="/company/dashboard" className="block rounded-xl border border-slate-200 bg-slate-50 p-4 hover:border-[#0A66C2]">
                <Building2 className="h-5 w-5 text-[#0A66C2]" /><h2 className="mt-3 font-semibold text-slate-900">Hiring Dashboard</h2><p className="mt-1 text-xs leading-5 text-slate-600">Review talent, manage positions, and organize hiring projects.</p>
              </Link>
            </div>
          </div>
        </div>
      </section>
      <section className="grid gap-4 md:grid-cols-3">
        {["Search with useful filters", "Review evidence, not hype", "Keep hiring work organized"].map((title, index) => <div key={title} className="card-enterprise p-5"><div className="text-xs font-bold text-[#0A66C2]">0{index + 1}</div><h2 className="mt-3 font-semibold text-slate-900">{title}</h2><p className="mt-2 text-sm leading-6 text-slate-600">Remote AI Platform keeps the next step clear for professionals, companies, and platform administrators.</p></div>)}
      </section>
    </div>
  );
}
