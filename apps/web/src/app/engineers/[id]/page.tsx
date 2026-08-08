"use client";

import { use } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  MapPin, Clock, Briefcase, Code2, Github, Linkedin,
  ExternalLink, User, BookOpen, Star, ChevronLeft, Loader2,
  CheckCircle2, Calendar, Sparkles,
} from "lucide-react";
import api from "@/lib/api";

type ExperienceItem = {
  title: string;
  company: string;
  start_date: string;
  end_date?: string;
  is_current?: boolean;
  description?: string;
  technologies?: string[];
};

type ProjectItem = {
  title: string;
  description: string;
  url?: string;
  github_url?: string;
  technologies?: string[];
};

type EducationItem = {
  institution: string;
  degree: string;
  field_of_study?: string;
  start_year?: number;
  end_year?: number;
};

type EngineerProfile = {
  id: string;
  headline?: string;
  bio?: string;
  ai_summary?: string;
  location?: string;
  timezone?: string;
  availability?: string;
  remote_preference?: string;
  primary_role?: string;
  years_of_experience?: number;
  skills: string[];
  experience: ExperienceItem[];
  projects: ProjectItem[];
  education: EducationItem[];
  matching_keywords: string[];
  github_url?: string;
  linkedin_url?: string;
  portfolio_url?: string;
  resume_url?: string;
  is_open_to_work?: boolean;
  profile_score?: number;
};

function ScoreRing({ score }: { score: number }) {
  const clamped = Math.min(100, Math.max(0, score));
  const r = 32;
  const circumference = 2 * Math.PI * r;
  const offset = circumference - (clamped / 100) * circumference;
  const color = clamped >= 75 ? "#059669" : clamped >= 50 ? "#D97706" : "#0A66C2";
  const label = clamped >= 75 ? "Strong" : clamped >= 50 ? "Good" : "Building";

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative flex h-20 w-20 items-center justify-center">
        <svg className="absolute inset-0 -rotate-90" width="80" height="80" viewBox="0 0 80 80">
          <circle cx="40" cy="40" r={r} fill="none" stroke="#e5e7eb" strokeWidth="5" />
          <circle
            cx="40" cy="40" r={r} fill="none"
            stroke={color} strokeWidth="5"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            style={{ transition: "stroke-dashoffset 0.8s ease" }}
          />
        </svg>
        <div className="text-center">
          <span className="text-lg font-bold" style={{ color }}>{clamped}</span>
          <span className="block text-[10px] text-slate-400">/100</span>
        </div>
      </div>
      <span className="text-xs font-semibold" style={{ color }}>{label}</span>
    </div>
  );
}

function ExperienceTimeline({ items }: { items: ExperienceItem[] }) {
  if (!items.length) {
    return <p className="text-sm text-slate-500">No experience listed.</p>;
  }
  return (
    <ol className="relative space-y-0 border-l-2 border-slate-100 pl-5">
      {items.map((item, i) => (
        <li key={`${item.company}-${i}`} className="relative pb-6 last:pb-0">
          {/* Timeline dot */}
          <span className="absolute -left-[1.4rem] top-0.5 flex h-5 w-5 items-center justify-center rounded-full border-2 border-[#0A66C2] bg-white">
            <span className="h-2 w-2 rounded-full bg-[#0A66C2]" />
          </span>
          <div>
            <h3 className="text-sm font-semibold text-slate-900">{item.title}</h3>
            <p className="mt-0.5 text-xs text-slate-500">
              {item.company}
              <span className="mx-1.5 text-slate-300">·</span>
              {item.start_date} – {item.is_current ? "Present" : item.end_date || "Present"}
            </p>
            {item.description && (
              <p className="mt-2 text-sm leading-relaxed text-slate-600">{item.description}</p>
            )}
            {item.technologies && item.technologies.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {item.technologies.map((tech) => (
                  <span key={tech} className="badge-ent badge-ent-neutral">{tech}</span>
                ))}
              </div>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}

export default function PublicEngineerProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);

  const { data: profile, isLoading, isError } = useQuery<EngineerProfile>({
    queryKey: ["public-engineer-profile", id],
    queryFn: () => api.get(`/engineers/${id}`).then((r) => r.data),
    enabled: !!id,
  });

  if (isLoading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center gap-2 text-slate-500">
        <Loader2 className="h-5 w-5 animate-spin" /> Loading profile…
      </div>
    );
  }

  if (isError || !profile) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <User className="mx-auto mb-4 h-12 w-12 text-slate-300" />
        <h1 className="text-xl font-bold text-slate-900">Profile not found</h1>
        <p className="mt-2 text-sm text-slate-500">
          This engineer profile is unavailable or has been removed.
        </p>
        <Link href="/engineers" className="btn-primary-brand mt-6 inline-flex">
          <ChevronLeft className="h-4 w-4" /> Back to discovery
        </Link>
      </div>
    );
  }

  const initials = (profile.headline || profile.primary_role || "E")
    .split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2);
  const score = Math.round(profile.profile_score ?? 0);

  return (
    <div className="mx-auto max-w-5xl space-y-5 px-4 py-8">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-xs text-slate-500">
        <Link href="/engineers" className="hover:text-[#0A66C2] hover:underline">Engineers</Link>
        <span>/</span>
        <span className="text-slate-700">{profile.headline || profile.primary_role || "Profile"}</span>
      </nav>

      {/* Hero card */}
      <section className="card-enterprise overflow-hidden">
        {/* Cover banner */}
        <div className="h-28 bg-gradient-to-r from-blue-600 via-blue-500 to-sky-400" />
        <div className="px-6 pb-6">
          <div className="-mt-10 flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
            {/* Avatar + name */}
            <div className="flex items-end gap-4">
              <div className="flex h-20 w-20 items-center justify-center rounded-2xl border-4 border-white bg-gradient-to-br from-blue-500 to-blue-700 text-2xl font-bold text-white shadow-md">
                {initials}
              </div>
              <div className="pb-1">
                <h1 className="text-2xl font-bold text-slate-900">
                  {profile.headline || profile.primary_role || "Engineer"}
                </h1>
                <p className="text-sm text-slate-600">
                  {profile.primary_role && <span>{profile.primary_role}</span>}
                  {profile.remote_preference && (
                    <span className="mx-1.5 text-slate-300">·</span>
                  )}
                  {profile.remote_preference && (
                    <span>{profile.remote_preference}</span>
                  )}
                </p>
              </div>
            </div>
            {/* CTA */}
            <div className="flex flex-wrap gap-2 pb-1">
              {profile.github_url && (
                <a
                  href={profile.github_url}
                  target="_blank"
                  rel="noreferrer"
                  id="engineer-github-link"
                  className="btn-subtle flex items-center gap-1.5 text-xs"
                >
                  <Github className="h-3.5 w-3.5" /> GitHub
                </a>
              )}
              {profile.linkedin_url && (
                <a
                  href={profile.linkedin_url}
                  target="_blank"
                  rel="noreferrer"
                  id="engineer-linkedin-link"
                  className="btn-subtle flex items-center gap-1.5 text-xs"
                >
                  <Linkedin className="h-3.5 w-3.5" /> LinkedIn
                </a>
              )}
              {profile.portfolio_url && (
                <a
                  href={profile.portfolio_url}
                  target="_blank"
                  rel="noreferrer"
                  id="engineer-portfolio-link"
                  className="btn-secondary-brand flex items-center gap-1.5 text-xs"
                >
                  <ExternalLink className="h-3.5 w-3.5" /> Portfolio
                </a>
              )}
            </div>
          </div>

          {/* Meta row */}
          <div className="mt-4 flex flex-wrap items-center gap-4 text-sm text-slate-500">
            {profile.location && (
              <span className="flex items-center gap-1.5">
                <MapPin className="h-4 w-4 shrink-0" /> {profile.location}
              </span>
            )}
            {profile.timezone && (
              <span className="flex items-center gap-1.5">
                <Clock className="h-4 w-4 shrink-0" /> {profile.timezone}
              </span>
            )}
            {profile.years_of_experience != null && (
              <span className="flex items-center gap-1.5">
                <Briefcase className="h-4 w-4 shrink-0" /> {profile.years_of_experience}+ years
              </span>
            )}
            {profile.is_open_to_work && (
              <span className="badge-ent badge-ent-success flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3" /> Open to work
              </span>
            )}
          </div>
        </div>
      </section>

      {/* Main content */}
      <div className="grid gap-5 lg:grid-cols-3">
        <main className="space-y-5 lg:col-span-2">
          {/* About */}
          <section className="card-enterprise p-6">
            <h2 className="mb-3 flex items-center gap-2 font-semibold text-slate-900">
              <User className="h-4 w-4 text-slate-400" /> About
            </h2>
            {profile.bio && (
              <p className="text-sm leading-relaxed text-slate-600">{profile.bio}</p>
            )}
            {profile.ai_summary && (
              <div className="mt-4 rounded-xl border border-blue-100 bg-blue-50 p-4">
                <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-blue-700">
                  <Sparkles className="h-3.5 w-3.5" /> AI Summary
                </p>
                <p className="text-sm leading-relaxed text-slate-700">{profile.ai_summary}</p>
              </div>
            )}
            {!profile.bio && !profile.ai_summary && (
              <p className="text-sm text-slate-500">No biography provided.</p>
            )}
          </section>

          {/* Skills */}
          <section className="card-enterprise p-6">
            <h2 className="mb-4 flex items-center gap-2 font-semibold text-slate-900">
              <Code2 className="h-4 w-4 text-slate-400" /> Skills
            </h2>
            {profile.skills.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {profile.skills.map((skill) => (
                  <span key={skill} className="badge-ent badge-ent-neutral">{skill}</span>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-500">No skills listed.</p>
            )}
            {profile.matching_keywords.length > 0 && (
              <div className="mt-4 border-t border-slate-100 pt-4">
                <p className="mb-2 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  AI-matched keywords
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {profile.matching_keywords.map((kw) => (
                    <span key={kw} className="badge-ent badge-ent-brand">{kw}</span>
                  ))}
                </div>
              </div>
            )}
          </section>

          {/* Experience */}
          <section className="card-enterprise p-6">
            <h2 className="mb-5 flex items-center gap-2 font-semibold text-slate-900">
              <Briefcase className="h-4 w-4 text-slate-400" /> Experience
            </h2>
            <ExperienceTimeline items={profile.experience} />
          </section>

          {/* Education */}
          {profile.education.length > 0 && (
            <section className="card-enterprise p-6">
              <h2 className="mb-4 flex items-center gap-2 font-semibold text-slate-900">
                <BookOpen className="h-4 w-4 text-slate-400" /> Education
              </h2>
              <div className="space-y-4">
                {profile.education.map((edu, i) => (
                  <div key={`${edu.institution}-${i}`} className="flex items-start gap-3">
                    <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100">
                      <BookOpen className="h-4 w-4 text-slate-500" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{edu.degree}</p>
                      <p className="text-xs text-slate-500">
                        {edu.institution}
                        {edu.field_of_study && ` · ${edu.field_of_study}`}
                      </p>
                      {(edu.start_year || edu.end_year) && (
                        <p className="mt-0.5 flex items-center gap-1 text-xs text-slate-400">
                          <Calendar className="h-3 w-3" />
                          {edu.start_year} – {edu.end_year || "Present"}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Projects */}
          {profile.projects.length > 0 && (
            <section className="card-enterprise p-6">
              <h2 className="mb-4 flex items-center gap-2 font-semibold text-slate-900">
                <Star className="h-4 w-4 text-slate-400" /> Projects
              </h2>
              <div className="grid gap-3 sm:grid-cols-2">
                {profile.projects.map((project) => (
                  <a
                    key={project.title}
                    href={project.url || project.github_url || "#"}
                    target="_blank"
                    rel="noreferrer"
                    className="group rounded-xl border border-slate-100 p-4 transition-all hover:border-[#0A66C2] hover:shadow-sm"
                  >
                    <h3 className="text-sm font-semibold text-slate-900 group-hover:text-[#0A66C2]">
                      {project.title}
                    </h3>
                    <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-slate-500">
                      {project.description}
                    </p>
                    {project.technologies && project.technologies.length > 0 && (
                      <div className="mt-2.5 flex flex-wrap gap-1">
                        {project.technologies.slice(0, 4).map((tech) => (
                          <span key={tech} className="badge-ent badge-ent-neutral">{tech}</span>
                        ))}
                      </div>
                    )}
                  </a>
                ))}
              </div>
            </section>
          )}
        </main>

        {/* Sidebar */}
        <aside className="space-y-5">
          {/* Profile score */}
          <section className="card-enterprise p-5 text-center">
            <h2 className="mb-3 text-sm font-semibold text-slate-700">Profile Readiness</h2>
            <div className="flex justify-center">
              <ScoreRing score={score} />
            </div>
            <p className="mt-2 text-xs text-slate-500">
              Based on profile completeness
            </p>
          </section>

          {/* Quick facts */}
          <section className="card-enterprise p-5">
            <h2 className="mb-3 text-sm font-semibold text-slate-700">Quick Facts</h2>
            <dl className="space-y-2.5 text-xs">
              {[
                { label: "Role", value: profile.primary_role },
                { label: "Experience", value: profile.years_of_experience != null ? `${profile.years_of_experience} years` : undefined },
                { label: "Location", value: profile.location },
                { label: "Timezone", value: profile.timezone },
                { label: "Availability", value: profile.availability },
                { label: "Remote pref.", value: profile.remote_preference },
              ]
                .filter((item) => item.value)
                .map((item) => (
                  <div key={item.label} className="flex justify-between gap-3">
                    <dt className="text-slate-500">{item.label}</dt>
                    <dd className="font-semibold text-slate-800 text-right">{item.value}</dd>
                  </div>
                ))}
            </dl>
          </section>

          {/* Contact / links */}
          {(profile.github_url || profile.linkedin_url || profile.portfolio_url || profile.resume_url) && (
            <section className="card-enterprise p-5">
              <h2 className="mb-3 text-sm font-semibold text-slate-700">Links</h2>
              <div className="space-y-2">
                {profile.github_url && (
                  <a href={profile.github_url} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-xs text-slate-600 hover:text-[#0A66C2]">
                    <Github className="h-4 w-4 shrink-0" /> GitHub profile
                  </a>
                )}
                {profile.linkedin_url && (
                  <a href={profile.linkedin_url} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-xs text-slate-600 hover:text-[#0A66C2]">
                    <Linkedin className="h-4 w-4 shrink-0" /> LinkedIn
                  </a>
                )}
                {profile.portfolio_url && (
                  <a href={profile.portfolio_url} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-xs text-slate-600 hover:text-[#0A66C2]">
                    <ExternalLink className="h-4 w-4 shrink-0" /> Portfolio site
                  </a>
                )}
                {profile.resume_url && (
                  <a href={profile.resume_url} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-xs font-semibold text-[#0A66C2] hover:underline">
                    <ExternalLink className="h-4 w-4 shrink-0" /> Download resume
                  </a>
                )}
              </div>
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}
