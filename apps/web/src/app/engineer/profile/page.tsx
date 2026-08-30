"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  Award, Briefcase, Code2, ExternalLink, Github, GraduationCap, Languages as LanguagesIcon,
  Linkedin, Loader2, MapPin, Pencil, Share2, Sparkles, Upload, User,
  CheckCircle2, Clock, TrendingUp, Target, Globe,
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
import { EmptyState } from "@/components/ui/EmptyState";
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
    <div className="card-enterprise mx-auto max-w-2xl p-8 space-y-6">
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/40 dark:to-indigo-950/40 border border-blue-200 dark:border-blue-800 rounded-xl p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
            <Sparkles className="h-4 w-4 text-[#B54A2C]" /> Auto-build with AI Resume Import
          </h2>
          <p className="text-xs text-slate-600">
            Upload your PDF resume to extract skills, experience, and headline automatically.
          </p>
        </div>
        <Button size="sm" onClick={() => (window.location.href = "/onboarding")} icon={<Sparkles className="h-3.5 w-3.5" />}>
          Start AI Setup
        </Button>
      </div>

      <div>
        <h1 className="text-xl font-bold text-slate-900">Create your professional profile</h1>
        <p className="mt-1 text-sm text-slate-600">Or enter your professional details manually below.</p>
      </div>

      <form onSubmit={(event) => { event.preventDefault(); createProfile.mutate(); }} className="space-y-4">
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

/* Score logic: 0-100 across bio, skills, exp, projects, resume, rate */
function computeProfileScore(profile: Profile): number {
  let score = 0;
  if (profile.bio) score += 20;
  if (profile.skills.length >= 3) score += 20;
  else if (profile.skills.length > 0) score += 10;
  if (profile.experience.length >= 2) score += 25;
  else if (profile.experience.length === 1) score += 15;
  if (profile.projects.length >= 1) score += 15;
  if (profile.resume_url) score += 10;
  if (profile.hourly_rate) score += 10;
  return Math.min(score, 100);
}

function completionItems(profile: Profile) {
  return [
    { label: "Bio written", done: !!profile.bio, weight: 20 },
    { label: "3+ skills listed", done: profile.skills.length >= 3, weight: 20 },
    { label: "Work experience", done: profile.experience.length > 0, weight: 25 },
    { label: "Project portfolio", done: profile.projects.length > 0, weight: 15 },
    { label: "Resume uploaded", done: !!profile.resume_url, weight: 10 },
    { label: "Rate set", done: !!profile.hourly_rate, weight: 10 },
  ];
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
  const [topMatchScore, setTopMatchScore] = useState<number | null>(null);
  const [topMatchTitle, setTopMatchTitle] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const profileAssistant = useProfileAssistant();

  useEffect(() => {
    if (!user || viewingOther) return;
    api.get("/matching/recommendations", { params: { limit: 1 } })
      .then((response) => {
        const match = response.data?.[0];
        setTopMatchScore(match?.overall_score ?? null);
        setTopMatchTitle(match?.job_title ?? null);
      })
      .catch(() => {
        setTopMatchScore(null);
      });
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
  if ((!viewingOther && !user) || !profile) return <div className="card-enterprise mx-auto max-w-2xl p-8 text-center"><User className="mx-auto mb-3 h-8 w-8 text-slate-400" /><h1 className="text-xl font-bold text-slate-900">Professional profile</h1><p className="mt-2 text-sm text-slate-600">{error || (viewingOther ? "This profile could not be found." : "Sign in to view your profile.")}</p></div>;

  const displayName = viewingOther ? (profile.headline || "Professional profile") : (user!.full_name || user!.email);
  const profileScore = computeProfileScore(profile);
  const items = completionItems(profile);
  const remainingItems = items.filter((it) => !it.done);

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

      {/* Profile Hero */}
      <section className="card-enterprise overflow-hidden">
        {/* Dynamic banner — gradient based on role identity */}
        <div className="h-36 relative overflow-hidden bg-gradient-to-br from-[#B54A2C] via-[#C97B2E] to-[#7A3B4A]">
          <div className="absolute inset-0 opacity-20" style={{ backgroundImage: "radial-gradient(circle at 20% 50%, white 1px, transparent 1px), radial-gradient(circle at 80% 20%, white 1px, transparent 1px)", backgroundSize: "40px 40px" }} />
          <div className="absolute bottom-4 left-6 flex items-center gap-2">
            {profile.primary_role && (
              <span className="text-xs font-bold text-white/80 bg-white/10 backdrop-blur-sm border border-white/20 rounded-full px-3 py-1">
                {profile.primary_role}
              </span>
            )}
            {profile.is_open_to_work && (
              <span className="text-xs font-bold text-emerald-300 bg-emerald-900/40 backdrop-blur-sm border border-emerald-400/30 rounded-full px-3 py-1 flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" /> Open to Work
              </span>
            )}
          </div>
        </div>

        <div className="px-6 pb-6">
          <div className="-mt-12 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
            <div className="flex items-end gap-4">
              <Avatar name={displayName} size="xl" className="border-4 border-white shadow-md ring-2 ring-[var(--color-brand)]/20" />
              <div className="mb-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-2xl font-bold text-slate-900">{displayName}</h1>
                </div>
                <p className="text-sm text-slate-600 mt-0.5">{profile.headline || profile.primary_role || "Professional"} · {profile.remote_preference || "Remote"}</p>
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
            {profile.timezone && <span className="flex items-center gap-1.5"><Globe className="h-4 w-4" />{profile.timezone}</span>}
            {profile.hourly_rate ? <span className="font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-3 py-0.5 text-xs">${profile.hourly_rate}/hr</span> : null}
            {profile.github_url && <a className="flex items-center gap-1.5 hover:text-[#B54A2C] transition-colors" href={profile.github_url} target="_blank" rel="noreferrer"><Github className="h-4 w-4" />GitHub</a>}
            {profile.linkedin_url && <a className="flex items-center gap-1.5 hover:text-[#B54A2C] transition-colors" href={profile.linkedin_url} target="_blank" rel="noreferrer"><Linkedin className="h-4 w-4" />LinkedIn</a>}
            {profile.portfolio_url && <a className="flex items-center gap-1.5 hover:text-[#B54A2C] transition-colors" href={profile.portfolio_url} target="_blank" rel="noreferrer"><ExternalLink className="h-4 w-4" />Portfolio</a>}
          </div>
          <p className="mt-2 text-xs font-medium text-slate-500">Availability: {profile.availability || (profile.is_open_to_work ? "Open to work" : "Not specified")}</p>
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-3">
        <main className="space-y-5 lg:col-span-2">
          {/* About */}
          <section className="card-enterprise p-6">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="flex items-center gap-2 font-semibold text-slate-900"><User className="h-4 w-4 text-slate-400" />About</h2>
              {!viewingOther && (
                <Button variant="ghost" size="sm" icon={<Sparkles className="h-3.5 w-3.5" />} loading={profileAssistant.isPending} onClick={() => profileAssistant.mutate()}>
                  Enhance with AI
                </Button>
              )}
            </div>
            <p className="text-sm leading-relaxed text-slate-600">{profile.bio || "No biography added yet."}</p>
            {profile.ai_summary && (
              <div className="mt-4 p-3 rounded-xl bg-[var(--color-ai-soft)] border border-[var(--color-ai)]/20">
                <p className="text-xs font-semibold text-[var(--color-ai)] mb-1 flex items-center gap-1"><Sparkles className="h-3 w-3" />AI-Enhanced Summary</p>
                <p className="text-sm text-slate-700 leading-relaxed">{profile.ai_summary}</p>
              </div>
            )}
            {profileAssistant.isError && <p className="mt-2 text-xs text-red-600">AI enhancement failed. Please try again.</p>}
          </section>

          {/* Skills */}
          <section className="card-enterprise p-6">
            <h2 className="mb-4 flex items-center gap-2 font-semibold text-slate-900"><Code2 className="h-4 w-4 text-slate-400" />Skills</h2>
            {profile.skills.length ? (
              <div className="flex flex-wrap gap-2">
                {profile.skills.map((skill) => (
                  <Badge key={skill} tone="neutral">{skill}</Badge>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-500">No skills added yet.</p>
            )}
            {profile.matching_keywords?.length > 0 && (
              <div className="mt-4 pt-4 border-t border-slate-100">
                <p className="text-xs font-semibold text-slate-400 mb-2 flex items-center gap-1"><Target className="h-3 w-3" />AI Keywords</p>
                <div className="flex flex-wrap gap-1.5">
                  {profile.matching_keywords.slice(0, 8).map((kw) => (
                    <Badge key={kw} tone="brand">{kw}</Badge>
                  ))}
                </div>
              </div>
            )}
          </section>

          {/* Experience */}
          <section className="card-enterprise p-6">
            <h2 className="mb-4 flex items-center gap-2 font-semibold text-slate-900"><Briefcase className="h-4 w-4 text-slate-400" />Experience</h2>
            {profile.experience.length ? (
              <div className="space-y-5">
                {profile.experience.map((item, index) => (
                  <article key={`${item.company}-${index}`} className={`relative pl-4 ${index < profile.experience.length - 1 ? "pb-5 border-b border-slate-100" : ""}`}>
                    <div className="absolute left-0 top-1.5 h-2 w-2 rounded-full bg-[var(--color-brand)]" />
                    <h3 className="text-sm font-semibold text-slate-900">{item.title}</h3>
                    <p className="text-xs text-slate-500 mt-0.5">{item.company} · {item.start_date} – {item.end_date || "Present"}</p>
                    {item.description && <p className="mt-2 text-sm text-slate-600 leading-relaxed">{item.description}</p>}
                    {item.technologies && item.technologies.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {item.technologies.map((tech) => (
                          <Badge key={tech} tone="neutral">{tech}</Badge>
                        ))}
                      </div>
                    )}
                  </article>
                ))}
              </div>
            ) : (
              <EmptyState
                icon={Briefcase}
                title="No experience added yet"
                description={viewingOther ? "This person hasn't added any work experience." : "Add your work history so companies can see your background."}
                actionLabel={viewingOther ? undefined : "Add experience"}
                onAction={viewingOther ? undefined : () => setEditOpen(true)}
              />
            )}
          </section>

          {/* Projects */}
          {profile.projects.length > 0 && (
            <section className="card-enterprise p-6">
              <h2 className="mb-4 flex items-center gap-2 font-semibold text-slate-900"><Award className="h-4 w-4 text-slate-400" />Projects</h2>
              <div className="grid gap-4 sm:grid-cols-2">
                {profile.projects.map((project) => (
                  <a
                    key={project.title}
                    href={project.url || project.github_url || "#"}
                    target="_blank"
                    rel="noreferrer"
                    className="block p-4 rounded-xl border border-[var(--border-color)] hover:border-[var(--color-brand)] hover:shadow-[var(--shadow-sm)] transition-all group"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="text-sm font-semibold text-slate-900 group-hover:text-[var(--color-brand)] transition-colors">{project.title}</h3>
                      {project.github_url && <Github className="h-3.5 w-3.5 text-slate-400 shrink-0 mt-0.5" />}
                    </div>
                    <p className="text-xs text-slate-500 mt-1 line-clamp-2">{project.description}</p>
                    {project.technologies && project.technologies.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {project.technologies.slice(0, 4).map((tech) => (
                          <span key={tech} className="text-[10px] font-medium bg-slate-100 text-slate-600 rounded px-1.5 py-0.5">{tech}</span>
                        ))}
                      </div>
                    )}
                  </a>
                ))}
              </div>
            </section>
          )}

          {/* Education */}
          <section className="card-enterprise p-6">
            <h2 className="mb-4 flex items-center gap-2 font-semibold text-slate-900"><GraduationCap className="h-4 w-4 text-slate-400" />Education</h2>
            {profile.education?.length ? profile.education.map((edu, i) => (
              <article key={`${edu.institution}-${i}`} className="mb-3 last:mb-0">
                <h3 className="text-sm font-semibold text-slate-900">{edu.degree}{edu.field_of_study ? `, ${edu.field_of_study}` : ""}</h3>
                <p className="text-xs text-slate-500">{edu.institution} {edu.start_year ? `· ${edu.start_year}–${edu.end_year || "Present"}` : ""}</p>
              </article>
            )) : (
              <EmptyState
                icon={GraduationCap}
                title="No education added yet"
                description={viewingOther ? "This person hasn't added their education history." : "Add your education so companies can see your background."}
                actionLabel={viewingOther ? undefined : "Add education"}
                onAction={viewingOther ? undefined : () => setEditOpen(true)}
              />
            )}
          </section>

          {/* Resume */}
          {!viewingOther && (
            <section className="card-enterprise p-6">
              <h2 className="mb-4 flex items-center gap-2 font-semibold text-slate-900"><Upload className="h-4 w-4 text-slate-400" />Resume</h2>
              <input ref={fileInput} hidden type="file" accept=".pdf,.docx" onChange={(event) => uploadResume(event.target.files?.[0])} />
              <div className="flex items-center gap-3">
                <Button variant="secondary" size="sm" icon={<Upload className="h-4 w-4" />} loading={uploading} onClick={() => fileInput.current?.click()}>
                  {profile.resume_url ? "Replace resume" : "Upload resume"}
                </Button>
                {profile.resume_url && <a className="text-sm text-[#B54A2C] hover:underline flex items-center gap-1" href={profile.resume_url} target="_blank" rel="noreferrer"><ExternalLink className="h-3.5 w-3.5" />View resume</a>}
              </div>
            </section>
          )}
        </main>

        <aside className="space-y-5">
          {!viewingOther && (
            <>
              {/* Profile Score Card */}
              <section className="card-enterprise p-5">
                <div className="flex items-center gap-4">
                  <ProgressRing value={profileScore} size={64} />
                  <div>
                    <h2 className="font-semibold text-sm text-slate-900">Profile Readiness</h2>
                    <p className="mt-0.5 text-xs text-slate-500">{profileScore < 60 ? "Complete more sections" : profileScore < 90 ? "Looking strong!" : "Outstanding profile"}</p>
                  </div>
                </div>
                {remainingItems.length > 0 && (
                  <div className="mt-4 space-y-2">
                    <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">To improve</p>
                    {remainingItems.map((item) => (
                      <div key={item.label} className="flex items-center gap-2">
                        <Clock className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                        <span className="text-xs text-slate-600">{item.label}</span>
                        <span className="text-[10px] text-slate-400 ml-auto">+{item.weight}%</span>
                      </div>
                    ))}
                  </div>
                )}
                {remainingItems.length === 0 && (
                  <div className="mt-3 flex items-center gap-2 text-xs text-emerald-700">
                    <CheckCircle2 className="h-4 w-4" />
                    Profile fully complete!
                  </div>
                )}
              </section>

              {/* Top AI Match */}
              <section className="card-ai">
                <div className="flex items-center gap-2 mb-3">
                  <div className="h-7 w-7 rounded-lg bg-[var(--color-ai)]/10 flex items-center justify-center">
                    <Sparkles className="h-3.5 w-3.5 text-[var(--color-ai)]" />
                  </div>
                  <h2 className="font-semibold text-sm text-slate-900">AI Match Score</h2>
                </div>
                {topMatchScore !== null ? (
                  <>
                    <div className="flex items-end gap-1">
                      <span className="text-4xl font-black text-[var(--color-ai)]">{Math.round(topMatchScore)}</span>
                      <span className="text-base text-slate-400 mb-1">/100</span>
                    </div>
                    {topMatchTitle && <p className="text-xs text-slate-600 mt-1">Best match: <span className="font-semibold">{topMatchTitle}</span></p>}
                    <div className="mt-3">
                      <div className="w-full bg-slate-100 dark:bg-slate-700 h-2 rounded-full overflow-hidden">
                        <div className="h-full rounded-full bg-gradient-to-r from-[var(--color-ai)] to-[var(--color-brand)] transition-all duration-700" style={{ width: `${topMatchScore}%` }} />
                      </div>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-2">
                      {topMatchScore >= 80 ? "🎯 Excellent match — apply now" : topMatchScore >= 60 ? "✅ Good match — apply with confidence" : "📈 Building match — improve your profile"}
                    </p>
                  </>
                ) : (
                  <div className="text-sm text-slate-500 flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-slate-400" />
                    <span>Complete your profile to get AI match scores.</span>
                  </div>
                )}
              </section>
            </>
          )}

          {/* Languages */}
          {profile.languages && profile.languages.length > 0 && (
            <section className="card-enterprise p-5">
              <h2 className="mb-3 flex items-center gap-2 font-semibold text-sm text-slate-900"><LanguagesIcon className="h-4 w-4 text-slate-400" />Languages</h2>
              <div className="flex flex-wrap gap-2">
                {profile.languages.map((lang) => <Badge key={lang} tone="neutral">{lang}</Badge>)}
              </div>
            </section>
          )}
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
