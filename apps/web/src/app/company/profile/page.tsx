"use client";

import Link from "next/link";
import {
  Building2,
  Globe2,
  MapPin,
  Users,
  Briefcase,
  ExternalLink,
  Edit3,
  Plus,
  Code2,
  CheckCircle2,
  Star,
  ArrowRight,
} from "lucide-react";

const openRoles = [
  { title: "Senior Backend Engineer", type: "Full-time", skills: ["Go", "Kubernetes", "PostgreSQL"], salary: "$140k–$180k" },
  { title: "ML Engineer – AI Platform", type: "Full-time", skills: ["Python", "PyTorch", "LLM"], salary: "$150k–$200k" },
  { title: "DevOps Engineer", type: "Contract", skills: ["Terraform", "AWS", "Docker"], salary: "$100–$140/hr" },
];

const techStack = [
  "Go", "Python", "React", "TypeScript", "Kubernetes", "PostgreSQL",
  "AWS", "Terraform", "Redis", "Kafka",
];

export default function CompanyProfile() {
  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      {/* ── Profile Header ── */}
      <div className="card overflow-hidden">
        <div className="h-28 bg-gradient-to-r from-indigo-600/30 via-purple-600/20 to-cyan-600/20 relative">
          <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/5 to-transparent" />
        </div>
        <div className="px-6 pb-6">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 -mt-10 mb-4">
            <div className="flex items-end gap-4">
              <div className="h-20 w-20 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center ring-4 ring-[#0b0f19] shadow-xl">
                <Building2 className="h-9 w-9 text-white" />
              </div>
              <div className="pb-1">
                <h1 className="text-xl font-bold text-white">Acme Technologies</h1>
                <p className="text-sm text-slate-400">Enterprise SaaS · Series B · 150 employees</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button className="btn-secondary text-sm">
                <Edit3 className="h-3.5 w-3.5" /> Edit page
              </button>
            </div>
          </div>
          <div className="flex flex-wrap gap-4 text-sm text-slate-400">
            <span className="flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5 text-slate-600" />San Francisco, CA · 100% Remote</span>
            <span className="flex items-center gap-1.5"><Globe2 className="h-3.5 w-3.5 text-slate-600" />acmetechnologies.com</span>
            <span className="flex items-center gap-1.5"><Users className="h-3.5 w-3.5 text-slate-600" />150–200 employees</span>
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Left */}
        <div className="lg:col-span-2 space-y-6">
          {/* About */}
          <div className="card p-6">
            <h2 className="font-semibold text-white mb-4">About</h2>
            <p className="text-sm text-slate-400 leading-relaxed">
              Acme Technologies is building the next generation of enterprise automation software. We're a remote-first company 
              serving over 2,000 enterprise customers worldwide, processing 10M+ events daily. Founded in 2018, we've raised 
              Series B funding and are growing aggressively across engineering, product, and go-to-market.
            </p>
          </div>

          {/* Tech Stack */}
          <div className="card p-6">
            <h2 className="font-semibold text-white mb-4 flex items-center gap-2">
              <Code2 className="h-4 w-4 text-slate-400" /> Tech Stack
            </h2>
            <div className="flex flex-wrap gap-2">
              {techStack.map((t) => <span key={t} className="tag tag-primary">{t}</span>)}
            </div>
          </div>

          {/* Open Roles */}
          <div className="card p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-semibold text-white flex items-center gap-2">
                <Briefcase className="h-4 w-4 text-slate-400" /> Open Roles ({openRoles.length})
              </h2>
              <Link href="/jobs/new" className="btn-secondary text-xs flex items-center gap-1">
                <Plus className="h-3.5 w-3.5" /> Post role
              </Link>
            </div>
            <div className="space-y-3">
              {openRoles.map((role) => (
                <div key={role.title} className="flex items-start gap-4 p-4 rounded-xl bg-white/[0.02] border border-white/5 hover:border-cyan-500/25 transition-all group">
                  <div className="h-9 w-9 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center flex-shrink-0">
                    <Briefcase className="h-4 w-4 text-indigo-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h3 className="font-medium text-white text-sm group-hover:text-cyan-300 transition-colors">{role.title}</h3>
                        <div className="flex flex-wrap gap-1.5 mt-1.5">
                          <span className="badge badge-neutral">{role.type}</span>
                          {role.skills.map((s) => <span key={s} className="tag text-[10px]">{s}</span>)}
                        </div>
                      </div>
                      <span className="text-xs text-emerald-400 font-semibold flex-shrink-0">{role.salary}</span>
                    </div>
                  </div>
                  <ArrowRight className="h-4 w-4 text-slate-700 group-hover:text-slate-400 transition-colors flex-shrink-0" />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right */}
        <div className="space-y-6">
          {/* Company Stats */}
          <div className="card p-6 space-y-4">
            <h2 className="font-semibold text-white mb-1">Company Info</h2>
            {[
              { label: "Founded", value: "2018" },
              { label: "Stage", value: "Series B" },
              { label: "Employees", value: "150–200" },
              { label: "Work policy", value: "100% Remote" },
              { label: "Hiring status", value: "Actively hiring" },
            ].map((item) => (
              <div key={item.label} className="flex justify-between text-sm">
                <span className="text-slate-500">{item.label}</span>
                <span className={`font-medium ${item.label === "Hiring status" ? "text-emerald-400" : "text-white"}`}>{item.value}</span>
              </div>
            ))}
          </div>

          {/* Benefits */}
          <div className="card p-6">
            <h2 className="font-semibold text-white mb-4">Benefits</h2>
            <div className="space-y-2">
              {[
                "Competitive salary + equity",
                "Remote-first culture",
                "Flexible working hours",
                "$3,000/year learning budget",
                "Health, dental, and vision",
                "Annual team retreats",
              ].map((benefit) => (
                <div key={benefit} className="flex items-center gap-2 text-sm text-slate-400">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 flex-shrink-0" />
                  {benefit}
                </div>
              ))}
            </div>
          </div>

          {/* Rating */}
          <div className="card p-6">
            <h2 className="font-semibold text-white mb-3">Culture Rating</h2>
            <div className="flex items-center gap-2 mb-3">
              <div className="text-3xl font-bold gradient-text">4.7</div>
              <div className="flex flex-col gap-0.5">
                <div className="flex gap-0.5">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star key={i} className={`h-3.5 w-3.5 ${i < 5 ? "text-amber-400 fill-amber-400" : "text-slate-700"}`} />
                  ))}
                </div>
                <span className="text-[10px] text-slate-600">Based on 48 reviews</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
