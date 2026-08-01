"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Award, Briefcase, Code2, ExternalLink, Github, Linkedin, Loader2, MapPin, Sparkles, Upload, User } from "lucide-react";
import api from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useEngineerProfile } from "@/hooks/useEngineerProfile";
import { useProfileAssistant } from "@/hooks/useProfileAssistant";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

type Experience = { title: string; company: string; start_date: string; end_date?: string; description?: string; technologies?: string[] };
type Project = { title: string; description: string; url?: string; github_url?: string; technologies?: string[] };
type Profile = {
  headline?: string; bio?: string; location?: string; timezone?: string; availability?: string;
  remote_preference?: string; skills: string[]; experience: Experience[]; projects: Project[];
  github_url?: string; linkedin_url?: string; portfolio_url?: string; resume_url?: string;
  ai_summary?: string; matching_keywords: string[]; is_open_to_work?: boolean;
};

function CreateProfileForm() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ headline: "", primary_role: "", location: "", bio: "", skills: "", years_of_experience: "" });
  const createProfile = useMutation({
    mutationFn: () =>
      api.post("/engineers/me", {
        headline: form.headline || undefined,
        primary_role: form.primary_role || undefined,
        location: form.location || undefined,
        bio: form.bio || undefined,
        years_of_experience: form.years_of_experience ? Number(form.years_of_experience) : 0,
        skills: form.skills.split(",").map((s) => s.trim()).filter(Boolean),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["engineer-profile"] }),
  });
  const update = (key: keyof typeof form, value: string) => setForm((current) => ({ ...current, [key]: value }));

  return (
    <div className="card-enterprise mx-auto max-w-2xl p-8">
      <h1 className="text-xl font-bold text-slate-900">Create your engineer profile</h1>
      <p className="mt-1 text-sm text-slate-600">This is what companies and job matches will see.</p>
      <form
        onSubmit={(event) => { event.preventDefault(); createProfile.mutate(); }}
        className="mt-5 space-y-4"
      >
        <label className="block text-sm font-semibold text-slate-700">Headline<input value={form.headline} onChange={(e) => update("headline", e.target.value)} className="input-enterprise mt-1.5" placeholder="Senior Full-Stack Engineer" /></label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm font-semibold text-slate-700">Primary role<input value={form.primary_role} onChange={(e) => update("primary_role", e.target.value)} className="input-enterprise mt-1.5" placeholder="Backend Engineer" /></label>
          <label className="block text-sm font-semibold text-slate-700">Location<input value={form.location} onChange={(e) => update("location", e.target.value)} className="input-enterprise mt-1.5" placeholder="Remote — US/EU" /></label>
        </div>
        <label className="block text-sm font-semibold text-slate-700">Years of experience<input type="number" min={0} max={50} value={form.years_of_experience} onChange={(e) => update("years_of_experience", e.target.value)} className="input-enterprise mt-1.5" /></label>
        <label className="block text-sm font-semibold text-slate-700">Skills<input value={form.skills} onChange={(e) => update("skills", e.target.value)} className="input-enterprise mt-1.5" placeholder="React, Python, PostgreSQL" /></label>
        <label className="block text-sm font-semibold text-slate-700">Bio<textarea value={form.bio} onChange={(e) => update("bio", e.target.value)} className="input-enterprise mt-1.5 min-h-24" placeholder="A short summary of your background." /></label>
        {createProfile.isError && <p className="text-sm text-red-600">Unable to create your profile. Please try again.</p>}
        <button type="submit" disabled={createProfile.isPending} className="btn-primary-brand text-sm disabled:opacity-70">
          {createProfile.isPending ? "Creating…" : "Create profile"}
        </button>
      </form>
    </div>
  );
}

function EngineerProfileContent() {
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const viewId = searchParams.get("id");
  const viewingOther = !!viewId;

  const ownProfileQuery = useEngineerProfile<Profile>(!!user && !viewingOther);
  const otherProfileQuery = useQuery<Profile>({
    queryKey: ["engineer-profile", viewId],
    queryFn: () => api.get(`/engineers/${viewId}`).then((response) => response.data),
    enabled: viewingOther,
  });
  const profileQuery = viewingOther ? otherProfileQuery : ownProfileQuery;

  const [profileOverride, setProfileOverride] = useState<Profile | null>(null);
  const [score, setScore] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const profileAssistant = useProfileAssistant();

  useEffect(() => {
    if (!user || viewingOther) return;
    api.get("/matching/recommendations", { params: { limit: 1 } })
      .then((response) => setScore(response.data?.[0]?.overall_score ?? null))
      .catch(() => setScore(null));
  }, [user, viewingOther]);

  const profile = (viewingOther ? null : profileOverride) || profileQuery.data;
  const loading = profileQuery.isLoading;

  const uploadResume = async (file?: File) => {
    if (!file) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const response = await api.post("/engineers/me/resume", form, { headers: { "Content-Type": "multipart/form-data" } });
      setProfileOverride((current) => ({ ...(current || profileQuery.data), resume_url: response.data.resume_url } as Profile));
    } catch { setError("Resume upload failed. Please try again."); }
    finally { setUploading(false); }
  };

  if (loading) return <div className="flex min-h-[360px] items-center justify-center text-slate-500"><Loader2 className="mr-2 h-5 w-5 animate-spin" />Loading profile</div>;
  if (!viewingOther && user && profileQuery.error) return <CreateProfileForm />;
  if ((!viewingOther && !user) || !profile) return <div className="card-enterprise mx-auto max-w-2xl p-8 text-center"><User className="mx-auto mb-3 h-8 w-8 text-slate-400" /><h1 className="text-xl font-bold text-slate-900">Engineer profile</h1><p className="mt-2 text-sm text-slate-600">{error || (viewingOther ? "This profile could not be found." : "Sign in to view your profile.")}</p></div>;

  const displayName = viewingOther ? (profile.headline || "Engineer profile") : (user!.full_name || user!.email);
  const initials = displayName.split(" ").map((part) => part[0]).join("").toUpperCase();
  const profileScore = Math.round((profile.skills.length > 0 ? 50 : 0) + (profile.experience.length > 0 ? 25 : 0) + (profile.bio ? 15 : 0) + (profile.resume_url ? 10 : 0));

  return <div className="mx-auto max-w-5xl space-y-5 px-4 py-8">
    {error && <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{error}</div>}
    <section className="card-enterprise overflow-hidden">
      <div className="h-28 bg-slate-200" />
      <div className="px-6 pb-6">
        <div className="-mt-10 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div className="flex items-end gap-4"><div className="flex h-20 w-20 items-center justify-center rounded-2xl border-4 border-white bg-white text-2xl font-bold text-[#0A66C2] shadow-sm">{initials}</div><div><h1 className="text-2xl font-bold text-slate-900">{displayName}</h1><p className="text-sm text-slate-600">{profile.headline || "Engineer"} · {profile.remote_preference || "Remote"}</p></div></div>
        </div>
        <div className="mt-4 flex flex-wrap gap-4 text-sm text-slate-500">
          {profile.location && <span className="flex items-center gap-1.5"><MapPin className="h-4 w-4" />{profile.location}</span>}
          {profile.timezone && <span>{profile.timezone}</span>}
          {profile.github_url && <a className="flex items-center gap-1.5 hover:text-[#0A66C2]" href={profile.github_url} target="_blank" rel="noreferrer"><Github className="h-4 w-4" />GitHub</a>}
          {profile.linkedin_url && <a className="flex items-center gap-1.5 hover:text-[#0A66C2]" href={profile.linkedin_url} target="_blank" rel="noreferrer"><Linkedin className="h-4 w-4" />LinkedIn</a>}
          {profile.portfolio_url && <a className="flex items-center gap-1.5 hover:text-[#0A66C2]" href={profile.portfolio_url} target="_blank" rel="noreferrer"><ExternalLink className="h-4 w-4" />Portfolio</a>}
        </div>
        <p className="mt-3 text-xs font-medium text-slate-600">Availability: {profile.availability || (profile.is_open_to_work ? "Open to work" : "Not available")}</p>
      </div>
    </section>
    <div className="grid gap-5 lg:grid-cols-3"><main className="space-y-5 lg:col-span-2">
      <section className="card-enterprise p-6"><div className="mb-3 flex items-center justify-between gap-2"><h2 className="flex items-center gap-2 font-semibold"><User className="h-4 w-4 text-slate-400" />About</h2>{!viewingOther && <button onClick={() => profileAssistant.mutate()} disabled={profileAssistant.isPending} className="btn-subtle text-xs disabled:opacity-60"><Sparkles className="h-3.5 w-3.5" />{profileAssistant.isPending ? "Enhancing…" : "Enhance with AI"}</button>}</div><p className="text-sm leading-relaxed text-slate-600">{profile.bio || "No biography added yet."}</p>{profile.ai_summary && <p className="mt-3 border-t border-slate-100 pt-3 text-sm text-slate-600">{profile.ai_summary}</p>}{profileAssistant.isError && <p className="mt-2 text-xs text-red-600">AI enhancement failed. Please try again.</p>}</section>
      <section className="card-enterprise p-6"><h2 className="mb-4 flex items-center gap-2 font-semibold"><Code2 className="h-4 w-4 text-slate-400" />Skills</h2><div className="flex flex-wrap gap-2">{profile.skills.length ? profile.skills.map((skill) => <span key={skill} className="badge-ent badge-ent-neutral">{skill}</span>) : <span className="text-sm text-slate-500">No skills added yet.</span>}</div></section>
      <section className="card-enterprise p-6"><h2 className="mb-4 flex items-center gap-2 font-semibold"><Briefcase className="h-4 w-4 text-slate-400" />Experience</h2>{profile.experience.length ? profile.experience.map((item, index) => <article key={`${item.company}-${index}`} className="mb-4 border-b border-slate-100 pb-4 last:mb-0 last:border-0 last:pb-0"><h3 className="text-sm font-semibold">{item.title}</h3><p className="text-xs text-slate-500">{item.company} · {item.start_date} – {item.end_date || "Present"}</p>{item.description && <p className="mt-2 text-sm text-slate-600">{item.description}</p>}</article>) : <p className="text-sm text-slate-500">No experience added yet.</p>}</section>
      {!viewingOther && <section className="card-enterprise p-6"><h2 className="mb-4 flex items-center gap-2 font-semibold"><Award className="h-4 w-4 text-slate-400" />Resume</h2><input ref={fileInput} hidden type="file" accept=".pdf,.docx" onChange={(event) => uploadResume(event.target.files?.[0])} /><button onClick={() => fileInput.current?.click()} disabled={uploading} className="btn-secondary-brand text-sm"><Upload className="h-4 w-4" />{uploading ? "Uploading…" : profile.resume_url ? "Replace resume" : "Upload resume"}</button>{profile.resume_url && <a className="ml-3 text-sm text-[#0A66C2] hover:underline" href={profile.resume_url} target="_blank" rel="noreferrer">View resume</a>}</section>}
    </main><aside className="space-y-5">{!viewingOther && <><section className="card-enterprise p-6"><h2 className="mb-4 font-semibold">Profile readiness</h2><div className="text-4xl font-bold text-[#0A66C2]">{profileScore}<span className="text-base text-slate-500">/100</span></div><p className="mt-1 text-xs text-slate-500">Based on profile completeness</p></section><section className="card-enterprise p-6"><h2 className="mb-4 font-semibold">Top job match</h2><div className="text-4xl font-bold text-emerald-600">{score ?? "—"}<span className="text-base text-slate-500">/100</span></div><p className="mt-1 text-xs text-slate-500">From current recommendations</p></section></>}<section className="card-enterprise p-6"><h2 className="mb-3 font-semibold">Projects</h2>{profile.projects.length ? profile.projects.map((project) => <a key={project.title} href={project.url || project.github_url || "#"} className="mb-3 block text-sm hover:text-[#0A66C2]"><span className="font-medium">{project.title}</span><span className="mt-1 block text-xs text-slate-500">{project.description}</span></a>) : <p className="text-sm text-slate-500">No projects added yet.</p>}</section></aside></div>
  </div>;
}

export default function EngineerProfile() {
  return (
    <Suspense fallback={<div className="flex min-h-[360px] items-center justify-center text-slate-500"><Loader2 className="mr-2 h-5 w-5 animate-spin" />Loading profile</div>}>
      <EngineerProfileContent />
    </Suspense>
  );
}
