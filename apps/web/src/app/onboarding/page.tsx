"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api, { extractErrorMessage } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { RequireAuth } from "@/components/RequireAuth";
import { Btn, Card, Field, Ic, Loading, Page, cx, inputCls, textareaCls } from "@/components/rap/kit";
import type { CompanyProfile, MyEngineerProfile } from "@/types";

export default function OnboardingPage() {
  return <RequireAuth><Onboarding /></RequireAuth>;
}

/** GET that resolves to null on 404 (no profile yet) instead of retrying. */
function useMine<T>(path: string, key: string, enabled: boolean) {
  return useQuery<T | null>({
    queryKey: [key],
    enabled,
    retry: false,
    queryFn: async () => {
      try {
        return (await api.get<T>(path)).data;
      } catch (e) {
        if ((e as { response?: { status?: number } }).response?.status === 404) return null;
        throw e;
      }
    },
  });
}

function Onboarding() {
  const { user } = useAuth();
  const isCompany = user?.role === "COMPANY";
  const engineer = useMine<MyEngineerProfile>("/engineers/me", "engineer-profile", !isCompany);
  const company = useMine<CompanyProfile>("/companies/me", "company-profile", isCompany);
  const q = isCompany ? company : engineer;

  if (q.isLoading) return <Loading />;
  // A failed lookup still lets people build a profile from scratch.
  return isCompany
    ? <CompanySetup key="company" initial={company.data ?? null} />
    : <EngineerWizard key="engineer" initial={engineer.data ?? null} />;
}

/* ---------------------------------------------------------------- engineer */

const STEPS = ["Start", "Resume", "Profile", "Preferences", "Ready"] as const;
const AVAILABILITY = ["Available now", "In 2 weeks", "In 1 month", "Not available"];
const REMOTE = ["100% Remote", "Remote-first", "Hybrid", "Flexible"];

type EngForm = {
  headline: string; primary_role: string; location: string; skills: string; bio: string; years_of_experience: string;
  hourly_rate: string; timezone: string; availability: string; remote_preference: string;
};

const browserTz = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return ""; } };

function fromProfile(p: MyEngineerProfile | null): EngForm {
  return {
    headline: p?.headline ?? "",
    primary_role: p?.primary_role ?? "",
    location: p?.location ?? "",
    skills: (p?.skills ?? []).join(", "),
    bio: p?.bio ?? "",
    years_of_experience: String(p?.years_of_experience ?? ""),
    hourly_rate: p?.hourly_rate != null ? String(p.hourly_rate) : "",
    timezone: p?.timezone ?? browserTz(),
    availability: p?.availability ?? "Available now",
    remote_preference: p?.remote_preference ?? "100% Remote",
  };
}

function EngineerWizard({ initial }: { initial: MyEngineerProfile | null }) {
  const router = useRouter();
  const client = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState(initial ? 2 : 0);
  const [data, setData] = useState<EngForm>(() => fromProfile(initial));
  const [error, setError] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [imported, setImported] = useState(false);
  const update = (k: keyof EngForm, v: string) => setData((d) => ({ ...d, [k]: v }));

  const payload = () => ({
    headline: data.headline.trim() || undefined,
    primary_role: data.primary_role.trim() || undefined,
    location: data.location.trim() || undefined,
    bio: data.bio.trim() || undefined,
    skills: data.skills.split(",").map((s) => s.trim()).filter(Boolean),
    years_of_experience: Math.min(50, Math.max(0, Number(data.years_of_experience) || 0)),
    hourly_rate: data.hourly_rate ? Number(data.hourly_rate) : undefined,
    timezone: data.timezone.trim() || undefined,
    availability: data.availability,
    remote_preference: data.remote_preference,
    is_open_to_work: data.availability !== "Not available",
  });

  const importResume = useMutation({
    mutationFn: async (f: File) => {
      // Upload attaches the resume to an existing profile, so make sure one
      // exists first (POST /engineers/me is create-or-update).
      if (!initial) await api.post("/engineers/me", {});
      const form = new FormData();
      form.append("file", f);
      await api.post("/engineers/me/resume", form, { headers: { "Content-Type": "multipart/form-data" } });
      // The upload parses the resume inline and writes what it found onto the profile.
      return (await api.get<MyEngineerProfile>("/engineers/me")).data;
    },
    onSuccess: (p) => {
      const parsed = (p.parsed_resume_data ?? {}) as Record<string, unknown>;
      const str = (v: unknown) => (typeof v === "string" ? v : "");
      setData((d) => ({
        ...d,
        headline: p.headline || str(parsed.headline) || d.headline,
        primary_role: p.primary_role || str(parsed.primary_role) || d.primary_role,
        location: p.location || str(parsed.location) || d.location,
        bio: p.bio || str(parsed.bio) || d.bio,
        skills: p.skills?.length ? p.skills.join(", ") : d.skills,
        years_of_experience: p.years_of_experience ? String(p.years_of_experience) : typeof parsed.years_of_experience === "number" ? String(parsed.years_of_experience) : d.years_of_experience,
      }));
      setImported(true);
      setError("");
      void client.invalidateQueries({ queryKey: ["engineer-profile"] });
    },
    onError: (e) => setError(extractErrorMessage(e, "We couldn't read that file. You can still build your profile by hand.")),
  });

  const save = useMutation({
    mutationFn: async () => (await api.post("/engineers/me", payload())).data,
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["engineer-profile"] });
      void client.invalidateQueries({ queryKey: ["engineer-profile-exists"] });
      setStep(4);
    },
    onError: (e) => setError(extractErrorMessage(e, "We couldn't save your profile. Check your entries and try again.")),
  });

  const next = () => {
    if (step === 2 && (!data.headline.trim() || !data.skills.trim())) return setError("Add a headline and at least one skill to continue.");
    setError("");
    if (step === 3) return save.mutate();
    setStep(step + 1);
  };

  return (
    <Page title="Build your professional profile" sub="A few details help the right opportunities find you">
      <div className="mx-auto max-w-[900px]">
        <Card c="!p-6">
          <div className="mb-7 flex gap-2">
            {STEPS.map((label, i) => (
              <div key={label} className="flex-1">
                <div className={cx("mb-2 h-1 rounded-full", i <= step ? "bg-[#0866ff]" : "bg-slate-200")} />
                <span className="text-xs text-slate-500">{i + 1}. {label}</span>
              </div>
            ))}
          </div>

          {step === 0 && (
            <>
              <h2>Let’s get to know your work</h2>
              <p className="my-4 text-slate-500">Import a resume or build your profile by hand. You can review and edit every detail before sharing it.</p>
              <div className="grid gap-3 md:grid-cols-2">
                <button type="button" onClick={() => setStep(1)} className="rounded-xl border border-blue-200 bg-blue-50 p-6 text-left">
                  <Ic n="file" c="text-[#0866ff]" /><h3 className="mt-3">Start with your resume</h3><p className="mt-2 text-sm text-slate-500">PDF or DOCX, with a review step.</p>
                </button>
                <button type="button" onClick={() => setStep(2)} className="rounded-xl border border-slate-200 p-6 text-left">
                  <Ic n="edit" /><h3 className="mt-3">Build it myself</h3><p className="mt-2 text-sm text-slate-500">Add your skills and experience.</p>
                </button>
              </div>
            </>
          )}

          {step === 1 && (
            <>
              <h2>Import your resume</h2>
              <p className="my-3 text-sm text-slate-500">We read your resume with AI and pre-fill your profile. You review everything before it’s saved.</p>
              <label className="mt-4 block cursor-pointer rounded-xl border-2 border-dashed border-slate-300 p-8 text-center hover:border-[#0866ff]">
                <Ic n="file" s={32} c="mx-auto mb-3 text-[#0866ff]" />
                <span className="block font-semibold">Choose a PDF or DOCX</span>
                <span className="mt-1 block text-xs text-slate-500">Up to 10 MB</span>
                <input ref={fileRef} aria-label="Resume file" type="file" accept=".pdf,.docx" className="mt-4 max-w-full text-sm" onChange={(e) => { setFile(e.target.files?.[0] ?? null); setImported(false); }} />
              </label>
              {file && <p className="mt-3 text-sm">Selected: <b>{file.name}</b></p>}
              {imported && <p role="status" className="mt-3 rounded-lg bg-green-50 p-3 text-sm text-green-800">Resume imported. Review what we found on the next step.</p>}
              <Btn v="outline" c="mt-4" icon="spark" disabled={!file || imported} loading={importResume.isPending} onClick={() => file && importResume.mutate(file)}>
                {importResume.isPending ? "Reading your resume…" : "Import with AI"}
              </Btn>
            </>
          )}

          {step === 2 && (
            <>
              <h2>Review your profile</h2>
              <p className="my-3 text-sm text-slate-500">Describe the work you want to be known for.</p>
              <div className="space-y-4">
                <Field label="Professional headline"><input id="onboardingHeadline" className={inputCls} value={data.headline} onChange={(e) => update("headline", e.target.value)} placeholder="e.g. Senior data engineer building reliable platforms" /></Field>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Primary role"><input id="onboardingRole" className={inputCls} value={data.primary_role} onChange={(e) => update("primary_role", e.target.value)} placeholder="e.g. Data Engineer" /></Field>
                  <Field label="Years of experience"><input id="onboardingExp" type="number" min={0} max={50} className={inputCls} value={data.years_of_experience} onChange={(e) => update("years_of_experience", e.target.value)} /></Field>
                </div>
                <Field label="Location"><input id="onboardingLocation" className={inputCls} value={data.location} onChange={(e) => update("location", e.target.value)} placeholder="e.g. Berlin, Germany" /></Field>
                <Field label="Skills, separated by commas"><input id="onboardingSkills" className={inputCls} value={data.skills} onChange={(e) => update("skills", e.target.value)} placeholder="Python, SQL, AWS" /></Field>
                <Field label="About you"><textarea id="onboardingBio" rows={4} className={textareaCls} value={data.bio} onChange={(e) => update("bio", e.target.value)} /></Field>
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <h2>Your work preferences</h2>
              <div className="mt-4 space-y-4">
                <Field label="Hourly rate (USD)"><input id="onboardingRate" type="number" min={0} className={inputCls} value={data.hourly_rate} onChange={(e) => update("hourly_rate", e.target.value)} /></Field>
                <Field label="Timezone"><input id="onboardingTimezone" className={inputCls} value={data.timezone} onChange={(e) => update("timezone", e.target.value)} placeholder="Europe/Berlin" /></Field>
                <Field label="Availability"><select className={inputCls} value={data.availability} onChange={(e) => update("availability", e.target.value)}>{AVAILABILITY.map((v) => <option key={v}>{v}</option>)}</select></Field>
                <Field label="Remote preference"><select className={inputCls} value={data.remote_preference} onChange={(e) => update("remote_preference", e.target.value)}>{REMOTE.map((v) => <option key={v}>{v}</option>)}</select></Field>
              </div>
            </>
          )}

          {step === 4 && (
            <div className="py-8 text-center">
              <Ic n="check" s={40} c="mx-auto text-green-600" />
              <h2 className="mt-4">You’re ready to explore</h2>
              <p className="my-3 text-slate-500">Your profile is saved. We’ll use it to match you with roles — refine it any time.</p>
              <div className="flex flex-wrap justify-center gap-2">
                <Btn onClick={() => router.push("/engineer/dashboard")}>Go to my dashboard</Btn>
                <Btn v="gray" href="/engineer/recommendations">See my matches</Btn>
              </div>
            </div>
          )}

          {error && <p role="alert" className="mt-4 text-sm text-red-600">{error}</p>}

          {step > 0 && step < 4 && (
            <div className="mt-6 flex justify-between border-t border-slate-200 pt-4">
              <Btn v="gray" onClick={() => { setError(""); setStep(step - 1); }}>Back</Btn>
              <Btn loading={save.isPending} disabled={step === 1 && importResume.isPending} onClick={next}>
                {step === 1 ? (imported ? "Review profile" : "Skip and fill in myself") : step === 3 ? "Save profile" : "Continue"}
              </Btn>
            </div>
          )}
        </Card>
      </div>
    </Page>
  );
}

/* ----------------------------------------------------------------- company */

const SIZES = ["1-10", "11-50", "51-200", "201-500", "500+"];

function CompanySetup({ initial }: { initial: CompanyProfile | null }) {
  const router = useRouter();
  const client = useQueryClient();
  const [step, setStep] = useState(0);
  const [f, setF] = useState({
    name: initial?.name ?? "",
    industry: initial?.industry ?? "Software and AI",
    company_size: initial?.company_size ?? "11-50",
    location: initial?.location ?? "",
    website: initial?.website ?? "",
    description: initial?.description ?? "",
  });
  const [error, setError] = useState("");
  const set = (k: keyof typeof f, v: string) => setF((c) => ({ ...c, [k]: v }));

  const save = useMutation({
    mutationFn: async () => {
      const body = {
        name: f.name.trim(),
        industry: f.industry.trim() || undefined,
        company_size: f.company_size,
        location: f.location.trim() || undefined,
        website: f.website.trim() || undefined,
        description: f.description.trim() || undefined,
      };
      return (await (initial ? api.put("/companies/me", body) : api.post("/companies/me", body))).data;
    },
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["company-profile"] });
      void client.invalidateQueries({ queryKey: ["company-profile-exists"] });
      router.push("/company/dashboard");
    },
    onError: (e) => setError(extractErrorMessage(e, "We couldn't save your organization. Please try again.")),
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (step === 0 && !f.name.trim()) return setError("Enter your organization’s name.");
    if (step === 1 && f.website.trim() && !/^https?:\/\/\S+\.\S+/.test(f.website.trim())) return setError("Enter a full website address, starting with https://");
    setError("");
    if (step < 2) setStep(step + 1);
    else save.mutate();
  };

  const review: Array<[string, string]> = [["Organization", f.name], ["Industry", f.industry], ["Team size", f.company_size], ["Location", f.location || "Not set"], ["Website", f.website || "Not set"], ["About", f.description || "Not set"]];

  return (
    <Page title="Set up your organization" sub="Build a company profile that helps professionals understand your team.">
      <div className="max-w-2xl">
        <p className="mb-6 text-sm text-[#0757d8]">Step {step + 1} of 3 · {["Organization identity", "Organization overview", "Review and confirm"][step]}</p>
        <form onSubmit={submit} noValidate>
          {step === 0 && (
            <>
              <label className="v2-field">Organization name<input id="compName" required value={f.name} onChange={(e) => set("name", e.target.value)} /></label>
              <label className="v2-field">Industry<input id="compIndustry" value={f.industry} onChange={(e) => set("industry", e.target.value)} /></label>
              <label className="v2-field">Organization size<select value={f.company_size} onChange={(e) => set("company_size", e.target.value)}>{SIZES.map((x) => <option key={x}>{x}</option>)}</select></label>
            </>
          )}
          {step === 1 && (
            <>
              <label className="v2-field">Headquarters<input id="compLocation" value={f.location} onChange={(e) => set("location", e.target.value)} placeholder="e.g. Remote-first, Berlin" /></label>
              <label className="v2-field">Website<input id="compWebsite" type="url" value={f.website} onChange={(e) => set("website", e.target.value)} placeholder="https://" /></label>
              <label className="v2-field">About your organization<textarea rows={5} value={f.description} onChange={(e) => set("description", e.target.value)} placeholder="What does your organization build, and what technologies do you use?" /></label>
            </>
          )}
          {step === 2 && (
            <dl className="v2-list">
              {review.map(([l, v]) => <div className="v2-row" key={l}><dt className="w-28 text-sm text-slate-500">{l}</dt><dd className="flex-1 break-words">{v}</dd></div>)}
            </dl>
          )}
          {error && <p role="alert" className="mt-4 text-sm text-red-600">{error}</p>}
          <div className="mt-6 flex items-center gap-4">
            {step > 0 && <button type="button" className="font-semibold text-[#0757d8]" onClick={() => { setError(""); setStep(step - 1); }}>Back</button>}
            <button type="submit" className="auth-submit" disabled={save.isPending}>{step === 2 ? (save.isPending ? "Saving…" : "Finish setup") : "Continue"}</button>
          </div>
        </form>
      </div>
    </Page>
  );
}
