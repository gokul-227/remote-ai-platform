"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronLeft, ChevronRight, Briefcase } from "lucide-react";
import { useCreateJob } from "@/hooks/useCreateJob";
import { Button } from "@/components/ui/Button";
import { Input, Textarea, Select } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { RequireRole } from "@/components/RequireRole";
import { cn } from "@/lib/cn";

const STEPS = ["Role basics", "Description", "Requirements", "Compensation", "Review"];

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
  const [form, setForm] = useState({
    title: "", description: "", job_type: "project", experience_level: "mid",
    skills: "", budget_min: "", budget_max: "", currency: "USD", timeline: "",
    remote_preference: "Worldwide remote", location: "Remote",
  });
  const update = (key: keyof typeof form, value: string) => setForm((current) => ({ ...current, [key]: value }));

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
      ...form,
      skills: form.skills.split(",").map((skill) => skill.trim()).filter(Boolean),
      budget_min: form.budget_min ? Number(form.budget_min) : undefined,
      budget_max: form.budget_max ? Number(form.budget_max) : undefined,
    });
    router.push(`/jobs/${job.id}`);
  }

  const skillList = form.skills.split(",").map((s) => s.trim()).filter(Boolean);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2"><Briefcase className="h-5 w-5 text-[#0A66C2]" />Post a job or project</h1>
        <p className="text-sm text-slate-500 mt-1">Describe the outcome you need — we&rsquo;ll help candidates find you with a structured listing.</p>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-1">
        {STEPS.map((label, i) => (
          <div key={label} className="flex items-center flex-1 last:flex-none">
            <div className="flex items-center gap-2 shrink-0">
              <div
                className={cn(
                  "h-7 w-7 rounded-full flex items-center justify-center text-xs font-semibold border shrink-0",
                  step > i ? "bg-[#0A66C2] text-white border-[#0A66C2]" : step === i ? "border-[#0A66C2] text-[#0A66C2]" : "border-slate-300 text-slate-400"
                )}
              >
                {step > i ? <Check className="h-3.5 w-3.5" /> : i + 1}
              </div>
              <span className={cn("text-xs font-medium hidden sm:inline", step === i ? "text-slate-900" : "text-slate-400")}>{label}</span>
            </div>
            {i < STEPS.length - 1 && <div className={cn("h-px flex-1 mx-2", step > i ? "bg-[#0A66C2]" : "bg-slate-200")} />}
          </div>
        ))}
      </div>

      <form onSubmit={submit} className="card-enterprise p-6 space-y-5">
        {step === 0 && (
          <>
            <Input label="Job title" required value={form.title} onChange={(e) => update("title", e.target.value)} placeholder="Build a customer analytics platform" />
            <div className="grid gap-4 sm:grid-cols-2">
              <Select label="Type" value={form.job_type} onChange={(e) => update("job_type", e.target.value)}>
                <option value="full-time">Full time</option>
                <option value="contract">Contract</option>
                <option value="freelance">Freelance</option>
                <option value="project">Project</option>
              </Select>
              <Select label="Experience level" value={form.experience_level} onChange={(e) => update("experience_level", e.target.value)}>
                <option value="junior">Junior</option>
                <option value="mid">Mid-level</option>
                <option value="senior">Senior</option>
                <option value="lead">Lead</option>
              </Select>
            </div>
          </>
        )}

        {step === 1 && (
          <Textarea label="Description" required rows={10} value={form.description} onChange={(e) => update("description", e.target.value)} placeholder="Describe the problem, outcomes, responsibilities, and what a great candidate looks like." />
        )}

        {step === 2 && (
          <>
            <Input label="Required skills" hint="Comma-separated" value={form.skills} onChange={(e) => update("skills", e.target.value)} placeholder="React, Python, PostgreSQL" />
            {skillList.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {skillList.map((s) => <Badge key={s} tone="brand">{s}</Badge>)}
              </div>
            )}
          </>
        )}

        {step === 3 && (
          <>
            <div className="grid gap-4 sm:grid-cols-3">
              <Input label="Budget minimum" type="number" min={0} value={form.budget_min} onChange={(e) => update("budget_min", e.target.value)} />
              <Input label="Budget maximum" type="number" min={0} value={form.budget_max} onChange={(e) => update("budget_max", e.target.value)} />
              <Input label="Currency" value={form.currency} onChange={(e) => update("currency", e.target.value)} maxLength={3} className="uppercase" />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Input label="Timeline" value={form.timeline} onChange={(e) => update("timeline", e.target.value)} placeholder="8 weeks" />
              <Input label="Remote preference" value={form.remote_preference} onChange={(e) => update("remote_preference", e.target.value)} placeholder="Worldwide remote" />
            </div>
          </>
        )}

        {step === 4 && (
          <div className="space-y-4">
            <div>
              <h2 className="text-base font-bold text-slate-900">{form.title || "Untitled role"}</h2>
              <p className="text-xs text-slate-500 mt-1 capitalize">{form.job_type.replace("-", " ")} · {form.experience_level} · {form.remote_preference}</p>
            </div>
            <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-wrap">{form.description || "No description provided."}</p>
            {skillList.length > 0 && (
              <div className="flex flex-wrap gap-1.5">{skillList.map((s) => <Badge key={s} tone="neutral">{s}</Badge>)}</div>
            )}
            {(form.budget_min || form.budget_max) && (
              <p className="text-sm font-semibold text-emerald-700">
                {form.currency} {form.budget_min || "?"} – {form.budget_max || "?"} {form.timeline && `· ${form.timeline}`}
              </p>
            )}
            {createJob.isError && <p className="text-sm text-red-700">Unable to publish this job. Check your company profile and try again.</p>}
          </div>
        )}

        <div className="flex items-center justify-between pt-2 border-t border-slate-100">
          <Button type="button" variant="secondary" disabled={step === 0} icon={<ChevronLeft className="h-4 w-4" />} onClick={() => setStep((s) => Math.max(0, s - 1))}>
            Back
          </Button>
          {step < STEPS.length - 1 ? (
            <Button type="button" disabled={!canAdvance[step]} onClick={() => setStep((s) => Math.min(STEPS.length - 1, s + 1))}>
              Next <ChevronRight className="h-4 w-4" />
            </Button>
          ) : (
            <Button type="submit" loading={createJob.isPending}>Publish Job</Button>
          )}
        </div>
      </form>
    </div>
  );
}
