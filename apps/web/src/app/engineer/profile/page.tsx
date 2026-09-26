"use client";

import Link from "next/link";
import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api, { extractErrorMessage } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { RequireRole } from "@/components/RequireRole";
import { useConnections } from "@/hooks/useConnections";
import { useProfileAssistant } from "@/hooks/useProfileAssistant";
import { useTrustScore, useUserReviews } from "@/hooks/useTrust";
import { Av, Bar, Btn, Card, Empty, ErrorState, Ic, Lg, Loading, Stars, Tag, apiErrorMessage, cx } from "@/components/rap/kit";
import { EditProfileModal } from "@/features/profile/EditProfileModal";
import type { MyEngineerProfile, PublicEngineerProfile } from "@/types";

export default function EngineerProfilePage() {
  return <Suspense fallback={<Loading />}><ProfileRoute /></Suspense>;
}

/** /engineer/profile?id=… used to show other engineers; that view now lives at /engineers/[id]. */
function ProfileRoute() {
  const id = useSearchParams().get("id");
  const router = useRouter();
  useEffect(() => { if (id) router.replace(`/engineers/${id}`); }, [id, router]);
  if (id) return <Loading />;
  return <RequireRole roles={["ENGINEER"]}><MyProfile /></RequireRole>;
}

function useMyProfile() {
  return useQuery<MyEngineerProfile | null>({
    queryKey: ["engineer-profile"],
    retry: false,
    queryFn: async () => {
      try { return (await api.get<MyEngineerProfile>("/engineers/me")).data; } catch (e) {
        if ((e as { response?: { status?: number } }).response?.status === 404) return null;
        throw e;
      }
    },
  });
}

function MyProfile() {
  const { user } = useAuth();
  const client = useQueryClient();
  const q = useMyProfile();
  const trust = useTrustScore(user?.id);
  const reviews = useUserReviews(user?.id);
  const connections = useConnections();
  const assistant = useProfileAssistant();
  const [editing, setEditing] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const upload = useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData();
      form.append("file", file);
      return (await api.post("/engineers/me/resume", form, { headers: { "Content-Type": "multipart/form-data" } })).data;
    },
    onSuccess: () => client.invalidateQueries({ queryKey: ["engineer-profile"] }),
  });

  if (q.isLoading) return <Loading />;
  if (q.isError) return <ErrorState onRetry={() => q.refetch()} message={apiErrorMessage(q.error)} />;
  const p = q.data;
  if (!p) return <Empty icon="user" title="You don’t have a profile yet" action={<Btn href="/onboarding">Build my profile</Btn>}>Create your professional profile so companies can find you and we can match you to roles.</Empty>;

  const name = p.full_name || user?.full_name || "Your name";
  const connectionCount = (connections.data ?? []).filter((c) => c.status === "ACCEPTED").length;
  const score = Math.round(p.profile_score ?? 0);

  return (
    <div className="mx-auto grid max-w-[1200px] grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
      <main className="min-w-0 space-y-3">
        <Card p={false} c="overflow-hidden rounded-lg">
          <div className="h-48 bg-gradient-to-r from-[#031B4E] via-[#0866ff] to-[#5B4BDB]" />
          <div className="relative px-6 pb-6">
            <div className="-mt-20 flex justify-between">
              <div className="rounded-full border-4 border-white bg-white"><Av name={name} src={p.profile_image_url || user?.avatar_url} s={152} /></div>
              <button aria-label="Edit intro" onClick={() => setEditing(true)} className="mt-24 rounded-full p-2 hover:bg-slate-100"><Ic n="edit" /></button>
            </div>
            <div className="mt-2 grid grid-cols-1 gap-4 md:grid-cols-[1fr_220px]">
              <div>
                <h1 className="flex flex-wrap items-center gap-2">{name}{p.is_verified && <Tag t="blue">Verified</Tag>}</h1>
                <p className="text-lg">{p.headline || <span className="text-slate-500">Add a headline so people know what you do</span>}</p>
                <p className="mt-1 text-sm text-slate-500">{[p.location, p.timezone].filter(Boolean).join(" · ") || "Location not set"}</p>
                <Link href="/network" className="mt-1 inline-block text-sm font-bold text-[#0757d8]">{connectionCount} connection{connectionCount === 1 ? "" : "s"}</Link>
              </div>
              {p.primary_role && <div className="flex items-start gap-3"><Lg name={p.primary_role} s={40} r={4} /><span className="text-sm font-semibold">{p.primary_role}{p.years_of_experience ? <span className="block font-normal text-slate-500">{p.years_of_experience} years of experience</span> : null}</span></div>}
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Btn c="!px-5" onClick={() => setEditing(true)}>Edit profile</Btn>
              <Btn v="outline" icon="file" loading={upload.isPending} onClick={() => fileRef.current?.click()}>{p.resume_url ? "Replace resume" : "Upload resume"}</Btn>
              {p.resume_url && <Btn v="line" icon="download" href={p.resume_url}>View resume</Btn>}
              <input ref={fileRef} type="file" accept=".pdf,.docx" className="hidden" aria-label="Resume file" onChange={(e) => { const f = e.target.files?.[0]; if (f) upload.mutate(f); e.target.value = ""; }} />
            </div>
            {upload.isError && <p role="alert" className="mt-3 text-sm text-red-600">{extractErrorMessage(upload.error, "We couldn't upload that file.")}</p>}
            {upload.isSuccess && <p role="status" className="mt-3 text-sm text-green-700">Resume uploaded — we updated your profile with what we found.</p>}
            {p.is_open_to_work !== false && (
              <div className="mt-4 rounded-lg bg-[#e7f0ff] p-3 text-sm">
                <p className="font-bold">Open to work</p>
                <p>{[p.primary_role, p.remote_preference, p.availability].filter(Boolean).join(" · ") || "Tell companies what you’re looking for"}</p>
                <button onClick={() => setEditing(true)} className="font-bold text-[#0757d8]">Edit preferences</button>
              </div>
            )}
          </div>
        </Card>

        <Card c="rounded-lg">
          <p className="text-xl font-bold">Profile strength</p>
          <p className="flex items-center gap-1 text-xs text-slate-500"><Ic n="eye" s={12} />Private to you</p>
          <div className="mt-3 grid gap-4 sm:grid-cols-3">
            <div><p className="font-bold">{score}% complete</p><div className="mt-2"><Bar v={score} /></div></div>
            <div className="flex gap-2"><Ic n="shieldcheck" c="mt-0.5 text-slate-600" /><div><p className="font-bold">{trust.data ? `${Math.round(trust.data.overall_score)} trust score` : "Trust score"}</p><p className="text-xs text-slate-500">{trust.data ? `${trust.data.verified_skills_count} verified skill${trust.data.verified_skills_count === 1 ? "" : "s"}` : "Builds as you deliver work."}</p></div></div>
            <div className="flex gap-2"><Ic n="star" c="mt-0.5 text-slate-600" /><div><p className="font-bold">{trust.data?.review_count ? `${trust.data.rating_avg.toFixed(1)} average rating` : "No reviews yet"}</p><p className="text-xs text-slate-500">{trust.data?.review_count ?? 0} project review{trust.data?.review_count === 1 ? "" : "s"}</p></div></div>
          </div>
        </Card>

        <Card c="rounded-lg">
          <div className="flex items-center justify-between"><p className="text-xl font-bold">About</p><button aria-label="Edit about" onClick={() => setEditing(true)}><Ic n="edit" c="text-slate-500" /></button></div>
          <p className="mt-2 whitespace-pre-line text-[15px] leading-6 text-slate-700">{p.bio || "Share a short summary of your background, strengths and what you want to work on next."}</p>
        </Card>

        <Card c="rounded-lg border-[#5B4BDB]/30 bg-[#F6F4FF]">
          <div className="flex items-center justify-between"><p className="flex items-center gap-2 text-lg font-bold text-[#5B4BDB]"><Ic n="spark" />AI profile summary</p></div>
          <p className="mt-2 text-sm text-slate-700">{p.ai_summary || "Get an AI review of your profile with suggestions for skills and wording that improve your matches."}</p>
          {!!p.missing_skills?.length && <div className="mt-3 flex flex-wrap items-center gap-1.5"><span className="text-sm font-semibold">Suggested skills:</span>{p.missing_skills.map((s) => <Tag key={s} t="indigo">{s}</Tag>)}</div>}
          <div className="mt-3 flex gap-2">
            <Btn sm loading={assistant.isPending} onClick={() => assistant.mutate()}>{p.ai_summary ? "Refresh AI review" : "Review my profile with AI"}</Btn>
            <Btn sm v="line" onClick={() => setEditing(true)}>Edit profile</Btn>
          </div>
          {assistant.isError && <p role="alert" className="mt-2 text-sm text-red-600">{extractErrorMessage(assistant.error, "AI review is unavailable right now. Please try again shortly.")}</p>}
        </Card>

        <Card c="rounded-lg">
          <p className="text-xl font-bold">Experience</p>
          {p.experience?.length ? p.experience.map((e, i) => (
            <div key={`${e.company}-${e.title}-${i}`} className="mt-4 flex gap-3">
              <Lg name={e.company} s={48} r={4} />
              <div className={cx("flex-1 pb-4", i < p.experience.length - 1 && "border-b border-slate-100")}>
                <p className="font-bold">{e.title}</p><p className="text-sm">{e.company}</p>
                <p className="text-sm text-slate-500">{e.start_date} – {e.is_current ? "Present" : e.end_date || "Present"}</p>
                {e.description && <p className="mt-1 text-sm text-slate-700">{e.description}</p>}
                {!!e.technologies?.length && <div className="mt-2 flex flex-wrap gap-1">{e.technologies.map((t) => <Tag key={t}>{t}</Tag>)}</div>}
              </div>
            </div>
          )) : <p className="mt-2 text-sm text-slate-500">Upload your resume to import your work history.</p>}
        </Card>

        {!!p.education?.length && (
          <Card c="rounded-lg">
            <p className="text-xl font-bold">Education</p>
            {p.education.map((e, i) => (
              <div key={`${e.institution}-${i}`} className="mt-3 flex gap-3"><Lg name={e.institution} s={48} r={4} /><div><p className="font-bold">{e.degree}{e.field_of_study ? `, ${e.field_of_study}` : ""}</p><p className="text-sm">{e.institution}</p>{(e.start_year || e.end_year) && <p className="text-sm text-slate-500">{e.start_year ?? ""} – {e.end_year ?? ""}</p>}</div></div>
            ))}
          </Card>
        )}

        <Card c="rounded-lg">
          <p className="text-xl font-bold">Skills</p>
          {p.skills?.length ? <div className="mt-3 flex flex-wrap gap-2">{p.skills.map((s) => <Tag key={s} t="blue">{s}</Tag>)}</div> : <p className="mt-2 text-sm text-slate-500">Add skills so we can match you to the right roles.</p>}
        </Card>

        <Card c="rounded-lg">
          <p className="text-xl font-bold">Recommendations</p>
          {reviews.data?.length ? reviews.data.slice(0, 5).map((r) => (
            <div key={r.id} className="mt-3 flex gap-3">
              <Av name={r.reviewer?.full_name || "Reviewer"} s={48} />
              <div><p className="font-bold">{r.reviewer?.full_name || "Project partner"}</p><Stars v={r.rating} /><p className="mt-1 text-sm text-slate-700">{r.comment}</p></div>
            </div>
          )) : <p className="mt-2 text-sm text-slate-500">Reviews from companies you deliver projects for will appear here.</p>}
        </Card>
      </main>

      <aside className="space-y-3">
        <Card c="rounded-lg">
          <p className="font-bold">Public profile and URL</p>
          <Link href={`/engineers/${p.id}`} className="break-all text-sm text-[#0757d8]">/engineers/{p.id.slice(0, 8)}…</Link>
          <div className="my-3 border-t border-slate-100" />
          <p className="font-bold">Links</p>
          <div className="mt-1 space-y-1 text-sm">
            {([["GitHub", p.github_url], ["LinkedIn", p.linkedin_url], ["Portfolio", p.portfolio_url]] as const).map(([l, url]) => url
              ? <a key={l} href={url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-[#0757d8]"><Ic n="external" s={14} />{l}</a>
              : <p key={l} className="text-slate-500">{l}: not added</p>)}
          </div>
          {p.hourly_rate != null && <><div className="my-3 border-t border-slate-100" /><p className="font-bold">Rate</p><p className="text-sm text-slate-500">${p.hourly_rate}/hr</p></>}
        </Card>
        <PeopleAlsoViewed myProfileId={p.id} />
      </aside>

      <EditProfileModal open={editing} onClose={() => setEditing(false)} profile={p} />
    </div>
  );
}

function PeopleAlsoViewed({ myProfileId }: { myProfileId: string }) {
  const { user } = useAuth();
  const people = useQuery<PublicEngineerProfile[]>({ queryKey: ["engineers", "suggested"], queryFn: async () => (await api.get("/engineers", { params: { limit: 8 } })).data });
  const connections = useConnections();
  const known = new Set((connections.data ?? []).flatMap((c) => [c.sender_id, c.receiver_id]));
  const list = (people.data ?? []).filter((e) => e.id !== myProfileId && e.user_id !== user?.id).slice(0, 5);
  if (!list.length) return null;
  return (
    <Card c="rounded-lg">
      <p className="mb-2 text-lg font-bold">People you may know</p>
      {list.map((e) => (
        <div key={e.id} className="flex gap-3 border-b border-slate-100 py-3 last:border-0">
          <Link href={`/engineers/${e.id}`}><Av name={e.full_name || "Engineer"} src={e.profile_image_url} s={48} /></Link>
          <div className="min-w-0 flex-1">
            <Link href={`/engineers/${e.id}`} className="font-bold leading-tight hover:underline">{e.full_name || "Engineer"}</Link>
            <p className="text-xs text-slate-500">{e.headline || e.primary_role}</p>
            {known.has(e.user_id) ? <Tag>Pending or connected</Tag> : (
              <Btn v="line" sm c="mt-2" icon="plus" loading={connections.request.isPending && connections.request.variables === e.user_id} onClick={() => connections.request.mutate(e.user_id)}>Connect</Btn>
            )}
          </div>
        </div>
      ))}
    </Card>
  );
}
