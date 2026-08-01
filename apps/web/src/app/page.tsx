import Link from "next/link";
import {
  Sparkles,
  ArrowRight,
  Briefcase,
  Cpu,
  Globe2,
  Users,
  TrendingUp,
  CheckCircle2,
  Star,
  Shield,
  Zap,
} from "lucide-react";

const stats = [
  { label: "Remote Jobs Aggregated", value: "12,000+", color: "text-cyan-400" },
  { label: "Engineers Registered", value: "3,400+", color: "text-indigo-400" },
  { label: "Companies Hiring", value: "850+", color: "text-emerald-400" },
  { label: "AI Match Accuracy", value: "94.8%", color: "text-amber-400" },
];

const features = [
  {
    icon: Zap,
    color: "text-cyan-400",
    bg: "rgba(14,165,233,0.08)",
    border: "rgba(14,165,233,0.2)",
    title: "Real-time Job Aggregation",
    desc: "Jobs pulled every 6 hours from RemoteOK, Remotive, Arbeitnow, and 5 more sources. Zero stale listings.",
    badge: "5 sources active",
  },
  {
    icon: Cpu,
    color: "text-indigo-400",
    bg: "rgba(99,102,241,0.08)",
    border: "rgba(99,102,241,0.2)",
    title: "AI Resume Parser",
    desc: "Upload your PDF resume. Our AI extracts your skills, experience, and highlights automatically.",
    badge: "Gemini-powered",
  },
  {
    icon: TrendingUp,
    color: "text-emerald-400",
    bg: "rgba(16,185,129,0.08)",
    border: "rgba(16,185,129,0.2)",
    title: "Explainable AI Matching",
    desc: "Every match includes a skill breakdown: 50% skill match, 30% experience fit, 20% role alignment.",
    badge: "Transparent scoring",
  },
  {
    icon: Shield,
    color: "text-amber-400",
    bg: "rgba(245,158,11,0.08)",
    border: "rgba(245,158,11,0.2)",
    title: "Enterprise Authentication",
    desc: "Keycloak OIDC with GitHub, Google, and email SSO. Role-based access for engineers, companies, and admins.",
    badge: "Keycloak + OIDC",
  },
];

const howItWorks = [
  { step: "01", title: "Create your profile", desc: "Upload your resume and let AI build your technical profile." },
  { step: "02", title: "Get AI-matched", desc: "Our engine scores you against thousands of remote opportunities." },
  { step: "03", title: "Apply with confidence", desc: "See exactly why you're a great fit before you apply." },
];

const testimonials = [
  {
    name: "Sarah Chen",
    role: "Senior Frontend Engineer",
    company: "Remote @ Stripe",
    text: "Found my dream remote job in 3 days. The AI matching showed me exactly what skills I needed to improve.",
  },
  {
    name: "Marcus Rivera",
    role: "Engineering Manager",
    company: "Acme Corp",
    text: "The talent discovery is incredible. We hired 4 engineers in a month, all perfectly matched to our stack.",
  },
  {
    name: "Priya Sharma",
    role: "Data Engineer",
    company: "Remote @ Databricks",
    text: "WorkMesh showed jobs I never would have found on LinkedIn. The timezone filtering alone saved me hours.",
  },
];

export default function Home() {
  return (
    <div className="overflow-x-hidden">
      {/* ── Hero ── */}
      <section className="relative pt-16 pb-20 px-6 overflow-hidden">
        {/* Ambient blobs */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[500px] bg-cyan-500/8 blur-[120px] rounded-full pointer-events-none" />
        <div className="absolute top-32 right-1/3 w-[400px] h-[400px] bg-indigo-600/8 blur-[100px] rounded-full pointer-events-none" />

        <div className="relative max-w-5xl mx-auto text-center">
          {/* Pill badge */}
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-300 text-xs font-semibold uppercase tracking-wider mb-7">
            <Sparkles className="h-3.5 w-3.5" />
            AI-Powered Remote Engineering Marketplace
          </div>

          {/* Headline */}
          <h1 className="text-5xl sm:text-6xl lg:text-7xl font-extrabold tracking-tight leading-[1.06] mb-6">
            Connect with world-class{" "}
            <span className="gradient-text">remote engineers</span>{" "}
            using AI
          </h1>

          <p className="text-lg sm:text-xl text-slate-400 max-w-2xl mx-auto leading-relaxed mb-10">
            WorkMesh AI aggregates thousands of remote software engineering jobs and uses AI to match engineers with opportunities that fit their exact skills and career goals.
          </p>

          {/* CTA buttons */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/jobs"
              className="btn-primary px-7 py-3.5 text-base shadow-lg shadow-cyan-500/25 w-full sm:w-auto"
            >
              Browse Remote Jobs
              <ArrowRight className="h-4.5 w-4.5" />
            </Link>
            <Link
              href="/engineer/dashboard"
              className="btn-secondary px-7 py-3.5 text-base w-full sm:w-auto"
            >
              Build AI Profile
            </Link>
          </div>

          {/* Trust line */}
          <p className="mt-8 text-xs text-slate-600">
            Trusted by engineers at Stripe, Airbnb, Google, Meta and 850+ remote-first companies
          </p>
        </div>

        {/* Stats bar */}
        <div className="relative max-w-5xl mx-auto mt-16 grid grid-cols-2 md:grid-cols-4 gap-4">
          {stats.map((s) => (
            <div key={s.label} className="card p-5 text-center">
              <div className={`text-3xl font-extrabold ${s.color} mb-1`}>{s.value}</div>
              <div className="text-xs text-slate-500 font-medium">{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Features ── */}
      <section className="section px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
              Everything you need to hire or get hired
            </h2>
            <p className="text-slate-400 max-w-xl mx-auto">
              Built for modern remote engineering teams and the engineers who power them.
            </p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-5">
            {features.map((f) => {
              const Icon = f.icon;
              return (
                <div key={f.title} className="card p-6 space-y-3 group hover:cursor-default">
                  <div
                    className="h-11 w-11 rounded-xl flex items-center justify-center transition-transform group-hover:scale-110"
                    style={{ background: f.bg, border: `1px solid ${f.border}` }}
                  >
                    <Icon className={`h-5 w-5 ${f.color}`} />
                  </div>
                  <h3 className="font-semibold text-white text-[0.95rem]">{f.title}</h3>
                  <p className="text-sm text-slate-400 leading-relaxed">{f.desc}</p>
                  <div className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                    {f.badge}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── How It Works ── */}
      <section className="section-sm px-6">
        <div className="max-w-4xl mx-auto">
          <div className="card p-8 sm:p-12 relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/5 via-transparent to-indigo-600/5 pointer-events-none" />
            <div className="relative">
              <div className="text-center mb-10">
                <h2 className="text-2xl sm:text-3xl font-bold text-white mb-3">How it works</h2>
                <p className="text-slate-400 text-sm">Get matched in minutes, not weeks.</p>
              </div>
              <div className="grid md:grid-cols-3 gap-8">
                {howItWorks.map((step) => (
                  <div key={step.step} className="text-center">
                    <div className="text-5xl font-black gradient-text opacity-30 mb-3">{step.step}</div>
                    <h3 className="font-semibold text-white mb-2">{step.title}</h3>
                    <p className="text-sm text-slate-400">{step.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Two Column Value Props ── */}
      <section className="section px-6">
        <div className="max-w-6xl mx-auto grid md:grid-cols-2 gap-8">
          {/* Engineers */}
          <div className="card p-8 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-cyan-500/5 rounded-full blur-2xl" />
            <div className="h-10 w-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center mb-5">
              <Users className="h-5 w-5 text-cyan-400" />
            </div>
            <h3 className="text-xl font-bold text-white mb-3">For Engineers</h3>
            <p className="text-slate-400 text-sm mb-6">
              Build a powerful AI-enhanced profile, get matched to jobs that actually fit, and negotiate with confidence.
            </p>
            <ul className="space-y-2 mb-6">
              {[
                "AI-generated profile summary from your resume",
                "Skill gap analysis with learning recommendations",
                "Salary range benchmarking by role & region",
                "One-click apply with tracked applications",
              ].map((item) => (
                <li key={item} className="flex items-start gap-2.5 text-sm text-slate-300">
                  <CheckCircle2 className="h-4 w-4 text-cyan-400 mt-0.5 flex-shrink-0" />
                  {item}
                </li>
              ))}
            </ul>
            <Link href="/engineer/dashboard" className="btn-primary text-sm">
              Start for free <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          {/* Companies */}
          <div className="card p-8 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/5 rounded-full blur-2xl" />
            <div className="h-10 w-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center mb-5">
              <Briefcase className="h-5 w-5 text-indigo-400" />
            </div>
            <h3 className="text-xl font-bold text-white mb-3">For Companies</h3>
            <p className="text-slate-400 text-sm mb-6">
              Post roles, let AI surface the top candidates, and build a distributed engineering team that ships faster.
            </p>
            <ul className="space-y-2 mb-6">
              {[
                "AI-ranked engineer recommendations",
                "Filter by skills, timezone, salary, and availability",
                "Automated shortlisting with explainable scores",
                "Talent pipeline management dashboard",
              ].map((item) => (
                <li key={item} className="flex items-start gap-2.5 text-sm text-slate-300">
                  <CheckCircle2 className="h-4 w-4 text-indigo-400 mt-0.5 flex-shrink-0" />
                  {item}
                </li>
              ))}
            </ul>
            <Link href="/company/dashboard" className="btn-primary text-sm" style={{ background: "linear-gradient(135deg,#4f46e5,#7c3aed)" }}>
              Start hiring <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* ── Testimonials ── */}
      <section className="section-sm px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-10">
            <h2 className="text-2xl sm:text-3xl font-bold text-white mb-3">What people are saying</h2>
          </div>
          <div className="grid md:grid-cols-3 gap-5">
            {testimonials.map((t) => (
              <div key={t.name} className="card p-6 space-y-4">
                <div className="flex gap-0.5">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star key={i} className="h-3.5 w-3.5 text-amber-400 fill-amber-400" />
                  ))}
                </div>
                <p className="text-sm text-slate-300 leading-relaxed italic">"{t.text}"</p>
                <div className="flex items-center gap-3 pt-2 border-t border-white/5">
                  <div className="avatar h-8 w-8 text-xs">
                    {t.name.charAt(0)}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-white">{t.name}</p>
                    <p className="text-xs text-slate-500">{t.role} · {t.company}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="section-sm px-6 pb-20">
        <div className="max-w-3xl mx-auto text-center">
          <div className="card p-10 sm:p-14 relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/8 via-transparent to-indigo-600/8 pointer-events-none" />
            <div className="absolute top-4 right-4 opacity-10">
              <Globe2 className="h-32 w-32 text-cyan-500" />
            </div>
            <div className="relative">
              <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
                Ready to find your next remote role?
              </h2>
              <p className="text-slate-400 mb-8">
                Join thousands of engineers and companies already using WorkMesh AI to build the future of remote work.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Link href="/jobs" className="btn-primary px-8 py-3.5 text-base shadow-lg shadow-cyan-500/20">
                  Browse Jobs <ArrowRight className="h-5 w-5" />
                </Link>
                <Link href="/auth/register" className="btn-secondary px-8 py-3.5 text-base">
                  Create free account
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-white/5 py-10 px-6">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-cyan-500 to-indigo-600 flex items-center justify-center">
              <Sparkles className="h-3.5 w-3.5 text-white" />
            </div>
            <span className="font-bold gradient-text">WorkMesh AI</span>
            <span className="text-slate-600 text-sm">— Remote Engineering Marketplace</span>
          </div>
          <div className="flex items-center gap-6 text-xs text-slate-600">
            <Link href="/jobs" className="hover:text-slate-300 transition-colors">Jobs</Link>
            <Link href="/engineers" className="hover:text-slate-300 transition-colors">Engineers</Link>
            <Link href="/companies" className="hover:text-slate-300 transition-colors">Companies</Link>
            <a href="http://localhost:8000/docs" target="_blank" rel="noreferrer" className="hover:text-cyan-400 transition-colors">API Docs</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
