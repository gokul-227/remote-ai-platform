"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  Award, Briefcase, Code2, ExternalLink, Github, GraduationCap, Languages as LanguagesIcon,
  Linkedin, Loader2, MapPin, Pencil, Share2, Sparkles, Upload, User,
} from "lucide-react";
import api from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useEngineerProfile } from "@/hooks/useEngineerProfile";
import { useProfileAssistant } from "@/hooks/useProfileAssistant";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { ProgressRing } from "@/components/ui/Progress";
import { ProfileHeaderSkeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { EditProfileDrawer } from "./EditProfileDrawer";

type Experience = { title: string; company: string; start_date: string; end_date?: string; description?: string; technologies?: string[] };
type Project = { title: string; description: string; url?: string; github_url?: string; technologies?: string[] };
type Education = { institution: string; degree: string; field_of_study?: string; start_year?: number; end_year?: number };
type Profile = {
  headline?: string; bio?: string; location?: string; timezone?: string; availability?: string;
  remote_preference?: string; skills: string[]; experience: Experience[]; projects: Project[];
  education?: Education[]; languages?: string[]; hourly_rate?: number | null; primary_role?: string;
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
      <form onSubmit={(event) => { event.preventDefault(); createProfile.mutate(); }} className="mt-5 space-y-4">
        <label className="block text-sm font-semibold text-slate-700">Headline<input value={form.headline} onChange={(e) => update("headline", e.target.value)} className="input-enterprise mt-1.5" placeholder="Senior Full-Stack Engineer" /></label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm font-semibold text-slate-700">Primary role<input value={form.primary_role} onChange={(e) => update("primary_role", e.target.value)} className="input-enterprise mt-1.5" placeholder="Backend Engineer" /></label>
          <label className="block text-sm font-semibold text-slate-700">Location<input value={form.location} onChange={(e) => update("location", e.target.value)} className="input-enterprise mt-1.5" placeholder="Remote — US/EU" /></label>
        </div>
        <label className="block text-sm font-semibold text-slate-700">Years of experience<input type="number" min={0} max={50} value={form.years_of_experience} onChange={(e) => update("years_of_experience", e.target.value)} className="input-enterprise mt-1.5" /></label>
        <label className="block text-sm font-semibold text-slate-700">Skills<input value={form.skills} onChange={(e) => update("skills", e.target.value)} className="input-enterprise mt-1.5" placeholder="React, Python, PostgreSQL" /></label>
        <label className="block text-sm font-semibold text-slate-700">Bio<textarea value={form.bio} onChange={(e) => update("bio", e.target.value)} className="input-enterprise mt-1.5 min-h-24" placeholder="A short summary of your background." /></label>
        {createProfile.isError && <p className="text-sm text-red-600">Unable to create your profile. Please try again.</p>}
        <Button type="submit" loading={createProfile.isPending}>Create profile</Button>
      </form>
    </div>
  );
}

function EngineerProfileContent() {
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const viewId = searchParams.get("id");
  const viewingOther = !!viewId;
  const toast = useToast();

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
  const [editOpen, setEditOpen] = useState(false);
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

  const shareProfile = () => {
    if (typeof window === "undefined" || !user) return;
    navigator.clipboard?.writeText(`${window.location.origin}/engineers/${user.id}`);
    toast.show("Profile link copied to clipboard", "success");
  };

  if (loading) return <ProfileHeaderSkeleton />;
  if (!viewingOther && user && profileQuery.error) return <CreateProfileForm />;
  if ((!viewingOther && !user) || !profile) return <div className="card-enterprise mx-auto max-w-2xl p-8 text-center"><User className="mx-auto mb-3 h-8 w-8 text-slate-400" /><h1 className="text-xl font-bold text-slate-900">Engineer profile</h1><p className="mt-2 text-sm text-slate-600">{error || (viewingOther ? "This profile could not be found." : "Sign in to view your profile.")}</p></div>;

  const displayName = viewingOther ? (profile.headline || "Engineer profile") : (user!.full_name || user!.email);
  const profileScore = Math.round((profile.skills.length > 0 ? 50 : 0) + (profile.experience.length > 0 ? 25 : 0) + (profile.bio ? 15 : 0) + (profile.resume_url ? 10 : 0));

  return (
    <div className="mx-auto max-w-5xl space-y-5 px-4 py-8">
      {!viewingOther && (
        <EditProfileDrawer
          open={editOpen}
          onClose={() => setEditOpen(false)}
          profile={{
            headline: profile.headline, primary_role: profile.primary_role, bio: profile.bio,
            location: profile.location, timezone: profile.timezone, availability: profile.availability,
            remote_preference: profile.remote_preference, skills: profile.skills, github_url: profile.github_url,
            linkedin_url: profile.linkedin_url, portfolio_url: profile.portfolio_url,
            hourly_rate: profile.hourly_rate, is_open_to_work: profile.is_open_to_work,
          }}
        />
      )}

      {error && <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{error}</div>}

      <section className="card-enterprise overflow-hidden">
        <div className="h-28 bg-gradient-to-r from-slate-200 to-slate-100" />
        <div className="px-6 pb-6">
          <div className="-mt-10 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
            <div className="flex items-end gap-4">
              <Avatar name={displayName} size="xl" className="border-4 border-white shadow-sm" />
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-2xl font-bold text-slate-900">{displayName}</h1>
                  {profile.is_open_to_work && <Badge tone="success">Open to work</Badge>}
                </div>
                <p className="text-sm text-slate-600">{profile.headline || profile.primary_role || "Engineer"} · {profile.remote_preference || "Remote"}</p>
              </div>
            </div>
            {!viewingOther && (
              <div className="flex items-center gap-2 shrink-0">
                <Button variant="secondary" size="sm" icon={<Share2 className="h-3.5 w-3.5" />} onClick={shareProfile}>Share</Button>
                <Button size="sm" icon={<Pencil className="h-3.5 w-3.5" />} onClick={() => setEditOpen(true)}>Edit profile</Button>
              </div>
            )}
          </div>
          <div className="mt-4 flex flex-wrap gap-4 text-sm text-slate-500">
            {profile.location && <span className="flex items-center gap-1.5"><MapPin className="h-4 w-4" />{profile.location}</span>}
            {profile.timezone && <span>{profile.timezone}</span>}
            {profile.hourly_rate ? <span className="font-medium text-emerald-700">${profile.hourly_rate}/hr</span> : null}
            {profile.github_url && <a className="flex items-center gap-1.5 hover:text-[#0A66C2]" href={profile.github_url} target="_blank" rel="noreferrer"><Github className="h-4 w-4" />GitHub</a>}
            {profile.linkedin_url && <a className="flex items-center gap-1.5 hover:text-[#0A66C2]" href={profile.linkedin_url} target="_blank" rel="noreferrer"><Linkedin className="h-4 w-4" />LinkedIn</a>}
            {profile.portfolio_url && <a className="flex items-center gap-1.5 hover:text-[#0A66C2]" href={profile.portfolio_url} target="_blank" rel="noreferrer"><ExternalLink className="h-4 w-4" />Portfolio</a>}
          </div>
          <p className="mt-3 text-xs font-medium text-slate-600">Availability: {profile.availability || (profile.is_open_to_work ? "Open to work" : "Not available")}</p>
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-3">
        <main className="space-y-5 lg:col-span-2">
          <section className="card-enterprise p-6">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="flex items-center gap-2 font-semibold"><User className="h-4 w-4 text-slate-400" />About</h2>
              {!viewingOther && (
                <Button variant="ghost" size="sm" icon={<Sparkles className="h-3.5 w-3.5" />} loading={profileAssistant.isPending} onClick={() => profileAssistant.mutate()}>
                  Enhance with AI
                </Button>
              )}
            </div>
            <p className="text-sm leading-relaxed text-slate-600">{profile.bio || "No biography added yet."}</p>
            {profile.ai_summary && <p className="mt-3 border-t border-slate-100 pt-3 text-sm text-slate-600">{profile.ai_summary}</p>}
            {profileAssistant.isError && <p className="mt-2 text-xs text-red-600">AI enhancement failed. Please try again.</p>}
          </section>

          <section className="card-enterprise p-6">
            <h2 className="mb-4 flex items-center gap-2 font-semibold"><Code2 className="h-4 w-4 text-slate-400" />Skills</h2>
            <div className="flex flex-wrap gap-2">
              {profile.skills.length ? profile.skills.map((skill) => <Badge key={skill} tone="neutral">{skill}</Badge>) : <span className="text-sm text-slate-500">No skills added yet.</span>}
            </div>
          </section>

          <section className="card-enterprise p-6">
            <h2 className="mb-4 flex items-center gap-2 font-semibold"><Briefcase className="h-4 w-4 text-slate-400" />Experience</h2>
            {profile.experience.length ? profile.experience.map((item, index) => (
              <article key={`${item.company}-${index}`} className="mb-4 border-b border-slate-100 pb-4 last:mb-0 last:border-0 last:pb-0">
                <h3 className="text-sm font-semibold">{item.title}</h3>
                <p className="text-xs text-slate-500">{item.company} · {item.start_date} – {item.end_date || "Present"}</p>
                {item.description && <p className="mt-2 text-sm text-slate-600">{item.description}</p>}
              </article>
            )) : <p className="text-sm text-slate-500">No experience added yet.</p>}
          </section>

          <section className="card-enterprise p-6">
            <h2 className="mb-4 flex items-center gap-2 font-semibold"><GraduationCap className="h-4 w-4 text-slate-400" />Education</h2>
            {profile.education?.length ? profile.education.map((edu, i) => (
              <article key={`${edu.institution}-${i}`} className="mb-3 last:mb-0">
                <h3 className="text-sm font-semibold">{edu.degree}{edu.field_of_study ? `, ${edu.field_of_study}` : ""}</h3>
                <p className="text-xs text-slate-500">{edu.institution} {edu.start_year ? `· ${edu.start_year}–${edu.end_year || "Present"}` : ""}</p>
              </article>
            )) : <p className="text-sm text-slate-500">No education added yet.</p>}
          </section>

          {!viewingOther && (
            <section className="card-enterprise p-6">
              <h2 className="mb-4 flex items-center gap-2 font-semibold"><Award className="h-4 w-4 text-slate-400" />Resume</h2>
              <input ref={fileInput} hidden type="file" accept=".pdf,.docx" onChange={(event) => uploadResume(event.target.files?.[0])} />
              <Button variant="secondary" size="sm" icon={<Upload className="h-4 w-4" />} loading={uploading} onClick={() => fileInput.current?.click()}>
                {profile.resume_url ? "Replace resume" : "Upload resume"}
              </Button>
              {profile.resume_url && <a className="ml-3 text-sm text-[#0A66C2] hover:underline" href={profile.resume_url} target="_blank" rel="noreferrer">View resume</a>}
            </section>
          )}
        </main>

        <aside className="space-y-5">
          {!viewingOther && (
            <>
              <section className="card-enterprise p-6 flex items-center gap-4">
                <ProgressRing value={profileScore} size={64} />
                <div>
                  <h2 className="font-semibold text-sm">Profile readiness</h2>
                  <p className="mt-1 text-xs text-slate-500">Based on profile completeness</p>
                </div>
              </section>
              <section className="card-enterprise p-6">
                <h2 className="mb-4 font-semibold">Top job match</h2>
                <div className="text-4xl font-bold text-emerald-600">{score ?? "—"}<span className="text-base text-slate-500">/100</span></div>
                <p className="mt-1 text-xs text-slate-500">From current recommendations</p>
              </section>
            </>
          )}
          {profile.languages && profile.languages.length > 0 && (
            <section className="card-enterprise p-6">
              <h2 className="mb-3 flex items-center gap-2 font-semibold"><LanguagesIcon className="h-4 w-4 text-slate-400" />Languages</h2>
              <div className="flex flex-wrap gap-2">
                {profile.languages.map((lang) => <Badge key={lang} tone="neutral">{lang}</Badge>)}
              </div>
            </section>
          )}
          <section className="card-enterprise p-6">
            <h2 className="mb-3 font-semibold">Projects</h2>
            {profile.projects.length ? profile.projects.map((project) => (
              <a key={project.title} href={project.url || project.github_url || "#"} className="mb-3 block text-sm hover:text-[#0A66C2]">
                <span className="font-medium">{project.title}</span>
                <span className="mt-1 block text-xs text-slate-500">{project.description}</span>
              </a>
            )) : <p className="text-sm text-slate-500">No projects added yet.</p>}
          </section>
        </aside>
      </div>
    </div>
  );
}

export default function EngineerProfile() {
  return (
    <Suspense fallback={<div className="flex min-h-[360px] items-center justify-center text-slate-500"><Loader2 className="mr-2 h-5 w-5 animate-spin" />Loading profile</div>}>
      <EngineerProfileContent />
    </Suspense>
  );
}
