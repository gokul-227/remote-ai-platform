"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  User,
  Briefcase,
  Star,
  TrendingUp,
  Sparkles,
  CheckCircle2,
  Clock,
  Bookmark,
  ArrowRight,
  ChevronRight,
  Building2,
  DollarSign,
  MapPin,
  PlusCircle,
  AlertCircle,
} from "lucide-react";
import api from "@/lib/api";
import { useAuth } from "@/lib/auth";

const profileCompletion = [
  { label: "Profile photo", done: false },
  { label: "Headline added", done: true },
  { label: "About section", done: true },
  { label: "Skills listed", done: true },
  { label: "Resume uploaded", done: false },
  { label: "GitHub linked", done: false },
  { label: "Experience added", done: true },
  { label: "Availability set", done: false },
];

const aiSuggestions = [
  { skill: "Kubernetes", impact: "+18%", reason: "High demand in 340 matching roles" },
  { skill: "Terraform", impact: "+12%", reason: "Required by 180 DevOps openings" },
  { skill: "Go", impact: "+9%", reason: "Backend roles with 30% salary premium" },
];

const recentActivity = [
  { icon: Briefcase, text: "Applied to Senior React Engineer at Stripe", time: "2h ago", color: "text-cyan-400" },
  { icon: Star, text: "Saved: ML Engineer at Anthropic", time: "5h ago", color: "text-amber-400" },
  { icon: Sparkles, text: "AI profile score updated to 82/100", time: "Yesterday", color: "text-indigo-400" },
  { icon: TrendingUp, text: "Profile viewed by 3 companies", time: "2d ago", color: "text-emerald-400" },
];

function CompletionRing({ percent }: { percent: number }) {
  const r = 36;
  const circ = 2 * Math.PI * r;
  const offset = circ - (percent / 100) * circ;
  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width="88" height="88" className="-rotate-90">
        <circle cx="44" cy="44" r={r} stroke="rgba(255,255,255,0.06)" strokeWidth="7" fill="none" />
        <circle
          cx="44" cy="44" r={r}
          stroke="url(#grad)" strokeWidth="7" fill="none"
          strokeDasharray={circ} strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 0.8s ease" }}
        />
        <defs>
          <linearGradient id="grad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#0891b2" />
            <stop offset="100%" stopColor="#6366f1" />
          </linearGradient>
        </defs>
      </svg>
      <div className="absolute text-center">
        <p className="text-xl font-bold text-white">{percent}%</p>
      </div>
    </div>
  );
}

interface JobPost {
  id: string;
  title: string;
  company_name: string;
  salary_min?: number;
  salary_max?: number;
  location?: string;
  skills: string[];
  posted_at: string;
}

export default function EngineerDashboard() {
  const { user } = useAuth();
  const [recommendedJobs, setRecommendedJobs] = useState<JobPost[]>([]);
  const [loadingJobs, setLoadingJobs] = useState(true);

  const completedCount = profileCompletion.filter((s) => s.done).length;
  const completionPercent = Math.round((completedCount / profileCompletion.length) * 100);

  useEffect(() => {
    api.get("/jobs", { params: { limit: 5 } })
      .then((r) => setRecommendedJobs(Array.isArray(r.data) ? r.data : r.data.items ?? []))
      .catch(() => setRecommendedJobs([]))
      .finally(() => setLoadingJobs(false));
  }, []);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      {/* ── Page Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">
            Welcome back, {user?.full_name?.split(" ")[0] || "Engineer"} 👋
          </h1>
          <p className="text-sm text-slate-500 mt-1">Here's your career overview today.</p>
        </div>
        <Link href="/engineer/profile" className="btn-primary text-sm flex-shrink-0">
          <PlusCircle className="h-4 w-4" /> Update Profile
        </Link>
      </div>

      {/* ── Top Stats Row ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "AI Match Score", value: "82/100", icon: Sparkles, color: "text-cyan-400", bg: "bg-cyan-500/10", border: "border-cyan-500/20" },
          { label: "Jobs Matched", value: "47", icon: Briefcase, color: "text-indigo-400", bg: "bg-indigo-500/10", border: "border-indigo-500/20" },
          { label: "Profile Views", value: "12", icon: TrendingUp, color: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/20" },
          { label: "Saved Jobs", value: "8", icon: Bookmark, color: "text-amber-400", bg: "bg-amber-500/10", border: "border-amber-500/20" },
        ].map((stat) => {
          const Icon = stat.icon;
          return (
            <div key={stat.label} className="card p-5">
              <div className={`h-9 w-9 rounded-xl ${stat.bg} border ${stat.border} flex items-center justify-center mb-3`}>
                <Icon className={`h-4.5 w-4.5 ${stat.color}`} />
              </div>
              <p className="text-2xl font-bold text-white">{stat.value}</p>
              <p className="text-xs text-slate-500 mt-1">{stat.label}</p>
            </div>
          );
        })}
      </div>

      {/* ── Main Grid ── */}
      <div className="grid lg:grid-cols-3 gap-6">
        {/* ── Left Column ── */}
        <div className="lg:col-span-2 space-y-6">
          {/* AI Recommended Jobs */}
          <div className="card p-6">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="font-semibold text-white flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-cyan-400" />
                  AI Recommended Jobs
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">Based on your skills and profile</p>
              </div>
              <Link href="/jobs" className="text-xs text-cyan-400 hover:text-cyan-300 flex items-center gap-1 transition-colors">
                View all <ChevronRight className="h-3.5 w-3.5" />
              </Link>
            </div>

            <div className="space-y-3">
              {loadingJobs
                ? Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="flex items-start gap-3 p-3 rounded-xl bg-white/[0.02] border border-white/5 animate-pulse">
                    <div className="skeleton h-9 w-9 rounded-lg" />
                    <div className="flex-1 space-y-1.5">
                      <div className="skeleton h-3.5 w-2/3 rounded" />
                      <div className="skeleton h-3 w-1/3 rounded" />
                    </div>
                  </div>
                ))
                : recommendedJobs.length === 0
                ? (
                  <div className="text-center py-8 space-y-2">
                    <AlertCircle className="h-8 w-8 text-slate-600 mx-auto" />
                    <p className="text-sm text-slate-500">No job recommendations yet.</p>
                    <Link href="/jobs" className="text-xs text-cyan-400">Browse all jobs →</Link>
                  </div>
                )
                : recommendedJobs.map((job) => {
                  const matchScore = Math.floor(65 + Math.random() * 30);
                  const scoreClass = matchScore >= 85 ? "match-score-high" : matchScore >= 70 ? "match-score-medium" : "match-score-low";
                  return (
                    <Link
                      key={job.id}
                      href={`/jobs/${job.id}`}
                      className="flex items-start gap-3 p-3.5 rounded-xl bg-white/[0.02] border border-white/5 hover:border-cyan-500/30 hover:bg-white/[0.04] transition-all group"
                    >
                      <div className="h-9 w-9 rounded-lg bg-slate-800 border border-white/10 flex items-center justify-center flex-shrink-0">
                        <Building2 className="h-4 w-4 text-slate-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-white group-hover:text-cyan-300 transition-colors truncate">{job.title}</p>
                        <p className="text-xs text-slate-500 mt-0.5">{job.company_name}</p>
                        <div className="flex gap-1.5 mt-1.5 flex-wrap">
                          {job.skills?.slice(0, 3).map((s) => (
                            <span key={s} className="tag text-[10px] px-1.5">{s}</span>
                          ))}
                          {job.salary_min && (
                            <span className="tag text-[10px] text-emerald-400 px-1.5">
                              ${(job.salary_min/1000).toFixed(0)}k+
                            </span>
                          )}
                        </div>
                      </div>
                      <div className={`match-score h-8 w-8 text-[9px] flex-shrink-0 ${scoreClass}`}>
                        {matchScore}%
                      </div>
                    </Link>
                  );
                })}
            </div>
          </div>

          {/* Recent Activity */}
          <div className="card p-6">
            <h2 className="font-semibold text-white flex items-center gap-2 mb-5">
              <Clock className="h-4 w-4 text-slate-400" />
              Recent Activity
            </h2>
            <div className="space-y-4">
              {recentActivity.map((item, i) => {
                const Icon = item.icon;
                return (
                  <div key={i} className="flex items-start gap-3">
                    <div className="h-8 w-8 rounded-lg bg-white/[0.03] border border-white/5 flex items-center justify-center flex-shrink-0">
                      <Icon className={`h-4 w-4 ${item.color}`} />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm text-slate-300">{item.text}</p>
                      <p className="text-xs text-slate-600 mt-0.5">{item.time}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* ── Right Column ── */}
        <div className="space-y-6">
          {/* Profile Completion */}
          <div className="card p-6">
            <h2 className="font-semibold text-white mb-4">Profile Completion</h2>
            <div className="flex items-center gap-4 mb-5">
              <CompletionRing percent={completionPercent} />
              <div>
                <p className="text-sm font-medium text-white">
                  {completedCount}/{profileCompletion.length} completed
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  {completionPercent < 80
                    ? "Complete your profile to get more matches"
                    : "Great profile! Keep it updated."}
                </p>
              </div>
            </div>
            <div className="space-y-2">
              {profileCompletion.map((item) => (
                <div key={item.label} className="flex items-center gap-2.5">
                  {item.done
                    ? <CheckCircle2 className="h-4 w-4 text-emerald-500 flex-shrink-0" />
                    : <div className="h-4 w-4 rounded-full border border-white/15 flex-shrink-0" />
                  }
                  <span className={`text-xs ${item.done ? "text-slate-400" : "text-slate-600"}`}>
                    {item.label}
                  </span>
                  {!item.done && (
                    <span className="ml-auto text-[10px] text-cyan-400 cursor-pointer hover:underline">Add</span>
                  )}
                </div>
              ))}
            </div>
            <Link href="/engineer/profile" className="btn-primary w-full text-sm mt-5 justify-center">
              Edit Profile <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          {/* AI Improvement Suggestions */}
          <div className="card p-6">
            <h2 className="font-semibold text-white flex items-center gap-2 mb-4">
              <Sparkles className="h-4 w-4 text-indigo-400" />
              AI Skill Suggestions
            </h2>
            <div className="space-y-3">
              {aiSuggestions.map((s) => (
                <div key={s.skill} className="p-3 rounded-xl bg-indigo-500/5 border border-indigo-500/15 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-white">{s.skill}</span>
                    <span className="badge badge-success text-[10px]">{s.impact} match</span>
                  </div>
                  <p className="text-xs text-slate-500">{s.reason}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
