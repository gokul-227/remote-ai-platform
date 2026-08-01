"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  Building2,
  Users,
  Briefcase,
  Sparkles,
  TrendingUp,
  Star,
  PlusCircle,
  ChevronRight,
  User,
  Clock,
  CheckCircle2,
  Search,
  Bookmark,
  BarChart3,
  AlertCircle,
} from "lucide-react";
import api from "@/lib/api";

const hiringPipeline = [
  { stage: "Sourcing", count: 24, color: "bg-slate-600" },
  { stage: "Screening", count: 11, color: "bg-indigo-500/60" },
  { stage: "Interview", count: 6, color: "bg-cyan-500/60" },
  { stage: "Offer", count: 2, color: "bg-emerald-500/60" },
];

const recentActivity = [
  { icon: User, text: "3 new engineers matched to Senior Backend role", time: "30m ago", color: "text-cyan-400" },
  { icon: Star, text: "Saved: Maria Rodriguez – Staff Engineer", time: "2h ago", color: "text-amber-400" },
  { icon: Briefcase, text: "New role posted: ML Engineer – AI Platform", time: "Yesterday", color: "text-indigo-400" },
  { icon: CheckCircle2, text: "Offer sent to Raj Patel (Senior DevOps)", time: "2d ago", color: "text-emerald-400" },
];

interface EngineerMatch {
  id: string;
  headline?: string;
  skills?: string[];
  match_score?: number;
  user?: { full_name: string; email: string };
}

export default function CompanyDashboard() {
  const [engineers, setEngineers] = useState<EngineerMatch[]>([]);
  const [loadingEngineers, setLoadingEngineers] = useState(true);

  useEffect(() => {
    api.get("/engineers", { params: { limit: 4 } })
      .then((r) => setEngineers(Array.isArray(r.data) ? r.data : r.data.items ?? []))
      .catch(() => setEngineers([]))
      .finally(() => setLoadingEngineers(false));
  }, []);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Company Dashboard</h1>
          <p className="text-sm text-slate-500 mt-1">Manage your talent pipeline and hiring activities</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/jobs/new" className="btn-secondary text-sm">
            <PlusCircle className="h-4 w-4" /> Post a Job
          </Link>
          <Link href="/company/profile" className="btn-primary text-sm">
            View Company Page
          </Link>
        </div>
      </div>

      {/* ── Stats ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Active Roles", value: "7", icon: Briefcase, color: "text-cyan-400", bg: "bg-cyan-500/10", border: "border-cyan-500/20" },
          { label: "Candidates in Pipeline", value: "43", icon: Users, color: "text-indigo-400", bg: "bg-indigo-500/10", border: "border-indigo-500/20" },
          { label: "AI Matches This Week", value: "128", icon: Sparkles, color: "text-amber-400", bg: "bg-amber-500/10", border: "border-amber-500/20" },
          { label: "Saved Engineers", value: "19", icon: Bookmark, color: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/20" },
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
        {/* Left */}
        <div className="lg:col-span-2 space-y-6">
          {/* AI Recommended Engineers */}
          <div className="card p-6">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="font-semibold text-white flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-cyan-400" />
                  AI Recommended Engineers
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">Matched to your open roles</p>
              </div>
              <Link href="/engineers" className="text-xs text-cyan-400 hover:text-cyan-300 flex items-center gap-1 transition-colors">
                View all <ChevronRight className="h-3.5 w-3.5" />
              </Link>
            </div>

            <div className="space-y-3">
              {loadingEngineers
                ? Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="flex items-start gap-3 p-3.5 rounded-xl bg-white/[0.02] border border-white/5 animate-pulse">
                    <div className="skeleton h-10 w-10 rounded-full" />
                    <div className="flex-1 space-y-1.5">
                      <div className="skeleton h-3.5 w-1/3 rounded" />
                      <div className="skeleton h-3 w-1/2 rounded" />
                    </div>
                  </div>
                ))
                : engineers.length === 0
                ? (
                  <div className="text-center py-10 space-y-2">
                    <AlertCircle className="h-8 w-8 text-slate-600 mx-auto" />
                    <p className="text-sm text-slate-500">No engineer data yet.</p>
                    <Link href="/engineers" className="text-xs text-cyan-400">Browse all engineers →</Link>
                  </div>
                )
                : engineers.map((eng, i) => {
                  const matchScore = eng.match_score ?? Math.floor(70 + Math.random() * 25);
                  const scoreClass = matchScore >= 85 ? "match-score-high" : matchScore >= 70 ? "match-score-medium" : "match-score-low";
                  const name = eng.user?.full_name ?? `Engineer ${i + 1}`;
                  return (
                    <div key={eng.id} className="flex items-center gap-3 p-3.5 rounded-xl bg-white/[0.02] border border-white/5 hover:border-cyan-500/25 hover:bg-white/[0.04] transition-all group">
                      <div className="avatar h-10 w-10 text-sm flex-shrink-0">
                        {name.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-white group-hover:text-cyan-300 transition-colors">{name}</p>
                        <p className="text-xs text-slate-500 mt-0.5 truncate">{eng.headline || "Software Engineer"}</p>
                        <div className="flex gap-1.5 mt-1.5 flex-wrap">
                          {(eng.skills || ["React", "TypeScript", "Python"]).slice(0, 3).map((s: string) => (
                            <span key={s} className="tag text-[10px]">{s}</span>
                          ))}
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <div className={`match-score h-8 w-8 text-[9px] flex-shrink-0 ${scoreClass}`}>
                          {matchScore}%
                        </div>
                        <div className="flex gap-1">
                          <button className="btn-ghost p-1" title="Save"><Bookmark className="h-3.5 w-3.5" /></button>
                          <button className="btn-ghost p-1 text-cyan-400" title="Contact"><ChevronRight className="h-3.5 w-3.5" /></button>
                        </div>
                      </div>
                    </div>
                  );
                })
              }
            </div>
          </div>

          {/* Recent Activity */}
          <div className="card p-6">
            <h2 className="font-semibold text-white flex items-center gap-2 mb-5">
              <Clock className="h-4 w-4 text-slate-400" /> Recent Activity
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

        {/* Right */}
        <div className="space-y-6">
          {/* Hiring Pipeline */}
          <div className="card p-6">
            <h2 className="font-semibold text-white flex items-center gap-2 mb-5">
              <BarChart3 className="h-4 w-4 text-slate-400" /> Hiring Pipeline
            </h2>
            <div className="space-y-3">
              {hiringPipeline.map((stage) => {
                const maxCount = Math.max(...hiringPipeline.map((s) => s.count));
                return (
                  <div key={stage.stage} className="space-y-1.5">
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-400">{stage.stage}</span>
                      <span className="font-semibold text-white">{stage.count}</span>
                    </div>
                    <div className="progress-bar">
                      <div
                        className={`h-full rounded-full ${stage.color}`}
                        style={{ width: `${(stage.count / maxCount) * 100}%`, transition: "width 0.4s ease" }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="mt-4 pt-4 border-t border-white/5 text-center">
              <Link href="/company/pipeline" className="text-xs text-cyan-400 hover:text-cyan-300 flex items-center justify-center gap-1 transition-colors">
                View full pipeline <ChevronRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="card p-6 space-y-3">
            <h2 className="font-semibold text-white mb-4">Quick Actions</h2>
            {[
              { label: "Post a new job", icon: Briefcase, href: "/jobs/new", color: "text-cyan-400" },
              { label: "Search engineers", icon: Search, href: "/engineers", color: "text-indigo-400" },
              { label: "View AI matches", icon: Sparkles, href: "/company/matches", color: "text-amber-400" },
              { label: "Manage saved talent", icon: Bookmark, href: "/company/saved", color: "text-emerald-400" },
            ].map((action) => {
              const Icon = action.icon;
              return (
                <Link
                  key={action.label}
                  href={action.href}
                  className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.02] border border-white/5 hover:border-cyan-500/25 hover:bg-white/[0.04] transition-all group"
                >
                  <Icon className={`h-4 w-4 ${action.color} flex-shrink-0`} />
                  <span className="text-sm text-slate-300 group-hover:text-white transition-colors">{action.label}</span>
                  <ChevronRight className="h-3.5 w-3.5 text-slate-700 group-hover:text-slate-400 ml-auto transition-colors" />
                </Link>
              );
            })}
          </div>

          {/* AI Insights */}
          <div className="card p-6 space-y-3 bg-gradient-to-br from-indigo-500/5 to-transparent">
            <h2 className="font-semibold text-white flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-indigo-400" /> AI Insights
            </h2>
            {[
              { text: "React + TypeScript is the most in-demand stack in your open roles", type: "info" },
              { text: "Engineers with Kubernetes exp. are 3× more likely to accept remote offers", type: "tip" },
              { text: "Avg. time-to-hire dropped 18% this month using AI shortlisting", type: "success" },
            ].map((insight, i) => (
              <div key={i} className="p-3 rounded-lg bg-white/[0.03] border border-white/5 text-xs text-slate-400 leading-relaxed">
                {insight.text}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
