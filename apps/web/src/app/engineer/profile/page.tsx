"use client";

import { useState } from "react";
import {
  User,
  MapPin,
  Globe2,
  Github,
  Linkedin,
  Star,
  Sparkles,
  Plus,
  Edit3,
  Upload,
  Check,
  Clock,
  CheckCircle2,
  ExternalLink,
  ChevronRight,
  Code2,
  Briefcase,
  Award,
} from "lucide-react";
import { useAuth } from "@/lib/auth";

const MOCK_SKILLS = [
  "React", "TypeScript", "Next.js", "Python", "FastAPI", "PostgreSQL",
  "Docker", "AWS", "GraphQL", "Node.js", "TailwindCSS", "Kubernetes",
];

const MOCK_EXPERIENCE = [
  {
    role: "Senior Frontend Engineer",
    company: "Acme Corp",
    period: "Jan 2022 – Present",
    description: "Led frontend architecture for a SaaS platform serving 50k+ users. Introduced design system and reduced bundle size by 40%.",
    skills: ["React", "TypeScript", "GraphQL"],
  },
  {
    role: "Full-stack Developer",
    company: "StartupXYZ",
    period: "Mar 2019 – Dec 2021",
    description: "Built core product features from 0→1. Owned the entire data pipeline and REST API.",
    skills: ["Python", "FastAPI", "PostgreSQL", "React"],
  },
];

const AI_SCORE_BREAKDOWN = [
  { label: "Skills depth", value: 88, color: "#0ea5e9" },
  { label: "Experience fit", value: 76, color: "#6366f1" },
  { label: "Profile completeness", value: 63, color: "#a78bfa" },
  { label: "Activity score", value: 72, color: "#10b981" },
];

function ScoreBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-xs">
        <span className="text-slate-400">{label}</span>
        <span className="font-semibold text-white">{value}%</span>
      </div>
      <div className="progress-bar">
        <div className="progress-fill" style={{ width: `${value}%`, background: `linear-gradient(90deg, ${color}aa, ${color})` }} />
      </div>
    </div>
  );
}

export default function EngineerProfile() {
  const { user } = useAuth();
  const [availability, setAvailability] = useState<"available" | "open" | "unavailable">("available");

  const displayName = user?.full_name || "Alex Johnson";
  const initials = displayName.split(" ").map((n) => n[0]).join("").toUpperCase();

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      {/* ── Profile Header Card ── */}
      <div className="card relative overflow-hidden">
        {/* Cover gradient */}
        <div className="h-28 bg-gradient-to-r from-cyan-600/30 via-indigo-600/20 to-purple-600/30 relative">
          <div className="absolute inset-0 bg-[url('/grid.svg')] opacity-10" />
        </div>

        {/* Avatar + core info */}
        <div className="px-6 pb-6">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 -mt-12 mb-4">
            <div className="flex items-end gap-4">
              <div className="h-20 w-20 rounded-2xl avatar text-2xl ring-4 ring-[#0b0f19] bg-gradient-to-br from-cyan-500 to-indigo-600 flex items-center justify-center">
                {initials}
              </div>
              <div className="pb-1">
                <h1 className="text-xl font-bold text-white">{displayName}</h1>
                <p className="text-sm text-slate-400">Senior Full-Stack Engineer · Remote</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button className="btn-secondary text-sm">
                <Edit3 className="h-3.5 w-3.5" /> Edit profile
              </button>
              <button className="btn-primary text-sm">
                <ExternalLink className="h-3.5 w-3.5" /> Share
              </button>
            </div>
          </div>

          {/* Meta row */}
          <div className="flex flex-wrap gap-4 text-sm text-slate-400 mb-4">
            <span className="flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5 text-slate-600" />London, UK · Remote</span>
            <span className="flex items-center gap-1.5"><Globe2 className="h-3.5 w-3.5 text-slate-600" />UTC+0</span>
            <a href="#" className="flex items-center gap-1.5 hover:text-cyan-300 transition-colors">
              <Github className="h-3.5 w-3.5" />github.com/alex
            </a>
            <a href="#" className="flex items-center gap-1.5 hover:text-cyan-300 transition-colors">
              <Linkedin className="h-3.5 w-3.5" />linkedin.com/in/alex
            </a>
          </div>

          {/* Availability */}
          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-500">Availability:</span>
            {(["available", "open", "unavailable"] as const).map((opt) => (
              <button
                key={opt}
                onClick={() => setAvailability(opt)}
                className={`badge cursor-pointer capitalize transition-all ${
                  availability === opt
                    ? opt === "available" ? "badge-success" : opt === "open" ? "badge-warning" : "badge-error"
                    : "badge-neutral opacity-50"
                }`}
              >
                {opt === "available" ? "✓ Available now" : opt === "open" ? "◎ Open to offers" : "✗ Not looking"}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Main Content Grid ── */}
      <div className="grid lg:grid-cols-3 gap-6">
        {/* ── Left Main ── */}
        <div className="lg:col-span-2 space-y-6">
          {/* About */}
          <div className="card p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-white flex items-center gap-2">
                <User className="h-4 w-4 text-slate-400" /> About
              </h2>
              <button className="btn-ghost text-xs text-slate-500"><Edit3 className="h-3.5 w-3.5" /></button>
            </div>
            <p className="text-sm text-slate-400 leading-relaxed">
              Senior full-stack engineer with 7+ years of experience building scalable web applications and distributed systems. 
              Passionate about clean architecture, developer experience, and remote-first collaboration. 
              Open to exciting opportunities in fintech, AI tooling, and developer infrastructure.
            </p>
          </div>

          {/* Skills */}
          <div className="card p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-white flex items-center gap-2">
                <Code2 className="h-4 w-4 text-slate-400" /> Skills
              </h2>
              <button className="btn-ghost text-xs text-slate-500 flex items-center gap-1">
                <Plus className="h-3.5 w-3.5" /> Add skill
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {MOCK_SKILLS.map((skill) => (
                <span key={skill} className="tag tag-primary cursor-default">{skill}</span>
              ))}
            </div>
          </div>

          {/* Experience */}
          <div className="card p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-semibold text-white flex items-center gap-2">
                <Briefcase className="h-4 w-4 text-slate-400" /> Experience
              </h2>
              <button className="btn-ghost text-xs text-slate-500 flex items-center gap-1">
                <Plus className="h-3.5 w-3.5" /> Add
              </button>
            </div>
            <div className="relative space-y-6">
              {/* Timeline */}
              <div className="absolute left-3.5 top-0 bottom-0 w-px bg-gradient-to-b from-cyan-500/30 to-transparent" />
              {MOCK_EXPERIENCE.map((exp, i) => (
                <div key={i} className="relative pl-10">
                  <div className="absolute left-0 top-1 h-7 w-7 rounded-lg bg-slate-800 border border-white/10 flex items-center justify-center">
                    <Briefcase className="h-3.5 w-3.5 text-slate-500" />
                  </div>
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h3 className="font-semibold text-white text-sm">{exp.role}</h3>
                        <p className="text-xs text-cyan-400 font-medium">{exp.company}</p>
                      </div>
                      <span className="text-[10px] text-slate-600 font-mono flex-shrink-0">{exp.period}</span>
                    </div>
                    <p className="text-xs text-slate-400 mt-2 leading-relaxed">{exp.description}</p>
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {exp.skills.map((s) => <span key={s} className="tag text-[10px]">{s}</span>)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Resume */}
          <div className="card p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-white flex items-center gap-2">
                <Award className="h-4 w-4 text-slate-400" /> Resume
              </h2>
            </div>
            <div className="border-2 border-dashed border-white/10 rounded-xl p-8 text-center hover:border-cyan-500/30 transition-colors cursor-pointer group">
              <Upload className="h-8 w-8 text-slate-600 group-hover:text-cyan-400 mx-auto mb-3 transition-colors" />
              <p className="text-sm text-slate-400 mb-1">Upload your resume (PDF)</p>
              <p className="text-xs text-slate-600">AI will extract your skills and generate a professional summary</p>
              <button className="btn-secondary text-xs mt-4 inline-flex">
                <Upload className="h-3.5 w-3.5" /> Choose file
              </button>
            </div>
          </div>
        </div>

        {/* ── Right Sidebar ── */}
        <div className="space-y-6">
          {/* AI Score */}
          <div className="card p-6">
            <h2 className="font-semibold text-white flex items-center gap-2 mb-5">
              <Sparkles className="h-4 w-4 text-cyan-400" />
              AI Profile Score
            </h2>
            {/* Big number */}
            <div className="text-center mb-5">
              <div className="text-5xl font-black gradient-text">82</div>
              <div className="text-xs text-slate-500 mt-1">out of 100</div>
              <div className="flex items-center justify-center gap-1 mt-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star key={i} className={`h-3.5 w-3.5 ${i < 4 ? "text-amber-400 fill-amber-400" : "text-slate-700"}`} />
                ))}
              </div>
            </div>
            <div className="space-y-3">
              {AI_SCORE_BREAKDOWN.map((item) => (
                <ScoreBar key={item.label} {...item} />
              ))}
            </div>
          </div>

          {/* GitHub card */}
          <div className="card p-5 space-y-3">
            <h2 className="font-semibold text-white text-sm flex items-center gap-2">
              <Github className="h-4 w-4" /> GitHub
            </h2>
            <div className="flex items-center gap-2 p-2.5 rounded-lg bg-white/[0.03] border border-white/5">
              <div className="h-7 w-7 rounded-full bg-slate-700 flex items-center justify-center">
                <Github className="h-3.5 w-3.5 text-slate-300" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-white">github.com/alex</p>
                <p className="text-[10px] text-slate-500">42 repos · 1.2k stars</p>
              </div>
              <ChevronRight className="h-3.5 w-3.5 text-slate-600" />
            </div>
          </div>

          {/* Certifications */}
          <div className="card p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-white text-sm flex items-center gap-2">
                <Award className="h-4 w-4 text-amber-400" /> Certifications
              </h2>
              <button className="btn-ghost p-1"><Plus className="h-3.5 w-3.5" /></button>
            </div>
            {[
              { name: "AWS Solutions Architect", issuer: "Amazon" },
              { name: "Kubernetes CKA", issuer: "CNCF" },
            ].map((cert) => (
              <div key={cert.name} className="flex items-center gap-2.5 p-2.5 rounded-lg bg-white/[0.03] border border-white/5">
                <CheckCircle2 className="h-4 w-4 text-emerald-400 flex-shrink-0" />
                <div>
                  <p className="text-xs font-medium text-white">{cert.name}</p>
                  <p className="text-[10px] text-slate-500">{cert.issuer}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Portfolio */}
          <div className="card p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-white text-sm flex items-center gap-2">
                <Code2 className="h-4 w-4 text-indigo-400" /> Portfolio
              </h2>
              <button className="btn-ghost p-1"><Plus className="h-3.5 w-3.5" /></button>
            </div>
            {[
              { name: "WorkMesh AI", url: "github.com/alex/workmesh", desc: "AI marketplace" },
              { name: "OSS DB Client", url: "github.com/alex/db-client", desc: "TypeScript library" },
            ].map((proj) => (
              <a key={proj.name} href="#" className="flex items-start gap-2.5 p-2.5 rounded-lg bg-white/[0.03] border border-white/5 hover:border-cyan-500/25 transition-colors">
                <div className="h-6 w-6 rounded bg-indigo-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Code2 className="h-3 w-3 text-indigo-400" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-medium text-white truncate">{proj.name}</p>
                  <p className="text-[10px] text-slate-500">{proj.desc}</p>
                </div>
                <ExternalLink className="h-3 w-3 text-slate-600 flex-shrink-0 mt-0.5" />
              </a>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
