import { useState } from "react";
import api, { extractErrorMessage } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useApi, toFigmaJob, statusOf, type ApiJob, goRoute } from "./live";
import { Ic, Av, Lg, Btn, Card, Tag, Tabs, Modal, Bar, Stars, cx, grad, Field, inputCls } from "./rap_kit";

const BL = "#0552CC";
export function Jobs() {
  // Live: real jobs, saved jobs, applications and AI match (markup is the Figma design).
  const { user } = useAuth();
  const engineer = user?.role === "ENGINEER";
  const [q, setQ] = useState("");
  const [skill, setSkill] = useState("");
  const [search, setSearch] = useState({ q: "", skill: "" });
  const [easy, setEasy] = useState(false);
  const [selId, setSelId] = useState<string | null>(() => { try { return localStorage.getItem("rap-selected-job"); } catch { return null; } });
  const [apply, setApply] = useState(false);
  const [step, setStep] = useState(0);
  const [note, setNote] = useState("");
  const [notice, setNotice] = useState("");
  const jobsQ = useApi<ApiJob[]>("/jobs", { query: search.q || undefined, skills: search.skill ? [search.skill] : undefined, limit: 50 });
  const savedQ = useApi<ApiJob[]>(engineer ? "/saved-jobs" : null, { limit: 100 });
  const appsQ = useApi<{ application: { status: string }; job: { id: string } }[]>(engineer ? "/applications/me" : null, { limit: 100 });
  const jobs = (jobsQ.data ?? []).map(toFigmaJob);
  const list = jobs.filter((j) => !easy || j.easy);
  const sel = list.find((j) => j.id === selId) ?? list[0];
  const saved = new Set((savedQ.data ?? []).map((j) => j.id));
  const applied = new Set((appsQ.data ?? []).filter((a) => a.application.status !== "WITHDRAWN").map((a) => a.job.id));
  const matchQ = useApi<{ overall_score: number; skill_score: number; experience_score: number; timezone_score: number; compensation_score: number; matching_skills: string[]; missing_skills: string[] }>(engineer && sel ? `/matching/jobs/${sel.id}` : null);
  const steps = ["Contact info", "Resume", "Questions", "Review"];
  const toggleSave = async (id: string) => { if (!engineer) return; await (saved.has(id) ? api.delete(`/saved-jobs/${id}`) : api.post(`/saved-jobs/${id}`)); savedQ.reload(); };
  const startApply = () => { if (!sel) return; if (!user) { goRoute("login"); return; } if (!sel.easy && sel.raw.external_url) { window.open(sel.raw.external_url, "_blank", "noopener"); return; } setApply(true); setStep(0); setNote(""); };
  const submit = async () => { if (!sel) return; try { await api.post(`/applications/jobs/${sel.id}`, { cover_note: note.trim() || undefined }); setNotice("Application sent to " + sel.co); appsQ.reload(); } catch (e) { setNotice(extractErrorMessage(e, "We couldn't submit your application.")); } setApply(false); };
  const m = matchQ.data;
  return (
    <div className="bg-[#F0F2F5]">
      <div className="border-b border-slate-200 bg-white">
        <form onSubmit={(e) => { e.preventDefault(); setSearch({ q: q.trim(), skill: skill.trim() }); setSelId(null); }} className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-2 px-4 py-2.5">
          <div className="flex h-10 min-w-[260px] flex-1 items-center gap-2 rounded-md bg-[#E8F0FC] px-3"><Ic n="search" s={18} c="text-slate-500" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Title, skill or company" aria-label="Search jobs" className="flex-1 bg-transparent text-sm outline-none" /></div>
          <div className="flex h-10 w-64 items-center gap-2 rounded-md bg-[#E8F0FC] px-3"><Ic n="code" s={18} c="text-slate-500" /><input value={skill} onChange={(e) => setSkill(e.target.value)} placeholder="Skill, e.g. Python" aria-label="Filter by skill" className="flex-1 bg-transparent text-sm outline-none" /></div>
          <button type="submit" className="h-10 rounded-full px-6 text-sm font-bold text-white" style={{ background: BL }}>Search</button>
        </form>
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-2 px-4 pb-2.5">
          <button onClick={() => setEasy(!easy)} className={cx("rounded-full border px-3 py-1 text-sm font-semibold", easy ? "border-emerald-700 bg-emerald-700 text-white" : "border-slate-400 text-slate-600 hover:bg-slate-50")}>Easy Apply</button>
        </div>
      </div>
      <div className="mx-auto grid max-w-[1400px] gap-4 px-4 py-4 grid-cols-1 lg:grid-cols-[440px_minmax(0,1fr)]">
        <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <div className="border-b border-slate-200 p-4"><p className="text-lg font-bold">{search.q ? `Jobs matching “${search.q}”` : "Top job picks for you"}</p><p className="text-sm text-slate-500">Live remote roles - {jobsQ.loading ? "loading…" : `${list.length} results`}</p></div>
          {!!jobsQ.error && <div className="p-10 text-center text-slate-500"><Ic n="flag" s={32} c="mx-auto mb-2" />We couldn’t load jobs. <button className="font-bold" style={{ color: BL }} onClick={jobsQ.reload}>Try again</button></div>}
          {!jobsQ.loading && !jobsQ.error && list.length === 0 && <div className="p-10 text-center text-slate-500"><Ic n="search" s={32} c="mx-auto mb-2" />No jobs match your filters.</div>}
          {list.map((j) => (
            <div key={j.id} onClick={() => setSelId(j.id)} className={cx("flex cursor-pointer gap-3 border-b border-slate-100 p-4 hover:bg-slate-50", sel?.id === j.id && "border-l-4 bg-[#F0F6FF]")} style={sel?.id === j.id ? { borderLeftColor: BL } : {}}>
              <Lg name={j.co} s={56} r={4} />
              <div className="min-w-0 flex-1"><p className="truncate font-bold" style={{ color: BL }}>{j.t}</p><p className="text-sm">{j.co}</p><p className="text-sm text-slate-500">{j.loc} ({j.type})</p><p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500"><span className="font-semibold text-emerald-700">{j.post}</span>{j.m != null && <Tag t="indigo">{j.m}% match</Tag>}{j.easy && <span className="flex items-center gap-1 font-semibold"><Ic n="bolt" s={12} c="text-[#0552CC]" />Easy Apply</span>}</p></div>
              {engineer && <button aria-label={saved.has(j.id) ? "Unsave job" : "Save job"} onClick={(e) => { e.stopPropagation(); toggleSave(j.id); }} className="self-start p-1 text-slate-500"><Ic n="bookmark" s={20} c={saved.has(j.id) ? "fill-current text-[#0552CC]" : ""} /></button>}
            </div>
          ))}
        </section>
        {sel && <section className="mt-4 max-h-[calc(100vh-190px)] self-start overflow-y-auto rounded-lg border border-slate-200 bg-white lg:mt-0 lg:sticky lg:top-40 lg:block">
          <div className="p-6">
            <div className="flex items-start gap-4"><Lg name={sel.co} s={64} r={4} /><div className="flex-1"><p className="text-sm font-semibold text-slate-600">{sel.co}</p><h2 className="text-2xl font-black leading-tight">{sel.t}</h2><p className="mt-1 text-sm text-slate-500">{sel.loc} - {sel.post}</p></div></div>
            <div className="mt-3 flex flex-wrap gap-2">{[["briefcase", sel.type], ["globe", sel.raw.is_remote === false ? "On-site" : "Remote"], ["award", sel.lvl], ["dollar", sel.pay]].filter(([, l]) => l).map(([i, l]) => <span key={i} className="flex items-center gap-1.5 rounded bg-slate-100 px-2.5 py-1 text-sm font-semibold text-slate-700"><Ic n={i} s={14} />{l}</span>)}</div>
            <div className="mt-4 flex gap-2">{applied.has(sel.id) ? <span className="flex items-center gap-1.5 rounded-full bg-emerald-50 px-6 py-2 text-sm font-bold text-emerald-700"><Ic n="check" s={16} />Applied</span> : (!user || engineer || !sel.easy) && <button onClick={startApply} className="flex items-center gap-1.5 rounded-full px-6 py-2 text-sm font-bold text-white" style={{ background: BL }}>{sel.easy && <Ic n="bolt" s={16} />}{!user ? "Sign in to apply" : sel.easy ? "Easy Apply" : "Apply on company site"}</button>}{engineer && <button onClick={() => toggleSave(sel.id)} className="rounded-full border px-6 py-2 text-sm font-bold" style={{ borderColor: BL, color: BL }}>{saved.has(sel.id) ? "Saved" : "Save"}</button>}</div>
            {engineer && <div className="mt-5 rounded-xl border border-[#5B4BDB]/25 bg-[#F6F4FF] p-4">
              <div className="flex items-center justify-between"><p className="flex items-center gap-2 font-black text-[#5B4BDB]"><Ic n="spark" s={18} />How you match</p>{m && <span className="text-2xl font-black text-[#5B4BDB]">{Math.round(m.overall_score)}%</span>}</div>
              {m ? <><div className="mt-3 grid grid-cols-2 gap-3 text-sm">{[["Skills", m.skill_score], ["Experience", m.experience_score], ["Time zone", m.timezone_score], ["Compensation", m.compensation_score]].map(([l, v]) => <div key={String(l)}><div className="mb-1 flex justify-between text-xs font-semibold text-slate-600"><span>{l}</span><span>{Math.round(Number(v))}%</span></div><Bar v={Number(v)} c="bg-[#5B4BDB]" /></div>)}</div>
                {m.matching_skills.length > 0 && <p className="mt-3 text-sm text-emerald-700">Strong: {m.matching_skills.slice(0, 4).join(", ")}.</p>}{m.missing_skills.length > 0 && <p className="text-sm text-amber-700">Gap: {m.missing_skills.slice(0, 3).join(", ")} appear in the requirements but not on your profile.</p>}</>
                : <p className="mt-3 text-sm text-slate-600">{matchQ.loading ? "Calculating your match…" : statusOf(matchQ.error) === 404 ? "Complete your professional profile to see how you match this role." : "Your match isn’t available right now."}</p>}
            </div>}
            <h3 className="mt-6 text-lg font-bold">About the job</h3>
            <p className="mt-2 whitespace-pre-line text-[15px] leading-6 text-slate-700">{sel.raw.description || "No description provided."}</p>
            {sel.tags.length > 0 && <><p className="mt-4 font-bold">Skills</p><div className="mt-2 flex flex-wrap gap-2">{sel.tags.map((t) => <Tag key={t} t="blue">{t}</Tag>)}</div></>}
            <div className="mt-4 rounded-xl border border-slate-200 p-4"><div className="flex items-center gap-3"><Lg name={sel.co} s={48} r={4} /><div className="flex-1"><p className="font-bold">About {sel.co}</p><p className="text-sm text-slate-500">{sel.easy ? "Hiring on Remote AI Platform" : `Listed on ${title(sel.raw.source)}`}</p></div></div></div>
          </div>
        </section>}
      </div>
      <Modal open={apply && !!sel} onClose={() => setApply(false)} title={"Apply to " + (sel?.co ?? "")}>
        <div className="mb-4"><Bar v={((step + 1) / steps.length) * 100} c="bg-[#0552CC]" /><p className="mt-1 text-xs font-semibold text-slate-500">Step {step + 1} of {steps.length} - {steps[step]}</p></div>
        {step === 0 && <div className="space-y-3"><div className="flex items-center gap-3"><Av name={user?.full_name || "You"} s={56} /><div><p className="font-bold">{user?.full_name}</p><p className="text-sm text-slate-500">{user?.email}</p></div></div><p className="text-sm text-slate-500">The company sees your profile and contact email.</p></div>}
        {step === 1 && <div className="space-y-3"><p className="text-sm text-slate-600">Your application uses the resume and details on your profile.</p><Btn v="outline" full icon="plus" onClick={() => { setApply(false); goRoute("profile"); }}>Update my profile or resume</Btn></div>}
        {step === 2 && <div className="space-y-3"><Field label="Cover note (optional)"><textarea rows={4} maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} className={cx(inputCls, "h-auto py-2")} placeholder="Why you are a strong fit" /></Field></div>}
        {step === 3 && <div className="space-y-2 text-sm"><p className="font-bold">Review your application</p>{[["Role", sel?.t ?? ""], ["Contact", user?.email ?? ""], ["Cover note", note.trim() ? note.trim().slice(0, 60) : "None"], ["Match", m ? Math.round(m.overall_score) + "%" : "—"]].map(([k, v]) => <div key={k} className="flex justify-between border-b border-slate-100 py-2"><span className="text-slate-500">{k}</span><span className="font-semibold">{v}</span></div>)}</div>}
        <div className="mt-6 flex justify-between">{step > 0 ? <Btn v="outline" onClick={() => setStep(step - 1)}>Back</Btn> : <span />}{step < 3 ? <Btn onClick={() => setStep(step + 1)}>Next</Btn> : <Btn onClick={submit}>Submit application</Btn>}</div>
      </Modal>
      {notice && <div role="status" className="v2-toast" onClick={() => setNotice("")}>{notice}</div>}
    </div>
  );
}

const title = (s?: string | null) => (s || "").replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
export function Profile() {
  // Live: the signed-in engineer's profile (/engineers/me) with edit, resume upload, AI review, trust reviews.
  const { user } = useAuth();
  const q = useApi<any>(user?.role === "ENGINEER" ? "/engineers/me" : null);
  const conns = useApi<any[]>(user ? "/connections" : null, { status: "ACCEPTED", limit: 200 });
  const reviews = useApi<any[]>(user ? `/trust/reviews/${user.id}` : null);
  const people = useApi<any[]>("/engineers", { limit: 8 });
  const aiUse = useApi<{ used_this_month: number; monthly_allowance: number | null }>(user ? "/auth/me/ai-usage" : null);
  const [editing, setEditing] = useState(false);
  const [f, setF] = useState<any>({});
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");
  const p = q.data;
  if (user?.role && user.role !== "ENGINEER") { goRoute(user.role === "COMPANY" ? "coprofile" : "settings"); return null; }
  if (q.loading && !p) return <div className="mx-auto max-w-[1200px] px-4 py-10"><Card c="rounded-lg p-10 text-center text-slate-500">Loading your profile…</Card></div>;
  if (!p) return <div className="mx-auto max-w-[1200px] px-4 py-10"><Card c="rounded-lg p-10 text-center"><h2>You don’t have a profile yet</h2><p className="mt-2 text-slate-500">Create your professional profile so companies can find you.</p><Btn c="mt-4" onClick={() => { goRoute("onboarding"); }}>Build my profile</Btn></Card></div>;
  const name = p.full_name || user?.full_name || "Your name";
  const startEdit = () => { setF({ headline: p.headline || "", primary_role: p.primary_role || "", location: p.location || "", bio: p.bio || "", skills: (p.skills || []).join(", "), hourly_rate: p.hourly_rate ?? "" }); setEditing(true); };
  const run = async (key: string, fn: () => Promise<unknown>, ok: string) => { setBusy(key); setNotice(""); try { await fn(); q.reload(); setNotice(ok); } catch (e) { setNotice(extractErrorMessage(e, "That didn't work. Please try again.")); } finally { setBusy(""); } };
  const save = () => run("save", () => api.put("/engineers/me", { headline: f.headline.trim() || null, primary_role: f.primary_role.trim() || null, location: f.location.trim() || null, bio: f.bio.trim() || null, skills: f.skills.split(",").map((s: string) => s.trim()).filter(Boolean), hourly_rate: f.hourly_rate === "" ? null : Number(f.hourly_rate) }).then(() => setEditing(false)), "Profile updated");
  const upload = (file: File) => { const form = new FormData(); form.append("file", file); return run("resume", () => api.post("/engineers/me/resume", form, { headers: { "Content-Type": "multipart/form-data" } }), "Resume uploaded — we updated your profile with what we found."); };
  const known = new Set((conns.data ?? []).flatMap((c: any) => [c.sender_id, c.receiver_id]));
  const suggest = (people.data ?? []).filter((e: any) => e.user_id !== user?.id && !known.has(e.user_id)).slice(0, 5);
  const openPerson = (id: string) => { sessionStorage.setItem("rap-person-id", id); goRoute("engineer"); };
  return (
    <div className="bg-[#F0F2F5] py-5">
      <div className="mx-auto grid max-w-[1200px] gap-5 px-4 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px]">
        <main className="min-w-0 space-y-3">
          <Card p={false} c="overflow-hidden rounded-lg">
            <div className="h-48 bg-gradient-to-r from-[#031B4E] via-[#0552CC] to-[#5B4BDB]" />
            <div className="relative px-6 pb-6"><div className="-mt-20 flex justify-between"><div className="rounded-full border-4 border-white bg-white"><Av name={name} s={152} /></div><button aria-label="Edit intro" onClick={startEdit} className="mt-24 rounded-full p-2 hover:bg-slate-100"><Ic n="edit" /></button></div>
              <div className="mt-2 grid gap-4 grid-cols-1 md:grid-cols-[1fr_220px]"><div><h1 className="text-2xl font-black">{name}{p.is_verified && <span className="ml-1 rounded bg-[#E8F0FC] px-1.5 py-0.5 align-middle text-xs font-bold text-[#0552CC]">Verified</span>}</h1><p className="text-lg">{p.headline || "Add a headline so people know what you do"}</p><p className="mt-1 text-sm text-slate-500">{p.location || "Location not set"}</p><p className="mt-1 text-sm font-bold" style={{ color: BL }}>{(conns.data ?? []).length} connections</p></div>{p.primary_role && <div className="flex items-start gap-3"><Lg name={p.primary_role} s={40} r={4} /><span className="text-sm font-semibold">{p.primary_role}{p.years_of_experience ? <span className="block font-normal text-slate-500">{p.years_of_experience} years</span> : null}</span></div>}</div>
              <div className="mt-4 flex flex-wrap gap-2"><Btn c="!px-5" onClick={() => run("open", () => api.put("/engineers/me", { is_open_to_work: p.is_open_to_work === false }), p.is_open_to_work === false ? "You’re now open to work" : "Open to work turned off")}>{p.is_open_to_work === false ? "Open to work" : "Pause open to work"}</Btn><Btn v="outline" onClick={startEdit}>Edit profile</Btn><label className="inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-slate-300 px-4 py-2 text-[15px] font-semibold text-slate-700 hover:bg-slate-50">{busy === "resume" ? "Uploading…" : p.resume_url ? "Replace resume" : "Upload resume"}<input type="file" accept=".pdf,.docx" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; if (file) upload(file); e.target.value = ""; }} /></label>{p.resume_url && <a href={p.resume_url} target="_blank" rel="noopener noreferrer"><Btn v="line">View resume</Btn></a>}</div>
              {p.is_open_to_work !== false && <div className="mt-4 rounded-lg bg-[#E8F0FC] p-3 text-sm"><p className="font-bold">Open to work</p><p>{[p.primary_role, p.remote_preference, p.availability].filter(Boolean).join(" - ") || "Tell companies what you’re looking for"}</p><button className="font-bold" style={{ color: BL }} onClick={() => { goRoute("onboarding"); }}>Edit preferences</button></div>}
            </div>
          </Card>
          <Card c="rounded-lg"><p className="text-xl font-bold">Profile strength</p><p className="flex items-center gap-1 text-xs text-slate-500"><Ic n="eye" s={12} />Private to you</p><div className="mt-3"><Bar v={p.profile_score || 0} /><p className="mt-1 text-sm text-slate-600">{Math.round(p.profile_score || 0)}% complete</p></div></Card>
          <Card c="rounded-lg"><div className="flex items-center justify-between"><p className="text-xl font-bold">About</p><button aria-label="Edit about" onClick={startEdit}><Ic n="edit" c="text-slate-500" /></button></div><p className="mt-2 whitespace-pre-line text-[15px] leading-6 text-slate-700">{p.bio || "Share a short summary of your background and what you want to work on next."}</p></Card>
          <Card c="rounded-lg border-[#5B4BDB]/30 bg-[#F6F4FF]"><div className="flex items-center justify-between"><p className="flex items-center gap-2 text-lg font-black text-[#5B4BDB]"><Ic n="spark" />AI profile summary</p></div><p className="mt-2 text-sm text-slate-700">{p.ai_summary || "Get an AI review of your profile with suggestions that improve your matches."}</p>{(p.missing_skills || []).length > 0 && <p className="mt-2 text-sm text-slate-700"><b>Suggested skills:</b> {p.missing_skills.join(", ")}</p>}<div className="mt-3 flex gap-2"><Btn sm onClick={() => run("ai", async () => { try { await api.post("/engineers/me/ai-enhance"); } finally { aiUse.reload(); } }, "AI review updated")}>{busy === "ai" ? "Reviewing…" : p.ai_summary ? "Refresh AI review" : "Review my profile with AI"}</Btn><Btn sm v="line" onClick={startEdit}>Edit profile</Btn></div>{aiUse.data?.monthly_allowance != null && <p className="mt-2 text-xs text-slate-500">AI allowance: {aiUse.data.used_this_month.toLocaleString()} of {aiUse.data.monthly_allowance.toLocaleString()} tokens used this month</p>}</Card>
          <Card c="rounded-lg"><div className="flex items-center justify-between"><p className="text-xl font-bold">Experience</p></div>{(p.experience || []).map((e: any, i: number) => <div key={i} className="mt-4 flex gap-3"><Lg name={e.company} s={48} r={4} /><div className={cx("flex-1 pb-4", i < p.experience.length - 1 && "border-b border-slate-100")}><p className="font-bold">{e.title}</p><p className="text-sm">{e.company}</p><p className="text-sm text-slate-500">{e.start_date} – {e.is_current ? "Present" : e.end_date || "Present"}</p>{e.description && <p className="mt-1 text-sm text-slate-700">{e.description}</p>}</div></div>)}{!(p.experience || []).length && <p className="mt-2 text-sm text-slate-500">Upload your resume to import your work history.</p>}</Card>
          {(p.education || []).length > 0 && <Card c="rounded-lg"><p className="text-xl font-bold">Education</p>{p.education.map((e: any, i: number) => <div key={i} className="mt-3 flex gap-3"><Lg name={e.institution} s={48} r={4} /><div><p className="font-bold">{e.degree}{e.field_of_study ? `, ${e.field_of_study}` : ""}</p><p className="text-sm text-slate-500">{e.institution}{e.start_year ? ` - ${e.start_year} – ${e.end_year ?? ""}` : ""}</p></div></div>)}</Card>}
          <Card c="rounded-lg"><p className="text-xl font-bold">Skills</p>{(p.skills || []).map((s: string) => <div key={s} className="mt-3 border-b border-slate-100 pb-3"><p className="font-bold">{s}</p></div>)}{!(p.skills || []).length && <p className="mt-2 text-sm text-slate-500">Add skills so we can match you to the right roles.</p>}</Card>
          <Card c="rounded-lg"><p className="text-xl font-bold">Recommendations</p>{(reviews.data ?? []).slice(0, 5).map((r: any) => <div key={r.id} className="mt-3 flex gap-3"><Av name={r.reviewer?.full_name || "Reviewer"} s={48} /><div><p className="font-bold">{r.reviewer?.full_name || "Project partner"}</p><Stars v={r.rating} /><p className="mt-1 text-sm text-slate-700">{r.comment}</p></div></div>)}{!(reviews.data ?? []).length && <p className="mt-2 text-sm text-slate-500">Reviews from companies you deliver projects for will appear here.</p>}</Card>
        </main>
        <aside className="space-y-3">
          <Card c="rounded-lg"><p className="font-bold">Public profile and URL</p><button className="text-sm" style={{ color: BL }} onClick={() => openPerson(p.id)}>View as others see it</button><div className="my-3 border-t border-slate-100" /><p className="font-bold">Rate</p><p className="text-sm text-slate-500">{p.hourly_rate != null ? `$${p.hourly_rate}/hr` : "Not set"}</p></Card>
          {suggest.length > 0 && <Card c="rounded-lg"><p className="mb-2 text-lg font-bold">People you may know</p>{suggest.map((e: any) => <div key={e.id} className="flex gap-3 border-b border-slate-100 py-3 last:border-0"><Av name={e.full_name || "Professional"} s={48} /><div className="flex-1"><button onClick={() => openPerson(e.id)} className="font-bold leading-tight hover:underline">{e.full_name || "Professional"}</button><p className="text-xs text-slate-500">{e.headline || e.primary_role}</p><Btn v="line" sm c="mt-2" icon="plus" onClick={() => run("c" + e.id, () => api.post("/connections", { receiver_id: e.user_id }), "Connection request sent").then(() => conns.reload())}>Connect</Btn></div></div>)}</Card>}
        </aside>
      </div>
      <Modal open={editing} onClose={() => setEditing(false)} title="Edit intro"><div className="space-y-3">{[["headline", "Headline"], ["primary_role", "Primary role"], ["location", "Location"], ["skills", "Skills, separated by commas"], ["hourly_rate", "Hourly rate (USD)"]].map(([k, l]) => <Field key={k} label={l}><input className={inputCls} value={f[k] ?? ""} onChange={(e) => setF({ ...f, [k]: e.target.value })} /></Field>)}<Field label="About"><textarea rows={4} className={cx(inputCls, "h-auto py-2")} value={f.bio ?? ""} onChange={(e) => setF({ ...f, bio: e.target.value })} /></Field><div className="flex justify-end gap-2"><Btn v="gray" onClick={() => setEditing(false)}>Cancel</Btn><Btn onClick={save}>{busy === "save" ? "Saving…" : "Save"}</Btn></div></div></Modal>
      {notice && <button onClick={() => setNotice("")} className="v2-toast">{notice} · Dismiss</button>}
    </div>
  );
}

export function Network() {
  // Live: real invitations, connections, suggestions (/connections, /engineers).
  const { user } = useAuth();
  const conns = useApi<any[]>(user ? "/connections" : null, { limit: 200 });
  const groups = useApi<any[]>(user ? "/groups/me/joined" : null);
  const people = useApi<any[]>("/engineers", { limit: 30 });
  const [notice, setNotice] = useState("");
  const all = conns.data ?? [];
  const inv = all.filter((c: any) => c.status === "PENDING" && c.receiver_id === user?.id);
  const accepted = all.filter((c: any) => c.status === "ACCEPTED").map((c: any) => (c.sender_id === user?.id ? c.receiver : c.sender)).filter(Boolean);
  const known = new Set(all.flatMap((c: any) => [c.sender_id, c.receiver_id]));
  const pendingOut = new Set(all.filter((c: any) => c.status === "PENDING" && c.sender_id === user?.id).map((c: any) => c.receiver_id));
  const suggest = (people.data ?? []).filter((p: any) => p.user_id !== user?.id && (!known.has(p.user_id) || pendingOut.has(p.user_id))).slice(0, 9);
  const respond = async (id: string, status: string) => { try { await api.patch(`/connections/${id}`, { status }); conns.reload(); } catch (e) { setNotice(extractErrorMessage(e, "Couldn't update that invitation.")); } };
  const connect = async (uid: string) => { if (!user) { goRoute("login"); return; } try { await api.post("/connections", { receiver_id: uid }); conns.reload(); } catch (e) { setNotice(extractErrorMessage(e, "Couldn't send that request.")); } };
  const invite = async () => { try { await navigator.clipboard.writeText(`${window.location.origin}/#register`); setNotice("Sign-up link copied — share it with your teammates."); } catch { setNotice(`Share this link: ${window.location.origin}/#register`); } };
  const open = (id?: string | null) => { if (!id) return; sessionStorage.setItem("rap-person-id", id); goRoute("engineer"); };
  return (
    <div className="bg-[#F0F2F5] py-5">
      <div className="mx-auto grid max-w-[1200px] gap-5 px-4 grid-cols-1 lg:grid-cols-[260px_minmax(0,1fr)_300px]">
        <Card c="self-start rounded-lg" p={false}><p className="p-4 font-bold">Manage my network</p>{[["users", "Connections", String(accepted.length), "network"], ["users", "Groups", String(groups.data?.length ?? 0), "groups"], ["chat", "Messages", "", "messenger"]].map((r) => <button key={r[1]} onClick={() => { goRoute(r[3]); }} className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm font-semibold text-slate-600 hover:bg-slate-50"><Ic n={r[0]} s={18} /><span className="flex-1">{r[1]}</span><span className="text-slate-400">{r[2]}</span></button>)}</Card>
        <main className="min-w-0 space-y-3">
          <Card c="rounded-lg" p={false}><div className="flex items-center justify-between p-4"><p className="font-bold">Invitations ({inv.length})</p></div>{inv.map((c: any) => <div key={c.id} className="flex items-center gap-3 border-t border-slate-100 p-4"><Av name={c.sender?.full_name || "Member"} s={64} /><div className="flex-1"><button onClick={() => open(c.sender?.engineer_profile_id)} className="font-bold hover:underline">{c.sender?.full_name || "Member"}</button><p className="text-sm text-slate-500">{c.sender?.headline || (c.sender?.role === "COMPANY" ? "Hiring on Remote AI Platform" : "Remote AI Platform member")}</p></div><Btn v="ghost" onClick={() => respond(c.id, "REJECTED")}>Ignore</Btn><Btn v="outline" onClick={() => respond(c.id, "ACCEPTED")}>Accept</Btn></div>)}{!inv.length && <p className="border-t border-slate-100 p-4 text-sm text-slate-500">No pending invitations.</p>}</Card>
          {accepted.length > 0 && <Card c="rounded-lg" p={false}><p className="p-4 font-bold">Your connections ({accepted.length})</p>{accepted.map((p: any) => <div key={p.id} className="flex items-center gap-3 border-t border-slate-100 p-4"><Av name={p.full_name} s={48} /><div className="flex-1"><button onClick={() => open(p.engineer_profile_id)} className="font-bold hover:underline">{p.full_name}</button><p className="text-sm text-slate-500">{p.headline || ""}</p></div><Btn v="outline" sm icon="chat" onClick={() => { sessionStorage.setItem("rap-contact-id", p.id); goRoute("messenger"); }}>Message</Btn></div>)}</Card>}
          <Card c="rounded-lg"><p className="mb-3 font-bold">People you may know from Remote-AI-Platform</p><div className="grid gap-3 grid-cols-1 sm:grid-cols-2 xl:grid-cols-3">{suggest.map((p: any) => { const name = p.full_name || "Professional"; const pending = pendingOut.has(p.user_id); return <div key={p.id} className="overflow-hidden rounded-lg border border-slate-200 text-center"><div className={cx("h-14 bg-gradient-to-br", grad(name))} /><div className="-mt-9 flex justify-center"><div className="rounded-full border-2 border-white"><Av name={name} s={72} /></div></div><div className="p-3"><button onClick={() => open(p.id)} className="font-bold hover:underline">{name}</button><p className="h-8 text-xs text-slate-500">{p.headline || p.primary_role || ""}</p><p className="mt-2 text-xs text-slate-500">{p.location || "Remote"}</p><Btn v={pending ? "gray" : "outline"} full sm c="mt-3" icon={pending ? "clock" : "plus"} onClick={() => !pending && connect(p.user_id)}>{pending ? "Pending" : "Connect"}</Btn></div></div>; })}</div>{!people.loading && !suggest.length && <p className="text-sm text-slate-500">No new suggestions right now.</p>}</Card>
        </main>
        <aside className="self-start"><Card c="rounded-lg" p={false}><div style={{background:"#0552CC"}} className="rounded-lg p-4"><p className="font-black text-white">Grow your network faster</p><p className="mt-1 text-sm" style={{color:"rgba(255,255,255,0.85)"}}>Invite teammates to Remote-AI-Platform.</p><Btn v="gray" sm c="mt-3" onClick={invite}>Invite</Btn></div></Card></aside>
      </div>
      {notice && <button onClick={() => setNotice("")} className="v2-toast">{notice} · Dismiss</button>}
    </div>
  );
}

export function Company() {
  // Live: /companies/{id} and its real postings (/jobs/company/{id}).
  const [id] = useState(() => new URLSearchParams(window.location.search).get("id") || sessionStorage.getItem("rap-company-id") || "");
  const q = useApi<any>(id ? `/companies/${id}` : null);
  const jobs = useApi<any[]>(id ? `/jobs/company/${id}` : null, { limit: 50 });
  const others = useApi<any[]>("/companies/public", { limit: 6 });
  const [tab, setTab] = useState("Home");
  const c = q.data;
  if (!id || q.error) return <div className="mx-auto max-w-[1200px] px-4 py-10"><Card c="rounded-lg p-10 text-center"><h2>Company not found</h2><Btn c="mt-4" onClick={() => { goRoute("companies"); }}>Browse companies</Btn></Card></div>;
  if (!c) return <div className="mx-auto max-w-[1200px] px-4 py-10"><Card c="rounded-lg p-10 text-center text-slate-500">Loading…</Card></div>;
  const open = (jobs.data ?? []).filter((j: any) => j.is_active !== false).map(toFigmaJob);
  const visit = (cid: string) => { sessionStorage.setItem("rap-company-id", cid); window.location.reload(); };
  const overview = <Card c="rounded-lg"><p className="text-xl font-bold">Overview</p><p className="mt-2 whitespace-pre-line text-[15px] leading-6 text-slate-700">{c.description || "This company hasn’t added a description yet."}</p><div className="mt-4 grid grid-cols-3 gap-3 text-center">{[[c.is_verified ? "Verified" : "Unverified", "Company"], [c.company_size || "—", "Employees"], [String(open.length), "Open roles"]].map((s) => <div key={s[1]} className="rounded-lg bg-slate-50 p-3"><p className="text-xl font-black">{s[0]}</p><p className="text-xs text-slate-500">{s[1]}</p></div>)}</div>{(c.tech_stack || []).length > 0 && <div className="mt-4 flex flex-wrap gap-2">{c.tech_stack.map((t: string) => <Tag key={t} t="blue">{t}</Tag>)}</div>}</Card>;
  const jobsCard = <Card c="rounded-lg" p={false}><p className="p-4 text-xl font-bold">Recently posted jobs</p>{open.map((j) => <div key={j.id} className="flex items-center gap-3 border-t border-slate-100 p-4"><Lg name={j.co} s={48} r={4} /><div className="flex-1"><p className="font-bold" style={{ color: BL }}>{j.t}</p><p className="text-sm text-slate-500">{[j.loc, j.pay].filter(Boolean).join(" - ")}</p></div><Btn v="outline" sm onClick={() => { localStorage.setItem("rap-selected-job", j.id); goRoute("jobs"); }}>Apply</Btn></div>)}{!open.length && <p className="border-t border-slate-100 p-4 text-sm text-slate-500">No open roles right now.</p>}</Card>;
  return (
    <div className="bg-[#F0F2F5] py-5">
      <div className="mx-auto grid max-w-[1200px] gap-5 px-4 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_300px]">
        <main className="min-w-0 space-y-3">
          <Card p={false} c="overflow-hidden rounded-lg"><div className="h-40 bg-gradient-to-r from-slate-800 via-[#0552CC] to-cyan-500" /><div className="px-6 pb-2"><div className="-mt-12 rounded-lg border-4 border-white bg-white inline-block"><Lg name={c.name} s={96} r={6} /></div><h1 className="mt-2 text-2xl font-black">{c.name}</h1><p className="text-slate-700">{c.industry || ""}</p><p className="mt-1 text-sm text-slate-500">{[c.industry, c.location, c.company_size ? `${c.company_size} employees` : null].filter(Boolean).join(" - ")}</p><div className="my-3 flex gap-2">{c.website && <a href={c.website} target="_blank" rel="noopener noreferrer"><Btn v="outline" icon="external">Visit website</Btn></a>}{open.length > 0 && <Btn onClick={() => setTab("Jobs")}>See open roles</Btn>}</div></div><Tabs items={["Home", "About", "Jobs"]} v={tab} set={setTab} c="px-4" /></Card>
          {tab === "Home" && <>{overview}{jobsCard}</>}{tab === "About" && overview}{tab === "Jobs" && jobsCard}
        </main>
        <aside className="space-y-3"><Card c="rounded-lg"><p className="mb-2 font-bold">Other companies hiring</p>{(others.data ?? []).filter((o: any) => o.id !== c.id).slice(0, 4).map((o: any) => <div key={o.id} className="flex items-center gap-3 border-b border-slate-100 py-3 last:border-0"><Lg name={o.name} s={44} r={4} /><div className="flex-1"><p className="font-bold leading-tight">{o.name}</p><Btn v="line" sm c="mt-1" onClick={() => visit(o.id)}>View</Btn></div></div>)}</Card></aside>
      </div>
    </div>
  );
}
