import { useState } from "react";
import api, { extractErrorMessage } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useApi, toFigmaJob, statusOf, type ApiJob } from "./live";
import { Ic, Av, Lg, Btn, Card, Tag, Tabs, Modal, Bar, cx, grad, PEOPLE, JOBS, Field, inputCls } from "./rap_kit";

const BL = "#0552CC";
export function Jobs() {
  // Live: real jobs, saved jobs, applications and AI match (markup is the Figma design).
  const { user } = useAuth();
  const engineer = user?.role === "ENGINEER";
  const [q, setQ] = useState("");
  const [skill, setSkill] = useState("");
  const [search, setSearch] = useState({ q: "", skill: "" });
  const [easy, setEasy] = useState(false);
  const [selId, setSelId] = useState<string | null>(null);
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
  const startApply = () => { if (!sel) return; if (!user) { window.location.hash = "login"; return; } if (!sel.easy && sel.raw.external_url) { window.open(sel.raw.external_url, "_blank", "noopener"); return; } setApply(true); setStep(0); setNote(""); };
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
        {step === 1 && <div className="space-y-3"><p className="text-sm text-slate-600">Your application uses the resume and details on your profile.</p><Btn v="outline" full icon="plus" onClick={() => { setApply(false); window.location.hash = "profile"; }}>Update my profile or resume</Btn></div>}
        {step === 2 && <div className="space-y-3"><Field label="Cover note (optional)"><textarea rows={4} maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} className={cx(inputCls, "h-auto py-2")} placeholder="Why you are a strong fit" /></Field></div>}
        {step === 3 && <div className="space-y-2 text-sm"><p className="font-bold">Review your application</p>{[["Role", sel?.t ?? ""], ["Contact", user?.email ?? ""], ["Cover note", note.trim() ? note.trim().slice(0, 60) : "None"], ["Match", m ? Math.round(m.overall_score) + "%" : "—"]].map(([k, v]) => <div key={k} className="flex justify-between border-b border-slate-100 py-2"><span className="text-slate-500">{k}</span><span className="font-semibold">{v}</span></div>)}</div>}
        <div className="mt-6 flex justify-between">{step > 0 ? <Btn v="outline" onClick={() => setStep(step - 1)}>Back</Btn> : <span />}{step < 3 ? <Btn onClick={() => setStep(step + 1)}>Next</Btn> : <Btn onClick={submit}>Submit application</Btn>}</div>
      </Modal>
      {notice && <div role="status" className="v2-toast" onClick={() => setNotice("")}>{notice}</div>}
    </div>
  );
}

const title = (s?: string | null) => (s || "").replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
const EXP = [["Founder and CEO", "Remote-AI-Platform", "Jan 2026 - Present - 9 mos", "Building an AI-powered remote engineering marketplace: matching, contracts, escrow and delivery."], ["Senior Data Engineer", "NatWest Group", "2022 - 2025 - 3 yrs", "Led lakehouse and CDC pipelines on AWS and Databricks for regulated financial data."], ["Data Engineer", "Infosys", "2019 - 2022 - 3 yrs", "Built ETL/ELT workloads across Azure and GCP for enterprise clients."]];
export function Profile() {
  const [open, setOpen] = useState(true);
  return (
    <div className="bg-[#F0F2F5] py-5">
      <div className="mx-auto grid max-w-[1200px] gap-5 px-4 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px]">
        <main className="min-w-0 space-y-3">
          <Card p={false} c="overflow-hidden rounded-lg">
            <div className="h-48 bg-gradient-to-r from-[#031B4E] via-[#0552CC] to-[#5B4BDB]" />
            <div className="relative px-6 pb-6"><div className="-mt-20 flex justify-between"><div className="rounded-full border-4 border-white bg-white"><Av name="Gokul Raj" s={152} /></div><button className="mt-24 rounded-full p-2 hover:bg-slate-100"><Ic n="edit" /></button></div>
              <div className="mt-2 grid gap-4 grid-cols-1 md:grid-cols-[1fr_220px]"><div><h1 className="text-2xl font-black">Gokul Raj <span className="ml-1 rounded bg-[#E8F0FC] px-1.5 py-0.5 align-middle text-xs font-bold text-[#0552CC]">He/Him</span></h1><p className="text-lg">Founder building Remote-AI-Platform - Senior Data Engineer - AWS - Databricks</p><p className="mt-1 text-sm text-slate-500">Berlin, Germany - <span className="font-bold" style={{ color: BL }}>Contact info</span></p><p className="mt-1 text-sm font-bold" style={{ color: BL }}>512 connections - 18,420 followers</p></div><div className="flex items-start gap-3"><Lg name="Remote AI" s={40} r={4} /><span className="text-sm font-semibold">Remote-AI-Platform</span></div></div>
              <div className="mt-4 flex flex-wrap gap-2"><Btn c="!px-5">Open to</Btn><Btn v="outline">Add profile section</Btn><Btn v="line">Resources</Btn></div>
              <div className="mt-4 rounded-lg bg-[#E8F0FC] p-3 text-sm"><p className="font-bold">Open to work</p><p>Senior data and AI platform roles - Berlin and remote (EU)</p><button className="font-bold" style={{ color: BL }}>Show details</button></div>
            </div>
          </Card>
          <Card c="rounded-lg"><p className="text-xl font-bold">Analytics</p><p className="flex items-center gap-1 text-xs text-slate-500"><Ic n="eye" s={12} />Private to you</p><div className="mt-3 grid gap-4 sm:grid-cols-3">{[["users", "214 profile views", "Discover who viewed your profile."], ["chart", "3,140 post impressions", "Check out who is engaging with your posts."], ["search", "88 search appearances", "See how often you appear in search results."]].map(([i, t, d]) => <div key={t} className="flex gap-2"><Ic n={i} c="mt-0.5 text-slate-600" /><div><p className="font-bold">{t}</p><p className="text-xs text-slate-500">{d}</p></div></div>)}</div></Card>
          <Card c="rounded-lg"><div className="flex items-center justify-between"><p className="text-xl font-bold">About</p><Ic n="edit" c="text-slate-500" /></div><p className="mt-2 text-[15px] leading-6 text-slate-700">Senior data engineer turned founder. I build cloud-native data platforms (AWS, Databricks, Azure, GCP) and now Remote-AI-Platform, where companies and remote engineers meet through transparent, explainable AI matching.</p></Card>
          <Card c="rounded-lg border-[#5B4BDB]/30 bg-[#F6F4FF]"><div className="flex items-center justify-between"><p className="flex items-center gap-2 text-lg font-black text-[#5B4BDB]"><Ic n="spark" />AI profile summary</p><Tag t="indigo">Confidence 92%</Tag></div><p className="mt-2 text-sm text-slate-700">Extracted from resume and verified work history. Suggested to improve: add 2 portfolio links and quantify impact for the NatWest role.</p><div className="mt-3 flex gap-2"><Btn sm>Apply suggestions</Btn><Btn sm v="line">Review evidence</Btn></div></Card>
          <Card c="rounded-lg"><div className="flex items-center justify-between"><p className="text-xl font-bold">Experience</p><div className="flex gap-3 text-slate-500"><Ic n="plus" /><Ic n="edit" /></div></div>{EXP.map((e, i) => <div key={e[0]} className="mt-4 flex gap-3"><Lg name={e[1]} s={48} r={4} /><div className={cx("flex-1 pb-4", i < EXP.length - 1 && "border-b border-slate-100")}><p className="font-bold">{e[0]}</p><p className="text-sm">{e[1]}</p><p className="text-sm text-slate-500">{e[2]}</p><p className="mt-1 text-sm text-slate-700">{e[3]}</p></div></div>)}</Card>
          <Card c="rounded-lg"><p className="text-xl font-bold">Education</p><div className="mt-3 flex gap-3"><Lg name="University" s={48} r={4} /><div><p className="font-bold">B.E. Computer Science</p><p className="text-sm text-slate-500">2015 - 2019</p></div></div></Card>
          <Card c="rounded-lg"><p className="text-xl font-bold">Skills</p>{[["Data engineering", "34 endorsements"], ["Databricks", "21 endorsements"], ["AWS", "19 endorsements"], ["Python", "17 endorsements"]].map((s) => <div key={s[0]} className="mt-3 border-b border-slate-100 pb-3"><p className="font-bold">{s[0]}</p><p className="flex items-center gap-1 text-sm text-slate-500"><Ic n="users" s={14} />{s[1]}</p></div>)}</Card>
          <Card c="rounded-lg"><p className="text-xl font-bold">Recommendations</p><div className="mt-3 flex gap-3"><Av name="Daniel Okafor" s={48} /><div><p className="font-bold">Daniel Okafor</p><p className="text-xs text-slate-500">Data Platform Lead - worked with Gokul on the same team</p><p className="mt-1 text-sm text-slate-700">Gokul designs pipelines that stay reliable at scale and explains trade-offs clearly.</p></div></div></Card>
        </main>
        <aside className="space-y-3">
          <Card c="rounded-lg"><p className="font-bold">Profile language</p><p className="text-sm text-slate-500">English</p><div className="my-3 border-t border-slate-100" /><p className="font-bold">Public profile and URL</p><p className="text-sm text-slate-500">remote-ai.app/in/gokul-raj</p></Card>
          <Card c="rounded-lg"><p className="mb-2 text-lg font-bold">People also viewed</p>{PEOPLE.slice(0, 5).map((p) => <div key={p.n} className="flex gap-3 border-b border-slate-100 py-3 last:border-0"><Av name={p.n} s={48} /><div className="flex-1"><p className="font-bold leading-tight">{p.n}</p><p className="text-xs text-slate-500">{p.t}</p><Btn v="line" sm c="mt-2" icon="plus">Connect</Btn></div></div>)}</Card>
          <Card c="rounded-lg" p={false}><div style={{background:"linear-gradient(135deg,#0552CC,#5B4BDB)"}} className="rounded-lg p-4"><p className="text-xs font-semibold uppercase" style={{color:"rgba(255,255,255,0.75)"}}>Premium</p><p className="mt-1 font-black text-white">See who is hiring for your skills</p><Btn v="gray" sm c="mt-3">Try 1 month free</Btn></div></Card>
        </aside>
      </div>
    </div>
  );
}

export function Network() {
  const [done, setDone] = useState<string[]>([]);
  const inv = PEOPLE.slice(0, 2);
  return (
    <div className="bg-[#F0F2F5] py-5">
      <div className="mx-auto grid max-w-[1200px] gap-5 px-4 grid-cols-1 lg:grid-cols-[260px_minmax(0,1fr)_300px]">
        <Card c="self-start rounded-lg" p={false}><p className="p-4 font-bold">Manage my network</p>{[["users", "Connections", "512"], ["user", "Following and followers", "18K"], ["users", "Groups", "5"], ["calendar", "Events", "2"], ["building", "Pages", "14"], ["file", "Newsletters", "3"]].map((r) => <div key={r[1]} className="flex items-center gap-3 px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50"><Ic n={r[0]} s={18} /><span className="flex-1">{r[1]}</span><span className="text-slate-400">{r[2]}</span></div>)}</Card>
        <main className="min-w-0 space-y-3">
          <Card c="rounded-lg" p={false}><div className="flex items-center justify-between p-4"><p className="font-bold">Invitations ({inv.length})</p><span className="text-sm font-semibold text-slate-500">Show all</span></div>{inv.map((p) => <div key={p.n} className="flex items-center gap-3 border-t border-slate-100 p-4"><Av name={p.n} s={64} /><div className="flex-1"><p className="font-bold">{p.n}</p><p className="text-sm text-slate-500">{p.t} at {p.co}</p><p className="text-xs text-slate-500">12 mutual connections</p></div>{done.includes(p.n) ? <Tag t="green">Connected</Tag> : <><Btn v="ghost" onClick={() => setDone([...done, p.n])}>Ignore</Btn><Btn v="outline" onClick={() => setDone([...done, p.n])}>Accept</Btn></>}</div>)}</Card>
          <Card c="rounded-lg"><p className="mb-3 font-bold">People you may know from Remote-AI-Platform</p><div className="grid gap-3 grid-cols-1 sm:grid-cols-2 xl:grid-cols-3">{PEOPLE.slice(2).map((p) => <div key={p.n} className="overflow-hidden rounded-lg border border-slate-200 text-center"><div className={cx("h-14 bg-gradient-to-br", grad(p.n))} /><div className="-mt-9 flex justify-center"><div className="rounded-full border-2 border-white"><Av name={p.n} s={72} /></div></div><div className="p-3"><p className="font-bold">{p.n}</p><p className="h-8 text-xs text-slate-500">{p.t}</p><p className="mt-2 text-xs text-slate-500">{p.skills.length + 6} mutual connections</p><Btn v={done.includes(p.n) ? "gray" : "outline"} full sm c="mt-3" icon={done.includes(p.n) ? "clock" : "plus"} onClick={() => setDone([...done, p.n])}>{done.includes(p.n) ? "Pending" : "Connect"}</Btn></div></div>)}</div></Card>
        </main>
        <aside className="self-start"><Card c="rounded-lg" p={false}><div style={{background:"#0552CC"}} className="rounded-lg p-4"><p className="font-black text-white">Grow your network faster</p><p className="mt-1 text-sm" style={{color:"rgba(255,255,255,0.85)"}}>Import contacts or invite teammates to Remote-AI-Platform.</p><Btn v="gray" sm c="mt-3">Invite</Btn></div></Card></aside>
      </div>
    </div>
  );
}

export function Company() {
  const [tab, setTab] = useState("Home");
  const [fol, setFol] = useState(false);
  return (
    <div className="bg-[#F0F2F5] py-5">
      <div className="mx-auto grid max-w-[1200px] gap-5 px-4 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_300px]">
        <main className="min-w-0 space-y-3">
          <Card p={false} c="overflow-hidden rounded-lg"><div className="h-40 bg-gradient-to-r from-slate-800 via-[#0552CC] to-cyan-500" /><div className="px-6 pb-2"><div className="-mt-12 rounded-lg border-4 border-white bg-white inline-block"><Lg name="Helix Labs" s={96} r={6} /></div><h1 className="mt-2 text-2xl font-black">Helix Labs</h1><p className="text-slate-700">Retrieval and ranking infrastructure for AI-native products.</p><p className="mt-1 text-sm text-slate-500">Software development - Berlin, Germany - 12,480 followers - 201-500 employees</p><div className="my-3 flex gap-2"><Btn onClick={() => setFol(!fol)} v={fol ? "gray" : "primary"} icon={fol ? "check" : "plus"}>{fol ? "Following" : "Follow"}</Btn><Btn v="outline" icon="external">Visit website</Btn><Btn v="line">Message</Btn></div></div><Tabs items={["Home", "About", "Posts", "Jobs", "People"]} v={tab} set={setTab} c="px-4" /></Card>
          <Card c="rounded-lg"><p className="text-xl font-bold">Overview</p><p className="mt-2 text-[15px] leading-6 text-slate-700">Helix Labs builds retrieval, ranking and evaluation infrastructure. We are a remote-first team across 14 countries and hire through Remote-AI-Platform with transparent, explainable matching.</p><div className="mt-4 grid grid-cols-3 gap-3 text-center">{[["Verified", "Company"], ["4.7", "Remote maturity"], ["12", "Open roles"]].map((s) => <div key={s[1]} className="rounded-lg bg-slate-50 p-3"><p className="text-xl font-black">{s[0]}</p><p className="text-xs text-slate-500">{s[1]}</p></div>)}</div><div className="mt-4 flex flex-wrap gap-2">{["Python", "Rust", "Kubernetes", "Vespa", "PyTorch"].map((t) => <Tag key={t} t="blue">{t}</Tag>)}</div></Card>
          <Card c="rounded-lg" p={false}><p className="p-4 text-xl font-bold">Recently posted jobs</p>{JOBS.filter((j) => j.co === "Helix Labs").map((j) => <div key={j.id} className="flex items-center gap-3 border-t border-slate-100 p-4"><Lg name={j.co} s={48} r={4} /><div className="flex-1"><p className="font-bold" style={{ color: BL }}>{j.t}</p><p className="text-sm text-slate-500">{j.loc} - {j.pay}</p></div><Btn v="outline" sm>Apply</Btn></div>)}</Card>
        </main>
        <aside className="space-y-3"><Card c="rounded-lg"><p className="mb-2 font-bold">People also follow</p>{["Northstar Cloud", "Aster Labs", "Brightpath", "CloudNova"].map((c) => <div key={c} className="flex items-center gap-3 border-b border-slate-100 py-3 last:border-0"><Lg name={c} s={44} r={4} /><div className="flex-1"><p className="font-bold leading-tight">{c}</p><Btn v="line" sm c="mt-1" icon="plus">Follow</Btn></div></div>)}</Card></aside>
      </div>
    </div>
  );
}
