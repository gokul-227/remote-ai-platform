import Link from "next/link";
import {
  ArrowRight,
  Building2,
  CheckCircle2,
  Search,
  ShieldCheck,
  Users,
  Sparkles,
  FolderKanban,
  Globe2,
} from "lucide-react";

export default function Home() {
  return (
    <div className="space-y-16 py-6 pb-16">
      {/* ========================================================================= */}
      {/* HERO SECTION */}
      {/* ========================================================================= */}
      <section className="card-enterprise overflow-hidden p-8 sm:p-14 bg-gradient-to-b from-white via-[#FBEAE1]/40 to-white dark:from-slate-900 dark:via-slate-900 dark:to-slate-900">
        <div className="grid items-center gap-12 lg:grid-cols-12">
          {/* Left Hero Content */}
          <div className="lg:col-span-7 space-y-6">
            <div className="inline-flex items-center gap-2 rounded-full border border-[#EAD2C4] bg-[#FBEAE1]/80 px-3.5 py-1 text-xs font-semibold text-[#B54A2C] dark:border-[#4D4033] dark:bg-[#3D2A1F]/50 dark:text-[#E08659]">
              <Sparkles className="h-3.5 w-3.5" />
              The Intelligent Remote Work Operating System
            </div>

            <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 dark:text-white sm:text-5xl lg:text-6xl leading-[1.15]">
              The professional network for <span className="text-[#B54A2C]">remote engineering</span> work.
            </h1>

            <p className="text-base sm:text-lg leading-relaxed text-slate-600 dark:text-slate-300 max-w-2xl">
              Connect with top remote organizations, showcase your engineering identity, discover AI-matched roles with explainable scores, and collaborate on projects—all in one unified workspace.
            </p>

            {/* Dual Action Paths */}
            <div className="flex flex-wrap gap-4 pt-2">
              <Link href="/jobs" className="btn-primary-brand text-base py-3 px-6 shadow-md hover:shadow-lg transition-all flex items-center gap-2">
                <Search className="h-5 w-5" /> Find Your Next Role <ArrowRight className="h-5 w-5" />
              </Link>
              <Link href="/auth/register" className="btn-secondary-brand text-base py-3 px-6 flex items-center gap-2">
                <Building2 className="h-5 w-5 text-[#B54A2C]" /> Hire Exceptional Professionals
              </Link>
            </div>

            {/* Platform Highlights */}
            <div className="grid grid-cols-3 gap-4 border-t border-slate-200 dark:border-slate-800 pt-6 text-xs font-medium text-slate-600 dark:text-slate-400">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-emerald-600 shrink-0" />
                <span>Verified Talent</span>
              </div>
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-[#B54A2C] shrink-0" />
                <span>Explainable AI Match</span>
              </div>
              <div className="flex items-center gap-2">
                <Globe2 className="h-4 w-4 text-indigo-600 shrink-0" />
                <span>5 Job Aggregators</span>
              </div>
            </div>
          </div>

          {/* Right Product UI Hero Mockup */}
          <div className="lg:col-span-5 space-y-4">
            {/* Live AI Match Score Mockup */}
            <div className="card-enterprise p-5 space-y-3 shadow-lg border-blue-200 dark:border-blue-900 bg-white dark:bg-slate-900">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="h-10 w-10 rounded-xl bg-blue-100 dark:bg-blue-950 text-[#B54A2C] flex items-center justify-center font-bold text-lg">
                    R
                  </div>
                  <div>
                    <div className="text-sm font-bold text-slate-900 dark:text-white">Staff AI Engineer</div>
                    <div className="text-xs text-slate-500">Remote AI Platform · 100% Remote</div>
                  </div>
                </div>
                <div className="flex flex-col items-end">
                  <span className="text-xl font-extrabold text-emerald-600">94%</span>
                  <span className="text-[10px] font-semibold text-emerald-700 uppercase">Strong Match</span>
                </div>
              </div>

              {/* Factor Breakdown Mini-bars */}
              <div className="space-y-1.5 pt-2 border-t border-slate-100 dark:border-slate-800 text-[11px]">
                <div className="flex justify-between text-slate-600 dark:text-slate-400">
                  <span>Skills Fit (React, Python, PyTorch)</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200">98%</span>
                </div>
                <div className="w-full bg-slate-100 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden">
                  <div className="bg-emerald-500 h-full rounded-full w-[98%]" />
                </div>
                <div className="flex justify-between text-slate-600 dark:text-slate-400 pt-1">
                  <span>Experience & Role Seniority</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200">92%</span>
                </div>
                <div className="w-full bg-slate-100 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden">
                  <div className="bg-[#B54A2C] h-full rounded-full w-[92%]" />
                </div>
              </div>

              <div className="pt-2 flex items-center justify-between text-xs text-slate-500">
                <span className="flex items-center gap-1 font-medium text-emerald-700">
                  <CheckCircle2 className="h-3.5 w-3.5" /> High AI Confidence
                </span>
                <span className="text-[#B54A2C] font-semibold">View Breakdown &rarr;</span>
              </div>
            </div>

            {/* Quick Workspace Shortcuts */}
            <div className="grid grid-cols-2 gap-3">
              <Link href="/engineer/dashboard" className="card-enterprise p-4 hover:border-[#B54A2C] transition-colors block">
                <Users className="h-5 w-5 text-[#B54A2C]" />
                <h3 className="mt-2 text-xs font-bold text-slate-900 dark:text-white">Professional Workspace</h3>
                <p className="mt-0.5 text-[11px] text-slate-500">Career dashboard, applications & AI matches.</p>
              </Link>

              <Link href="/company/dashboard" className="card-enterprise p-4 hover:border-[#B54A2C] transition-colors block">
                <Building2 className="h-5 w-5 text-[#B54A2C]" />
                <h3 className="mt-2 text-xs font-bold text-slate-900 dark:text-white">Organization Workspace</h3>
                <p className="mt-0.5 text-[11px] text-slate-500">Candidate discovery & hiring pipeline.</p>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* SECTION 1: HOW IT WORKS */}
      {/* ========================================================================= */}
      <section className="space-y-8">
        <div className="text-center space-y-2 max-w-2xl mx-auto">
          <span className="text-xs font-bold uppercase tracking-wider text-[#B54A2C]">Simple 3-Step Process</span>
          <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white">How Remote AI Platform Works</h2>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            A seamless bridge connecting professionals and hiring organizations through verified identity and explainable AI matching.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          {[
            {
              step: "01",
              title: "Build Your Identity",
              icon: UserIcon,
              body: "Create your professional or organization profile. Upload your resume to auto-parse skills, experience, and bio using AI.",
            },
            {
              step: "02",
              title: "Discover Explainable Matches",
              icon: Sparkles,
              body: "Browse remote jobs aggregated across 5 major public job boards. Every role computes a transparent 6-factor AI score breakdown.",
            },
            {
              step: "03",
              title: "Collaborate & Execute",
              icon: FolderKanban,
              body: "Track applications in real-time, execute AI-planned project briefs, log deliverables, and settle milestone payments securely.",
            },
          ].map((item) => (
            <div key={item.step} className="card-enterprise p-6 space-y-3 relative overflow-hidden">
              <div className="flex items-center justify-between">
                <div className="h-10 w-10 rounded-xl bg-blue-50 dark:bg-blue-950 text-[#B54A2C] flex items-center justify-center font-bold">
                  <item.icon className="h-5 w-5" />
                </div>
                <span className="text-2xl font-black text-slate-500 dark:text-slate-500">{item.step}</span>
              </div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">{item.title}</h3>
              <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-400">{item.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ========================================================================= */}
      {/* SECTION 2: DUAL PLATFORM PILLARS (FOR PROFESSIONALS & FOR ORGANIZATIONS) */}
      {/* ========================================================================= */}
      <section className="grid gap-8 lg:grid-cols-2">
        {/* For Professionals Card */}
        <div className="card-enterprise p-8 space-y-6 border-l-4 border-l-[#B54A2C]">
          <div className="space-y-2">
            <span className="badge-ent badge-ent-brand">For Professionals & Developers</span>
            <h3 className="text-2xl font-bold text-slate-900 dark:text-white">Accelerate Your Remote Career</h3>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Build a credible professional profile, receive explainable AI job recommendations, and manage all your applications in one place.
            </p>
          </div>

          <div className="space-y-3">
            {[
              "AI Resume Import — Auto-extract skills, headline, and experience in seconds",
              "Transparent AI Match Breakdown — Understand why a job fits your skills",
              "Unified Application Tracking — Monitor status transitions from Applied to Offer",
              "Project Work OS — Deliver milestone tasks with AI progress & risk reports",
            ].map((feat) => (
              <div key={feat} className="flex items-start gap-2.5 text-xs text-slate-700 dark:text-slate-300">
                <CheckCircle2 className="h-4 w-4 text-[#B54A2C] shrink-0 mt-0.5" />
                <span>{feat}</span>
              </div>
            ))}
          </div>

          <Link href="/jobs" className="btn-primary-brand inline-flex items-center gap-2 text-xs">
            Explore Open Roles <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        {/* For Organizations Card */}
        <div className="card-enterprise p-8 space-y-6 border-l-4 border-l-indigo-600">
          <div className="space-y-2">
            <span className="badge-ent badge-ent-neutral bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
              For Organizations & Employers
            </span>
            <h3 className="text-2xl font-bold text-slate-900 dark:text-white">Hire Top Engineering Talent</h3>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Post active openings, search public candidate profiles with AI ranking, and streamline candidate pipelines.
            </p>
          </div>

          <div className="space-y-3">
            {[
              "Multi-Step Job Creation Wizard — AI-assisted job description optimization",
              "Candidate Discovery Engine — Search candidates filtered by skills & experience",
              "AI Candidate Ranking — Match score breakdown for every applicant",
              "Hiring Pipeline Kanban — Review, shortlist, and invite top professionals seamlessly",
            ].map((feat) => (
              <div key={feat} className="flex items-start gap-2.5 text-xs text-slate-700 dark:text-slate-300">
                <CheckCircle2 className="h-4 w-4 text-indigo-600 shrink-0 mt-0.5" />
                <span>{feat}</span>
              </div>
            ))}
          </div>

          <Link href="/company/candidates" className="btn-secondary-brand inline-flex items-center gap-2 text-xs">
            Discover Qualified Talent <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* SECTION 3: EXPLAINABLE AI MATCHING ENGINE */}
      {/* ========================================================================= */}
      <section className="card-enterprise p-8 sm:p-12 space-y-8 !bg-slate-900 !text-white !border-none rounded-[var(--radius-card)] shadow-[var(--shadow-md)]">
        <div className="grid items-center gap-8 lg:grid-cols-12">
          <div className="lg:col-span-7 space-y-4">
            <div className="inline-flex items-center gap-2 text-indigo-400 font-semibold text-xs uppercase tracking-wider">
              <Sparkles className="h-4 w-4" /> Explainable AI Matching
            </div>
            <h2 className="text-3xl font-bold tracking-tight">No Mysterious Scores. Every Recommendation Explains Why.</h2>
            <p className="text-sm leading-relaxed text-slate-300">
              Unlike generic job boards that return opaque relevance percentages, Remote AI Platform evaluates 6 distinct fit dimensions: Skills, Experience Level, Role Alignment, Work Availability, Compensation Expectations, and Remote Timezone Fit.
            </p>
            <div className="grid grid-cols-2 gap-4 pt-2">
              <div className="bg-slate-800/80 p-4 rounded-xl border border-slate-700 space-y-1">
                <div className="text-xl font-bold text-emerald-400">6 Fit Dimensions</div>
                <div className="text-xs text-slate-400">Comprehensive multi-factor evaluation</div>
              </div>
              <div className="bg-slate-800/80 p-4 rounded-xl border border-slate-700 space-y-1">
                <div className="text-xl font-bold text-indigo-400">Skill Gap Feedback</div>
                <div className="text-xs text-slate-400">Clear list of matched vs missing skills</div>
              </div>
            </div>
          </div>

          <div className="lg:col-span-5 bg-slate-800 p-6 rounded-2xl border border-slate-700 space-y-4">
            <h3 className="text-sm font-bold text-slate-200 flex items-center justify-between">
              <span>6-Factor Evaluation Preview</span>
              <span className="text-xs text-emerald-400 font-mono">92/100</span>
            </h3>
            {[
              { label: "Skills Matching", val: 96, color: "bg-emerald-500" },
              { label: "Experience Seniority", val: 90, color: "bg-indigo-500" },
              { label: "Role Alignment", val: 95, color: "bg-blue-500" },
              { label: "Availability Fit", val: 88, color: "bg-emerald-500" },
              { label: "Compensation Match", val: 92, color: "bg-indigo-500" },
              { label: "Remote Timezone", val: 90, color: "bg-blue-500" },
            ].map((f) => (
              <div key={f.label} className="space-y-1 text-xs">
                <div className="flex justify-between text-slate-300">
                  <span>{f.label}</span>
                  <span className="font-mono">{f.val}%</span>
                </div>
                <div className="w-full bg-slate-700 h-1.5 rounded-full overflow-hidden">
                  <div className={`${f.color} h-full rounded-full`} style={{ width: `${f.val}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* SECTION 4: JOB MARKETPLACE AGGREGATOR */}
      {/* ========================================================================= */}
      <section className="space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-[#B54A2C]">Aggregated Job Engine</span>
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white mt-1">Live Positions Across 5 Major Aggregators</h2>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
              Synchronized periodically from RemoteOK, Remotive, Arbeitnow, USAJobs, and The Muse.
            </p>
          </div>
          <Link href="/jobs" className="text-xs font-semibold text-[#B54A2C] hover:underline flex items-center gap-1">
            View All Job Listings &rarr;
          </Link>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[
            { title: "Senior React / Next.js Engineer", company: "Vercel Partner", location: "100% Remote", salary: "$140k - $170k", source: "RemoteOK" },
            { title: "Staff Backend Engineer (Python/FastAPI)", company: "AI Cloud Infrastructure", location: "US / EU Remote", salary: "$160k - $190k", source: "Remotive" },
            { title: "Lead Systems Engineer (Rust / Go)", company: "Distributed Ledger Inc", location: "Worldwide", salary: "$150k - $185k", source: "Arbeitnow" },
          ].map((job) => (
            <div key={job.title} className="card-enterprise p-5 space-y-3 hover:border-[#B54A2C] transition-colors">
              <div className="flex items-center justify-between">
                <span className="badge-ent badge-ent-neutral text-[10px] font-mono">{job.source}</span>
                <span className="badge-ent badge-ent-brand text-[10px]">Remote</span>
              </div>
              <div>
                <h3 className="font-bold text-slate-900 dark:text-white text-sm">{job.title}</h3>
                <p className="text-xs text-[#B54A2C] font-semibold mt-0.5">{job.company}</p>
              </div>
              <div className="flex items-center justify-between text-xs text-slate-500 pt-2 border-t border-slate-100 dark:border-slate-800">
                <span>{job.location}</span>
                <span className="font-bold text-emerald-700 dark:text-emerald-400">{job.salary}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ========================================================================= */}
      {/* FINAL CTA BANNER */}
      {/* ========================================================================= */}
      <section className="card-enterprise p-8 sm:p-12 text-center space-y-5 bg-gradient-to-r from-[#B54A2C] to-[#7A3B4A] text-white border-none shadow-xl">
        <h2 className="text-3xl font-extrabold sm:text-4xl">Ready to join the remote engineering network?</h2>
        <p className="text-sm sm:text-base text-blue-100 max-w-xl mx-auto">
          Create your account today, import your resume with AI, and start connecting with exceptional remote organizations and professionals.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-4 pt-2">
          <Link href="/auth/register" className="btn-primary-brand bg-white text-[#B54A2C] hover:bg-blue-50 py-3 px-8 text-sm font-bold shadow-md">
            Get Started Free
          </Link>
          <Link href="/auth/login" className="btn-secondary-brand border-white/40 text-white hover:bg-white/10 py-3 px-8 text-sm font-semibold">
            Sign In to Account
          </Link>
        </div>
      </section>
    </div>
  );
}

function UserIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg {...props} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
    </svg>
  );
}
