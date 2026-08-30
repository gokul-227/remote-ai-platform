"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Check, ChevronLeft, ChevronRight, Briefcase, Sparkles,
  DollarSign, MapPin, Building2, Eye,
} from "lucide-react";
import { useCreateJob } from "@/hooks/useCreateJob";
import { Button } from "@/components/ui/Button";
import { Input, Textarea, Select } from "@/components/ui/Input";
import { RequireRole } from "@/components/RequireRole";
import { cn } from "@/lib/cn";

const STEPS = ["Role basics", "Description", "Requirements", "Compensation", "Review & Publish"];

const SUGGESTED_SKILLS = [
  "React", "TypeScript", "Node.js", "Python", "FastAPI", "Go",
  "Rust", "PostgreSQL", "AWS", "Docker", "Kubernetes", "GraphQL", "Next.js",
];

const JOB_TEMPLATES: Record<string, { title: string; description: string; skills: string; experience: string }> = {
  frontend: {
    title: "Senior Full-Stack / Frontend Engineer (React & Next.js)",
    description: "We are seeking an experienced Frontend / Full-Stack Engineer to architect and build mission-critical remote web applications. You will collaborate directly with product and design teams to deliver high-performance, accessible, and responsive user interfaces.",
    skills: "React, TypeScript, Next.js, Tailwind CSS, GraphQL",
    experience: "senior",
  },
  backend: {
    title: "Staff Backend Distributed Systems Engineer (Python / Go)",
    description: "We are looking for a Staff Backend Engineer to design scalable microservices, robust API gateways, and distributed data pipelines. You will lead technical architecture, ensure 99.99% uptime, and mentor team members.",
    skills: "Python, FastAPI, Go, PostgreSQL, Redis, Docker, Kubernetes",
    experience: "senior",
  },
  devops: {
    title: "Cloud Infrastructure & DevOps Engineer (AWS & Terraform)",
    description: "Join our platform team to manage multi-region AWS cloud infrastructure, automate CI/CD release pipelines, and enhance zero-trust security postures.",
    skills: "AWS, Terraform, Kubernetes, Docker, GitHub Actions, Linux",
    experience: "mid",
  },
};

export default function NewJobPage() {
  return (
    <RequireRole roles={["COMPANY", "ADMIN"]}>
      <NewJobWizard />
    </RequireRole>
  );
}

function NewJobWizard() {
  const router = useRouter();
  const createJob = useCreateJob();
  const [step, setStep] = useState(0);
  const [showPreview, setShowPreview] = useState(false);
  const [form, setForm] = useState({
    title: "",
    description: "",
    job_type: "full-time",
    experience_level: "mid",
    skills: "",
    budget_min: "120000",
    budget_max: "160000",
    currency: "USD",
    timeline: "Ongoing",
    remote_preference: "100% Remote",
    location: "Worldwide (Remote)",
  });

  const update = (key: keyof typeof form, value: string) =>
    setForm((current) => ({ ...current, [key]: value }));

  const applyTemplate = (key: string) => {
    const template = JOB_TEMPLATES[key];
    if (template) {
      setForm((prev) => ({
        ...prev,
        title: template.title,
        description: template.description,
        skills: template.skills,
        experience_level: template.experience,
      }));
    }
  };

  const toggleSkill = (skill: string) => {
    const current = form.skills.split(",").map((s) => s.trim()).filter(Boolean);
    const updated = current.includes(skill)
      ? current.filter((s) => s !== skill)
      : [...current, skill];
    update("skills", updated.join(", "));
  };

  const canAdvance = [
    !!form.title.trim(),
    !!form.description.trim(),
    true,
    true,
    true,
  ];

  async function submit(event: FormEvent) {
    event.preventDefault();
    const job = await createJob.mutateAsync({
      title: form.title.trim(),
      description: form.description.trim(),
      job_type: form.job_type,
      experience_level: form.experience_level,
      skills: form.skills.split(",").map((skill) => skill.trim()).filter(Boolean),
      salary_min: form.budget_min ? Number(form.budget_min) : undefined,
      salary_max: form.budget_max ? Number(form.budget_max) : undefined,
      currency: form.currency,
      location: form.location,
      is_remote: true,
    });
    router.push(`/jobs/${job.id}`);
  }

  const skillList = form.skills.split(",").map((s) => s.trim()).filter(Boolean);

  return (
    <div className="mx-auto max-w-4xl space-y-6 py-6 px-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white flex items-center gap-2">
            <Briefcase className="h-6 w-6 text-[#B54A2C]" /> Post Engineering Position
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Structured job posting wizard with AI candidate matching and instant remote marketplace syndication.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            icon={<Eye className="h-4 w-4" />}
            onClick={() => setShowPreview(!showPreview)}
          >
            {showPreview ? "Hide Preview" : "Live Preview"}
          </Button>
        </div>
      </div>

      {/* Step indicator */}
      <div className="card-enterprise p-4">
        <div className="flex items-center gap-1">
          {STEPS.map((label, i) => (
            <div key={label} className="flex items-center flex-1 last:flex-none">
              <button
                type="button"
                onClick={() => i < step && setStep(i)}
                className="flex items-center gap-2 shrink-0 group text-left"
              >
                <div
                  className={cn(
                    "h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold border shrink-0 transition-colors",
                    step > i
                      ? "bg-[#B54A2C] text-white border-[#B54A2C]"
                      : step === i
                      ? "border-[#B54A2C] bg-blue-50 text-[#B54A2C] dark:bg-blue-950/40"
                      : "border-slate-300 text-slate-400"
                  )}
                >
                  {step > i ? <Check className="h-3.5 w-3.5" /> : i + 1}
                </div>
                <span
                  className={cn(
                    "text-xs font-semibold hidden md:inline",
                    step === i ? "text-slate-900 dark:text-white" : "text-slate-400"
                  )}
                >
                  {label}
                </span>
              </button>
              {i < STEPS.length - 1 && (
                <div
                  className={cn(
                    "h-0.5 flex-1 mx-2 transition-colors",
                    step > i ? "bg-[#B54A2C]" : "bg-slate-200 dark:bg-slate-700"
                  )}
                />
              )}
            </div>
          ))}
        </div>
      </div>

      <div className={cn("grid gap-6", showPreview ? "lg:grid-cols-12" : "grid-cols-1")}>
        {/* Wizard Form */}
        <div className={cn(showPreview ? "lg:col-span-7" : "max-w-2xl mx-auto w-full")}>
          <form onSubmit={submit} className="card-enterprise p-6 space-y-5">
            {/* Quick Template Selector */}
            {step === 0 && (
              <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700 space-y-2">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                  <Sparkles className="h-3 w-3 text-[#B54A2C]" /> Quick Start Role Templates:
                </span>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => applyTemplate("frontend")}
                    className="text-xs bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 px-2.5 py-1 rounded-lg hover:border-[#B54A2C] font-medium transition-colors"
                  >
                    ⚡ Full-Stack React
                  </button>
                  <button
                    type="button"
                    onClick={() => applyTemplate("backend")}
                    className="text-xs bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 px-2.5 py-1 rounded-lg hover:border-[#B54A2C] font-medium transition-colors"
                  >
                    ⚡ Python / Go Backend
                  </button>
                  <button
                    type="button"
                    onClick={() => applyTemplate("devops")}
                    className="text-xs bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 px-2.5 py-1 rounded-lg hover:border-[#B54A2C] font-medium transition-colors"
                  >
                    ⚡ AWS Cloud / DevOps
                  </button>
                </div>
              </div>
            )}

            {/* STEP 0: Role Basics */}
            {step === 0 && (
              <div className="space-y-4">
                <Input
                  label="Position Title"
                  required
                  value={form.title}
                  onChange={(e) => update("title", e.target.value)}
                  placeholder="e.g. Senior Distributed Systems Engineer"
                />

                <div className="grid gap-4 sm:grid-cols-2">
                  <Select
                    label="Employment Type"
                    value={form.job_type}
                    onChange={(e) => update("job_type", e.target.value)}
                  >
                    <option value="full-time">Full-time</option>
                    <option value="contract">Contract</option>
                    <option value="freelance">Freelance</option>
                    <option value="part-time">Part-time</option>
                  </Select>

                  <Select
                    label="Experience Level"
                    value={form.experience_level}
                    onChange={(e) => update("experience_level", e.target.value)}
                  >
                    <option value="junior">Junior (0–2 yrs)</option>
                    <option value="mid">Mid-level (2–5 yrs)</option>
                    <option value="senior">Senior (5–8 yrs)</option>
                    <option value="lead">Lead / Principal (8+ yrs)</option>
                  </Select>
                </div>

                <Input
                  label="Location / Region Preference"
                  value={form.location}
                  onChange={(e) => update("location", e.target.value)}
                  placeholder="e.g. Worldwide, US/EU Timezones, APAC"
                />
              </div>
            )}

            {/* STEP 1: Description */}
            {step === 1 && (
              <div className="space-y-4">
                <Textarea
                  label="Role Description & Outcomes"
                  required
                  rows={9}
                  value={form.description}
                  onChange={(e) => update("description", e.target.value)}
                  placeholder="Describe the key responsibilities, deliverables, team context, and expected impact..."
                />
                <p className="text-xs text-slate-400">
                  Tip: Clearly specifying deliverables increases AI match precision for qualified applicants.
                </p>
              </div>
            )}

            {/* STEP 2: Requirements & Skills */}
            {step === 2 && (
              <div className="space-y-4">
                <Input
                  label="Required Skills (Comma separated)"
                  value={form.skills}
                  onChange={(e) => update("skills", e.target.value)}
                  placeholder="e.g. React, TypeScript, Python, PostgreSQL"
                />

                <div className="space-y-2">
                  <span className="text-xs font-semibold text-slate-600 block">Suggested Technology Tags:</span>
                  <div className="flex flex-wrap gap-1.5">
                    {SUGGESTED_SKILLS.map((skill) => {
                      const selected = skillList.includes(skill);
                      return (
                        <button
                          key={skill}
                          type="button"
                          onClick={() => toggleSkill(skill)}
                          className={cn(
                            "text-xs px-2.5 py-1 rounded-md font-medium transition-all",
                            selected
                              ? "bg-[#B54A2C] text-white"
                              : "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200"
                          )}
                        >
                          {selected ? `✓ ${skill}` : `+ ${skill}`}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* STEP 3: Compensation & Budget */}
            {step === 3 && (
              <div className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-3">
                  <Input
                    label="Minimum Annual Salary / Budget ($)"
                    type="number"
                    min={0}
                    step={1000}
                    value={form.budget_min}
                    onChange={(e) => update("budget_min", e.target.value)}
                  />
                  <Input
                    label="Maximum Annual Salary / Budget ($)"
                    type="number"
                    min={0}
                    step={1000}
                    value={form.budget_max}
                    onChange={(e) => update("budget_max", e.target.value)}
                  />
                  <Input
                    label="Currency"
                    value={form.currency}
                    onChange={(e) => update("currency", e.target.value)}
                    maxLength={3}
                    className="uppercase font-mono"
                  />
                </div>
              </div>
            )}

            {/* STEP 4: Review */}
            {step === 4 && (
              <div className="space-y-4">
                <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="badge-ent badge-ent-brand uppercase text-[10px]">{form.job_type}</span>
                    <span className="text-xs font-semibold text-emerald-600">
                      ${Number(form.budget_min || 0).toLocaleString()} – ${Number(form.budget_max || 0).toLocaleString()} {form.currency}
                    </span>
                  </div>
                  <h3 className="font-bold text-slate-900 dark:text-white text-base">{form.title || "Untitled Role"}</h3>
                  <p className="text-xs text-slate-600 dark:text-slate-300 line-clamp-3 leading-relaxed">
                    {form.description || "No description provided."}
                  </p>
                  {skillList.length > 0 && (
                    <div className="flex flex-wrap gap-1 pt-2 border-t border-slate-200 dark:border-slate-700">
                      {skillList.map((s) => (
                        <span key={s} className="badge-ent badge-ent-neutral text-[10px]">
                          {s}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Navigation Buttons */}
            <div className="flex items-center justify-between pt-4 border-t border-slate-100 dark:border-slate-800">
              {step > 0 ? (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  icon={<ChevronLeft className="h-4 w-4" />}
                  onClick={() => setStep((s) => s - 1)}
                >
                  Back
                </Button>
              ) : (
                <div />
              )}

              {step < STEPS.length - 1 ? (
                <Button
                  type="button"
                  size="sm"
                  disabled={!canAdvance[step]}
                  onClick={() => setStep((s) => s + 1)}
                >
                  Next Step <ChevronRight className="h-4 w-4 ml-1 inline" />
                </Button>
              ) : (
                <Button
                  type="submit"
                  size="sm"
                  loading={createJob.isPending}
                  disabled={!form.title.trim()}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  Publish Role to Marketplace
                </Button>
              )}
            </div>
          </form>
        </div>

        {/* Live Marketplace Preview Pane */}
        {showPreview && (
          <div className="lg:col-span-5 space-y-4">
            <div className="card-enterprise p-5 space-y-4 sticky top-6 border-[#B54A2C]/30 shadow-md">
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
                <span className="text-xs font-bold uppercase tracking-wider text-[#B54A2C] flex items-center gap-1.5">
                  <Eye className="h-3.5 w-3.5" /> Marketplace Live Card Preview
                </span>
                <span className="badge-ent badge-ent-brand text-[10px]">Live Render</span>
              </div>

              <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-700 space-y-3 bg-[var(--bg-surface)]">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <span className="badge-ent badge-ent-neutral uppercase font-mono text-[10px] mr-1.5">Direct</span>
                    <span className="badge-ent badge-ent-brand font-semibold">100% Remote</span>
                    <h4 className="font-bold text-slate-900 dark:text-white text-sm mt-1.5">{form.title || "Senior Software Engineer"}</h4>
                    <p className="text-xs text-[#B54A2C] font-semibold mt-0.5 flex items-center gap-1">
                      <Building2 className="h-3 w-3" /> Your Organization
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
                  <span className="flex items-center gap-1">
                    <MapPin className="h-3 w-3" /> {form.location || "Remote"}
                  </span>
                  {form.budget_min && (
                    <span className="font-semibold text-emerald-700 dark:text-emerald-400 flex items-center gap-0.5">
                      <DollarSign className="h-3 w-3" />
                      ${(Number(form.budget_min) / 1000).toFixed(0)}k–${(Number(form.budget_max || form.budget_min) / 1000).toFixed(0)}k
                    </span>
                  )}
                </div>

                {skillList.length > 0 && (
                  <div className="flex flex-wrap gap-1 pt-2 border-t border-slate-100 dark:border-slate-800">
                    {skillList.map((s) => (
                      <span key={s} className="badge-ent badge-ent-neutral text-[10px]">
                        {s}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
