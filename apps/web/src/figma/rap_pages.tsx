// @ts-nocheck -- Figma Make export, kept verbatim (never type-checked upstream).
import { useState, useEffect } from "react";
import api, { extractErrorMessage } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useApi, toFigmaJob } from "./live";
import { Groups } from "./rap_social";
import { Ic, Av, Lg, Btn, Card, Tag, Tabs, Bar, Stars, Modal, cx, PEOPLE, JOBS, Field, inputCls } from "./rap_kit";

const nav = (h: string) => { window.location.hash = h; };
function Wrap({ children, w }: { children: any; w?: string }) { return <div className="bg-[#F0F2F5] py-6"><div className={cx("mx-auto px-4", w || "max-w-[1100px]")}>{children}</div></div>; }

export function EngineerDetail() {
  // Live: /engineers/{id} (id from the directory/network/messenger), trust reviews & score, connect/message/invite.
  const { user } = useAuth();
  const [id] = useState(() => new URLSearchParams(window.location.search).get("id") || sessionStorage.getItem("rap-person-id") || "");
  const q = useApi<any>(id ? `/engineers/${id}` : null);
  const p0 = q.data;
  const reviews = useApi<any[]>(p0?.user_id ? `/trust/reviews/${p0.user_id}` : null);
  const trust = useApi<any>(p0?.user_id ? `/trust/scores/${p0.user_id}` : null);
  const conns = useApi<any[]>(user ? "/connections" : null, { limit: 200 });
  const myJobs = useApi<any[]>(user?.role === "COMPANY" ? "/jobs/company" : null, { limit: 100 });
  const [t, setT] = useState("About");
  const [invOpen, setInvOpen] = useState(false);
  const [notice, setNotice] = useState("");
  if (!id || q.error) return <Wrap><Card c="rounded-xl p-10 text-center"><h2>Profile not found</h2><p className="mt-2 text-slate-500">This engineer profile isn’t available.</p><Btn c="mt-4" onClick={() => { window.location.hash = "engineers"; }}>Browse engineers</Btn></Card></Wrap>;
  if (!p0) return <Wrap><Card c="rounded-xl p-10 text-center text-slate-500">Loading profile…</Card></Wrap>;
  const p = { n: p0.full_name || "Engineer", t: p0.headline || p0.primary_role || "Engineer", loc: p0.location || "Remote", rate: p0.hourly_rate, skills: p0.skills || [], score: Math.round(p0.profile_score || 0) };
  const conn = (conns.data ?? []).find((c: any) => [c.sender_id, c.receiver_id].includes(p0.user_id));
  const connect = async () => { if (!user) { window.location.hash = "login"; return; } try { await api.post("/connections", { receiver_id: p0.user_id }); conns.reload(); setNotice("Connection request sent"); } catch (e) { setNotice(extractErrorMessage(e, "Couldn't send that request.")); } };
  const message = () => { if (!user) { window.location.hash = "login"; return; } sessionStorage.setItem("rap-contact-id", p0.user_id); window.location.hash = "messenger"; };
  const invite = async (jobId: string) => { try { await api.post(`/applications/jobs/${jobId}/invite/${p0.id}`); setNotice(`${p.n} was invited to apply`); } catch (e) { setNotice(extractErrorMessage(e, "Couldn't send that invitation.")); } setInvOpen(false); };
  const self = p0.user_id === user?.id;
  return (
    <Wrap>
      <Card p={false} c="overflow-hidden rounded-xl">
        <div className="h-44 bg-gradient-to-r from-[#031B4E] via-[#0552CC] to-[#5B9BFF]" />
        <div className="px-6 pb-4"><div className="-mt-14 flex flex-wrap items-end justify-between gap-3"><div className="rounded-full border-4 border-white"><Av name={p.n} s={112} /></div>{!self && <div className="flex gap-2"><Btn v={conn ? "gray" : "primary"} icon={conn ? "check" : "plus"} onClick={() => !conn && connect()}>{conn ? (conn.status === "ACCEPTED" ? "Connected" : "Pending") : "Connect"}</Btn>{user?.role === "COMPANY" && <Btn v="outline" onClick={() => setInvOpen(true)}>Invite to job</Btn>}<Btn v="gray" icon="chat" onClick={message}>Message</Btn></div>}</div>
          <h1 className="mt-3">{p.n}</h1><p className="text-slate-700">{p.t}</p><p className="text-sm text-slate-500">{[p.loc, p.rate != null ? `$${p.rate}/hr` : null, trust.data?.review_count ? `${trust.data.rating_avg.toFixed(1)}★ from ${trust.data.review_count} review${trust.data.review_count > 1 ? "s" : ""}` : null].filter(Boolean).join(" - ")}</p></div>
        <Tabs items={["About", "Experience", "Projects", "Reviews"]} v={t} set={setT} c="px-4" />
      </Card>
      <div className="mt-4 grid gap-4 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Card c="rounded-xl">
          {t === "About" && <><h3>About</h3><p className="mt-2 whitespace-pre-line text-slate-700">{p0.bio || "No summary yet."}</p><h3 className="mt-5">Skills</h3><div className="mt-2 flex flex-wrap gap-2">{p.skills.map((s: string) => <Tag key={s} t="blue">{s}</Tag>)}{!p.skills.length && <span className="text-sm text-slate-500">No skills listed.</span>}</div></>}
          {t === "Experience" && ((p0.experience || []).length ? p0.experience.map((e: any, i: number) => <div key={i} className="flex gap-3 border-b border-slate-200 py-3 last:border-0"><Lg name={e.company} s={44} r={8} /><div><p className="font-semibold">{e.title}</p><p className="text-sm text-slate-500">{e.company} - {e.start_date} – {e.is_current ? "Present" : e.end_date || "Present"}</p>{e.description && <p className="mt-1 text-sm text-slate-700">{e.description}</p>}</div></div>) : <p className="text-sm text-slate-500">No work history listed.</p>)}
          {t === "Projects" && ((p0.projects || []).length ? p0.projects.map((x: any, i: number) => <div key={i} className="border-b border-slate-200 py-3 last:border-0"><p className="font-semibold">{x.url ? <a href={x.url} target="_blank" rel="noopener noreferrer" className="text-[#0552CC] hover:underline">{x.title}</a> : x.title}</p><p className="text-sm text-slate-500">{x.description}</p>{(x.technologies || []).length > 0 && <p className="text-xs text-slate-500">{x.technologies.join(", ")}</p>}</div>) : <p className="text-sm text-slate-500">No projects listed.</p>)}
          {t === "Reviews" && ((reviews.data ?? []).length ? (reviews.data ?? []).map((r: any) => <div key={r.id} className="border-b border-slate-200 py-3 last:border-0"><Stars v={r.rating} /><p className="mt-1 text-sm text-slate-700">{r.comment}</p><p className="text-xs text-slate-500">{r.reviewer?.full_name || "Project partner"}</p></div>) : <p className="text-sm text-slate-500">No reviews yet.</p>)}
        </Card>
        <div className="space-y-4"><Card c="rounded-xl"><h3>AI profile summary</h3><p className="mt-2 text-sm text-slate-600">{p0.ai_summary || "No AI summary yet."}</p><div className="mt-3"><Bar v={p.score} c="bg-[#0552CC]" /><p className="mt-1 text-xs text-slate-500">Profile score {p.score}/100{trust.data ? ` · Trust score ${Math.round(trust.data.overall_score)}` : ""}</p></div></Card><Card c="rounded-xl"><h3>Availability</h3><p className="mt-1 text-sm text-slate-600">{[p0.availability, p0.remote_preference, p0.timezone].filter(Boolean).join(" - ") || "Not specified"}</p></Card></div>
      </div>
      <Modal open={invOpen} onClose={() => setInvOpen(false)} title={`Invite ${p.n} to apply`}>{(myJobs.data ?? []).filter((j: any) => j.is_active).length ? <div className="space-y-2">{(myJobs.data ?? []).filter((j: any) => j.is_active).map((j: any) => <button key={j.id} onClick={() => invite(j.id)} className="flex w-full items-center justify-between rounded-lg border border-slate-200 p-3 text-left hover:bg-slate-50"><b>{j.title}</b><Ic n="send" s={16} /></button>)}</div> : <p className="text-slate-500">Post a job first, then invite engineers to apply.</p>}</Modal>
      {notice && <button onClick={() => setNotice("")} className="v2-toast">{notice} · Dismiss</button>}
    </Wrap>
  );
}

export function JobDetail() {
  // Live: the selected job (/jobs/{id}), real match breakdown, save, Easy Apply.
  const { user } = useAuth();
  const eng = user?.role === "ENGINEER";
  const [id] = useState(() => new URLSearchParams(window.location.search).get("id") || localStorage.getItem("rap-selected-job") || "");
  const jq = useApi<any>(id ? `/jobs/${id}` : null);
  const mq = useApi<any>(eng && id ? `/matching/jobs/${id}` : null);
  const savedQ = useApi<any[]>(eng ? "/saved-jobs" : null, { limit: 100 });
  const appsQ = useApi<any[]>(eng ? "/applications/me" : null, { limit: 100 });
  const co = useApi<any>(jq.data?.company_id ? `/companies/${jq.data.company_id}` : null);
  const [apply, setApply] = useState(false);
  const [tab, setTab] = useState("Overview");
  const [cover, setCover] = useState("");
  const [notice, setNotice] = useState("");
  const j = jq.data;
  if (!id || jq.error) return <Wrap><Card c="rounded-xl p-10 text-center"><h2>This job isn’t available</h2><p className="mt-2 text-slate-500">It may have been filled or removed.</p><Btn c="mt-4" onClick={() => nav("jobs")}>Browse open roles</Btn></Card></Wrap>;
  if (!j) return <Wrap><Card c="rounded-xl p-10 text-center text-slate-500">Loading role…</Card></Wrap>;
  const fj = toFigmaJob(j);
  const saved = (savedQ.data ?? []).some((s: any) => s.id === j.id);
  const applied = (appsQ.data ?? []).some((a: any) => a.job.id === j.id && a.application.status !== "WITHDRAWN");
  const m = mq.data;
  const fit = m ? [["Skills", m.skill_score], ["Experience", m.experience_score], ["Timezone", m.timezone_score], ["Rate", m.compensation_score], ["Availability", m.availability_score]] : [];
  const toggleSave = async () => { await (saved ? api.delete(`/saved-jobs/${j.id}`) : api.post(`/saved-jobs/${j.id}`)); savedQ.reload(); };
  const startApply = () => { if (!user) { nav("login"); return; } if (!fj.easy && j.external_url) { window.open(j.external_url, "_blank", "noopener"); return; } setApply(true); };
  const submit = async () => { try { await api.post(`/applications/jobs/${j.id}`, { cover_note: cover.trim() || undefined }); setNotice("Application sent to " + fj.co); appsQ.reload(); } catch (e) { setNotice(extractErrorMessage(e, "We couldn't submit your application.")); } setApply(false); };
  return (
    <Wrap w="max-w-none">
      <div className="grid gap-4 grid-cols-1 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-4">
          <Card c="rounded-xl overflow-hidden" p="p-0">
            <div className="h-20 bg-gradient-to-r from-[#0552CC] to-[#0A7CFF]" />
            <div className="px-6 pb-5">
              <div className="-mt-8 flex flex-wrap items-end justify-between gap-3">
                <div className="flex items-start gap-4"><span className="flex h-16 w-16 items-center justify-center rounded-xl border-4 border-white bg-[#E8590C] text-2xl font-bold text-white">{fj.co.slice(0, 2).toUpperCase()}</span><div className="mt-10 pb-1"><h1 className="text-2xl font-bold">{fj.t}</h1><p className="text-sm text-slate-600">{fj.co} - {fj.loc} - Posted {fj.post}</p></div></div>
                <div className="flex gap-2">{applied ? <Btn v="gray" icon="check">Applied</Btn> : (!user || eng || !fj.easy) && <Btn v="primary" icon="send" onClick={startApply}>{!user ? "Sign in to apply" : fj.easy ? "Easy Apply" : "Apply on company site"}</Btn>}{eng && <Btn v={saved ? "gray" : "outline"} icon="bookmark" onClick={toggleSave}>{saved ? "Saved" : "Save"}</Btn>}</div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">{[fj.type, fj.lvl, fj.pay, j.is_remote === false ? "On-site" : "Remote"].filter(Boolean).map((x) => <Tag key={x} v="gray">{x}</Tag>)}{m && <Tag v="blue">{Math.round(m.overall_score)}% match</Tag>}</div>
            </div>
            <div className="flex gap-1 border-t border-slate-200 px-4">{["Overview", "Company"].map((x) => <button key={x} onClick={() => setTab(x)} className={cx("border-b-[3px] px-4 py-3 text-sm font-semibold", tab === x ? "border-[#0552CC] text-[#0552CC]" : "border-transparent text-slate-600 hover:bg-slate-50")}>{x}</button>)}</div>
          </Card>
          {tab === "Overview" && <Card c="rounded-xl" p="p-6"><h2 className="mb-2 text-xl font-bold">About the role</h2><p className="whitespace-pre-line text-slate-700">{j.description || "No description provided."}</p>{fj.tags.length > 0 && <><h3 className="mb-2 mt-5 text-[17px] font-bold">Skills</h3><div className="flex flex-wrap gap-2">{fj.tags.map((k) => <Tag key={k} v="gray">{k}</Tag>)}</div></>}</Card>}
          {tab === "Company" && <Card c="rounded-xl" p="p-6"><h2 className="mb-2 text-xl font-bold">{fj.co}</h2><p className="whitespace-pre-line text-slate-700">{co.data?.description || (fj.easy ? "This company hasn’t added a description yet." : `Listed on ${j.source}. See the original posting for company details.`)}</p>{co.data && <Btn v="outline" c="mt-4" onClick={() => { sessionStorage.setItem("rap-company-id", co.data.id); nav("company"); }}>View company page</Btn>}</Card>}
        </div>
        <div className="space-y-4">
          {eng && <Card c="rounded-xl" p="p-5"><h3 className="mb-3 font-bold">How you match</h3>{m ? <>{fit.map(([l, v]: any) => <div key={l} className="mt-2"><div className="flex justify-between text-xs text-slate-600"><span>{l}</span><span>{Math.round(v)}%</span></div><Bar v={v} c="bg-[#0552CC]" /></div>)}{m.reasoning && <p className="mt-3 text-sm text-slate-600">{m.reasoning}</p>}</> : <p className="text-sm text-slate-600">{mq.loading ? "Calculating your match…" : "Complete your professional profile to see how you match this role."}</p>}</Card>}
          <Card c="rounded-xl" p="p-5"><h3 className="font-bold">Source</h3><p className="mt-1 text-sm text-slate-600">{fj.easy ? "Posted on Remote AI Platform" : `Aggregated from ${j.source}`}</p></Card>
        </div>
      </div>
      <Modal open={apply} onClose={() => setApply(false)} title={"Apply to " + fj.co}><Field label="Cover note (optional)"><textarea rows={5} maxLength={2000} value={cover} onChange={(e) => setCover(e.target.value)} className={cx(inputCls, "h-auto py-2")} placeholder="Why you are a strong fit" /></Field><p className="mt-2 text-xs text-slate-500">The company sees your profile, resume and contact email.</p><div className="mt-5 flex justify-end gap-2"><Btn v="gray" onClick={() => setApply(false)}>Cancel</Btn><Btn onClick={submit}>Submit application</Btn></div></Modal>
      {notice && <button onClick={() => setNotice("")} className="v2-toast">{notice} · Dismiss</button>}
    </Wrap>
  );
}

export function ContractSign() {
  const [signed, setSigned] = useState(false);
  return (
    <Wrap w="max-w-[900px]">
      <Card c="rounded-xl"><div className="flex items-center justify-between"><div><h1>Contract offer</h1><p className="text-sm text-slate-500">RC-2291 - from Brightpath</p></div><Tag t={signed ? "green" : "amber"}>{signed ? "Signed" : "Awaiting signature"}</Tag></div>
        <div className="mt-4 grid gap-3 grid-cols-1 md:grid-cols-3">{[["Type", "Fixed price"], ["Total", "$18,400"], ["Duration", "3 months"]].map((s) => <div key={s[0]} className="rounded-lg bg-slate-100 p-3"><p className="text-xs text-slate-500">{s[0]}</p><p className="font-bold">{s[1]}</p></div>)}</div>
        <h3 className="mt-5">Scope</h3><p className="mt-1 text-slate-700">Migrate the legacy warehouse to Databricks with Delta Live Tables, Unity Catalog governance and CDC ingestion.</p>
        <h3 className="mt-5">Milestones</h3>{[["Discovery and architecture", "$4,000"], ["Ingestion and CDC pipelines", "$6,200"], ["Unity Catalog and governance", "$5,000"], ["Cutover and handover", "$3,200"]].map((m, i) => <div key={m[0]} className="mt-2 flex items-center gap-3 rounded-lg border border-slate-200 p-3"><span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#E8F0FC] text-sm font-bold text-[#0552CC]">{i + 1}</span><span className="flex-1">{m[0]}</span><b>{m[1]}</b></div>)}
        <div className="mt-5 flex items-center gap-2 rounded-lg bg-[#E8F0FC] p-3 text-sm text-[#0552CC]"><Ic n="shieldcheck" s={18} />Each milestone is funded into escrow and released only when the client approves.</div>
        <div className="mt-5 flex justify-end gap-2"><Btn v="gray">Decline</Btn><Btn v="primary" onClick={() => setSigned(true)}>{signed ? "Signed" : "Sign digitally"}</Btn></div></Card>
    </Wrap>
  );
}

const FINDINGS = [
  ["High", "Hard-coded credential in config loader", "src/config/loader.ts:42", "Move the secret to environment variables and rotate the key."],
  ["Medium", "Unbounded retry loop in webhook handler", "src/webhooks/retry.ts:88", "Add exponential backoff with a maximum attempt count."],
  ["Medium", "Missing input validation on milestone amount", "src/api/milestones.ts:31", "Validate positive decimal amounts before escrow funding."],
  ["Low", "Duplicate helper functions across modules", "src/utils/*.ts", "Extract shared helpers into one utility module."],
  ["Low", "Test coverage below target for payouts", "src/payouts/", "Add tests for partial release and refund paths."],
];

export function Workspace() {
  const [tasks, setTasks] = useState([["Review reranker eval report", true], ["Push CDC connector PR", false], ["Reply to Brightpath on milestone 3", false], ["Update time log", false]]);
  const [run, setRun] = useState(false);
  const [secs, setSecs] = useState(0);
  useEffect(() => { if (!run) return; const t = setInterval(() => setSecs((x) => x + 1), 1000); return () => clearInterval(t); }, [run]);
  const clock = String(Math.floor(secs / 3600)).padStart(2, "0") + ":" + String(Math.floor((secs % 3600) / 60)).padStart(2, "0") + ":" + String(secs % 60).padStart(2, "0");
  return (
    <Wrap w="max-w-none">
      <div className="mb-4"><h1 className="text-2xl font-bold">My workspace</h1><p className="text-sm text-slate-500">Active contracts, tasks and time in one place</p></div>
      <div className="mb-4 grid grid-cols-2 gap-3 xl:grid-cols-4">{[["Hours this week", "31.5 h", "Target 40 h"], ["Active contracts", "3", "1 awaiting review"], ["Next payout", "USD 3,200", "Fri, Sep 26"], ["Client rating", "4.9", "48 reviews"]].map((x) => <Card key={x[0]} c="rounded-xl" p="p-4"><p className="text-sm text-slate-500">{x[0]}</p><p className="text-2xl font-bold">{x[1]}</p><p className="text-sm text-[#0552CC]">{x[2]}</p></Card>)}</div>
      <div className="grid gap-4 grid-cols-1 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-4">
          <Card c="rounded-xl" p="p-5"><div className="mb-3 flex items-center justify-between"><h2 className="text-[17px] font-bold">Today</h2><span className="text-sm text-slate-500">{tasks.filter((t: any) => t[1]).length} of {tasks.length} done</span></div>
            {tasks.map((t: any, i: number) => <label key={t[0]} className="flex items-center gap-3 border-t border-slate-100 py-3 text-[15px]"><input type="checkbox" checked={t[1]} onChange={() => setTasks(tasks.map((x: any, j: number) => (j === i ? [x[0], !x[1]] : x)))} /><span className={t[1] ? "text-slate-400 line-through" : ""}>{t[0]}</span></label>)}</Card>
          <Card c="rounded-xl" p="p-5"><h2 className="mb-3 text-[17px] font-bold">Active contracts</h2>
            {[["Databricks lakehouse migration", "Brightpath", 68, "Milestone 3 in review"], ["RAG platform delivery sprint", "Helix Labs", 42, "Weekly retainer active"], ["LLM evaluation audit", "Northstar Cloud", 12, "Awaiting kickoff"]].map((c: any) => <div key={c[0]} className="flex items-center gap-4 border-t border-slate-100 py-3"><Lg name={c[1]} s={44} /><div className="min-w-0 flex-1"><button onClick={() => nav("contracts")} className="text-[15px] font-semibold text-[#0552CC] hover:underline">{c[0]}</button><p className="text-sm text-slate-500">{c[1]} - {c[3]}</p><div className="mt-1 h-2 rounded-full bg-slate-100"><div className="h-2 rounded-full bg-[#0552CC]" style={{ width: c[2] + "%" }} /></div></div><span className="text-sm font-semibold">{c[2]}%</span></div>)}</Card>
        </div>
        <div className="space-y-4">
          <Card c="rounded-xl" p="p-5"><h2 className="mb-2 text-[17px] font-bold">Time tracker</h2><p className="text-4xl font-bold tabular-nums">{clock}</p><p className="mb-3 text-sm text-slate-500">Databricks lakehouse migration</p><div className="flex gap-2"><Btn v={run ? "danger" : "primary"} icon={run ? "clock" : "play"} full onClick={() => setRun(!run)}>{run ? "Stop" : "Start timer"}</Btn><Btn v="gray" onClick={() => { setRun(false); setSecs(0); }}>Reset</Btn></div></Card>
          <Card c="rounded-xl" p="p-5"><h2 className="mb-2 text-[17px] font-bold">Upcoming</h2>{[["Kickoff call - Brightpath", "Today 15:00", "calendar"], ["Milestone 3 review", "Fri 10:00", "check"], ["Weekly sync - Helix Labs", "Mon 09:30", "users"]].map((x: any) => <div key={x[0]} className="flex items-center gap-3 py-2"><span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#E8F0FC] text-[#0552CC]"><Ic n={x[2]} s={18} /></span><div><p className="text-sm font-semibold">{x[0]}</p><p className="text-xs text-slate-500">{x[1]}</p></div></div>)}</Card>
        </div>
      </div>
    </Wrap>
  );
}

export function Quality() {
  const [url, setUrl] = useState("https://github.com/gokul-227/remote-ai-platform");
  const [state, setState] = useState("idle");
  const start = () => { setState("run"); setTimeout(() => setState("done"), 1800); };
  const cats = [["Correctness", 91], ["Security", 74], ["Maintainability", 86], ["Test coverage", 68], ["Performance", 89]];
  const sev: any = { High: "red", Medium: "amber", Low: "gray" };
  return (
    <Wrap w="max-w-none">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3"><div><h1 className="text-2xl font-bold">AI code quality review</h1><p className="text-sm text-slate-500">Paste a repository or snippet for an explainable evaluation report</p></div>{state === "done" && <Btn v="outline" icon="download">Export report</Btn>}</div>
      <Card c="mb-4 rounded-xl" p="p-4"><div className="flex flex-wrap gap-2"><input value={url} onChange={(e) => setUrl(e.target.value)} className={cx(inputCls, "flex-1")} style={{ minWidth: 240 }} /><Btn v="primary" icon="spark" onClick={start}>{state === "run" ? "Reviewing..." : "Run review"}</Btn></div></Card>
      {state === "idle" && <Card c="rounded-xl" p="p-10"><div className="text-center text-slate-500"><span className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-[#E8F0FC] text-[#0552CC]"><Ic n="code" s={26} /></span><p className="font-semibold text-slate-900">No review yet</p><p className="text-sm">Run a review to see scores, findings and suggested fixes.</p></div></Card>}
      {state === "run" && <Card c="rounded-xl" p="p-10"><div className="text-center"><div className="mx-auto mb-3 h-10 w-10 animate-spin rounded-full border-4 border-[#E8F0FC] border-t-[#0552CC]" /><p className="font-semibold">Analyzing 214 files...</p><p className="text-sm text-slate-500">Static analysis, dependency audit and AI review</p></div></Card>}
      {state === "done" && (
        <div className="grid gap-4 grid-cols-1 xl:grid-cols-[320px_minmax(0,1fr)]">
          <div className="space-y-4">
            <Card c="rounded-xl" p="p-5"><p className="text-sm text-slate-500">Overall quality score</p><p className="text-5xl font-bold text-[#0552CC]">82<span className="text-xl text-slate-400">/100</span></p><p className="text-sm text-slate-600">Above 71% of reviewed repositories</p></Card>
            <Card c="rounded-xl" p="p-5"><p className="mb-3 text-[17px] font-bold">Category scores</p>{cats.map((c: any) => <div key={c[0]} className="mb-3"><div className="flex justify-between text-sm"><span>{c[0]}</span><span className="font-semibold">{c[1]}</span></div><div className="h-2 rounded-full bg-slate-100"><div className="h-2 rounded-full bg-[#0552CC]" style={{ width: c[1] + "%" }} /></div></div>)}</Card>
          </div>
          <div className="space-y-4">
            <Card c="rounded-xl bg-[#F3F0FF]" p="p-5"><p className="mb-1 flex items-center gap-2 font-bold text-[#5B4BDB]"><Ic n="spark" s={16} />AI summary</p><p className="text-slate-700">Solid architecture with clear module boundaries. Priority is removing the hard-coded credential and adding validation on financial inputs. Test coverage on payout paths is the largest quality gap.</p></Card>
            <Card c="rounded-xl" p="p-0"><div className="border-b border-slate-200 p-4"><p className="text-[17px] font-bold">Findings ({FINDINGS.length})</p></div>
              {FINDINGS.map((f: any) => <div key={f[1]} className="flex flex-wrap items-start gap-3 border-b border-slate-100 p-4 last:border-0"><Tag v={sev[f[0]]}>{f[0]}</Tag><div className="min-w-0 flex-1"><p className="font-semibold">{f[1]}</p><p className="font-mono text-xs text-slate-500">{f[2]}</p><p className="mt-1 text-sm text-slate-600">{f[3]}</p></div></div>)}</Card>
          </div>
        </div>
      )}
    </Wrap>
  );
}

export function Security() {
  // Live: trust score, verifications (request + status), sign out everywhere. Controls with no backend are not shown.
  const { user, logout } = useAuth();
  const trust = useApi<any>(user ? `/trust/scores/${user.id}` : null);
  const ver = useApi<any[]>(user ? `/trust/verifications/${user.id}` : null);
  const [notice, setNotice] = useState("");
  const TYPES = [["IDENTITY", "Identity", "Confirm who you are with a government ID"], ["GITHUB", "GitHub", "Link your GitHub account and public work"], ["LINKEDIN", "LinkedIn", "Link your professional history"], ["SKILL_ASSESSMENT", "Skill assessment", "Have your key skills assessed"]];
  const status = (t: string) => (ver.data ?? []).find((v: any) => v.verification_type === t)?.status;
  const request = async (t: string) => { try { await api.post("/trust/verifications", { verification_type: t }); ver.reload(); setNotice("Verification requested — we’ll review it shortly."); } catch (e) { setNotice(extractErrorMessage(e, "Couldn't request that verification.")); } };
  const signOutAll = async () => { try { await api.post("/auth/logout-all"); } catch {} logout(); nav("login"); };
  const verified = (ver.data ?? []).filter((v: any) => v.status === "VERIFIED").length;
  if (!user) return <Wrap><Card c="rounded-xl p-10 text-center"><h2>Sign in to manage your security</h2><Btn c="mt-4" onClick={() => nav("login")}>Sign in</Btn></Card></Wrap>;
  return (
    <Wrap w="max-w-none">
      <div className="mb-4"><h1 className="text-2xl font-bold">Security and trust</h1><p className="text-sm text-slate-500">Protect your account and build trust with verified credentials</p></div>
      <div className="mb-4 grid grid-cols-2 gap-3 xl:grid-cols-4">{[["Trust score", trust.data ? `${Math.round(trust.data.overall_score)} / 100` : "—", "shieldcheck"], ["Verifications", `${verified} of ${TYPES.length}`, "check"], ["Reviews", String(trust.data?.review_count ?? 0), "star"], ["Sign-in", "Email code / SSO", "lock"]].map((x: any) => <Card key={x[0]} c="rounded-xl" p="p-4"><div className="flex items-center justify-between text-slate-500"><span className="text-sm">{x[0]}</span><Ic n={x[2]} s={18} c="text-[#0552CC]" /></div><p className="mt-1 text-2xl font-bold">{x[1]}</p></Card>)}</div>
      <div className="grid gap-4 grid-cols-1 xl:grid-cols-2">
        <Card c="rounded-xl" p="p-5"><h2 className="mb-2 text-[17px] font-bold">Verifications</h2>
          {TYPES.map(([k, l, d]) => { const st = status(k); return <div key={k} className="flex items-center gap-3 border-t border-slate-100 py-3"><div className="flex-1"><p className="font-semibold">{l}</p><p className="text-sm text-slate-500">{d}</p></div>{st ? <Tag v={st === "VERIFIED" ? "green" : "gray"}>{st.charAt(0) + st.slice(1).toLowerCase()}</Tag> : <Btn v="outline" sm onClick={() => request(k)}>Request</Btn>}</div>; })}</Card>
        <Card c="rounded-xl" p="p-5"><h2 className="mb-2 text-[17px] font-bold">Where you are signed in</h2>
          <div className="flex items-center gap-3 border-t border-slate-100 py-3"><span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#E8F0FC] text-[#0552CC]"><Ic n="lock" s={18} /></span><div className="flex-1"><p className="font-semibold">This browser</p><p className="text-sm text-slate-500">{user.email}</p></div><Tag v="blue">This device</Tag></div>
          <p className="border-t border-slate-100 pt-3 text-sm text-slate-500">Signed in somewhere you don’t recognise? End every session at once.</p><Btn v="outline" c="mt-3" onClick={signOutAll}>Sign out everywhere</Btn></Card>
        <Card c="rounded-xl" p="p-5"><h2 className="mb-2 text-[17px] font-bold">How trust is calculated</h2>
          {((trust.data?.score_breakdown?.factors) ?? []).map((f: any) => <div key={f.category} className="flex justify-between border-t border-slate-100 py-3 text-sm"><span className="font-medium">{f.category}<span className="block text-xs font-normal text-slate-500">{f.detail}</span></span><span className="text-slate-500">{f.points} / {f.max}</span></div>)}{!(trust.data?.score_breakdown?.factors ?? []).length && <p className="text-sm text-slate-500">Your trust score builds as you complete verifications and deliver reviewed work.</p>}</Card>
        <Card c="rounded-xl" p="p-5"><h2 className="mb-2 text-[17px] font-bold">How we protect you</h2>
          {[["Escrow-backed payments", "Funds are held until milestones are approved.", "wallet"], ["Audit logging", "Sensitive admin actions are recorded.", "history"], ["Verified profiles", "Request identity and skill verification above.", "shieldcheck"], ["Passwordless sign-in", "Email codes and SSO — no password to leak.", "lock"]].map((x: any) => <div key={x[0]} className="flex items-start gap-3 border-t border-slate-100 py-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#E8F0FC] text-[#0552CC]"><Ic n={x[2]} s={18} /></span><div><p className="font-semibold">{x[0]}</p><p className="text-sm text-slate-500">{x[1]}</p></div></div>)}</Card>
      </div>
      {notice && <button onClick={() => setNotice("")} className="v2-toast">{notice} · Dismiss</button>}
    </Wrap>
  );
}

export function Search() {
  // Live: /search (jobs, people, companies) for the query typed in the top bar.
  const [q0, setQ0] = useState(() => new URLSearchParams(window.location.search).get("q") || sessionStorage.getItem("rap-search") || "");
  useEffect(() => { const f = () => setQ0(sessionStorage.getItem("rap-search") || ""); window.addEventListener("rap-search", f); return () => window.removeEventListener("rap-search", f); }, []);
  const [t, setT] = useState("All");
  const r = useApi<any>(q0.trim().length > 1 ? "/search" : null, { q: q0.trim(), limit: 20 });
  const d = r.data || { jobs: [], engineers: [], companies: [] };
  const show = (x: string) => t === "All" || t === x;
  return (
    <Wrap w="max-w-[900px]">
      <h1 className="mb-3">{q0 ? `Results for "${q0}"` : "Search"}</h1><Tabs items={["All", "Jobs", "People", "Companies"]} v={t} set={setT} />
      <div className="mt-4 space-y-3">{r.loading && <Card c="rounded-xl"><p className="text-slate-500">Searching…</p></Card>}{!q0 && <Card c="rounded-xl"><p className="text-slate-500">Type at least two characters in the search bar.</p></Card>}
        {show("Jobs") && d.jobs.map((j: any) => <Card key={j.id} c="rounded-xl"><button className="flex w-full items-center gap-3 text-left" onClick={() => { localStorage.setItem("rap-selected-job", j.id); nav("jobdetail"); }}><Lg name={j.company_name || j.title} s={44} r={8} /><div className="flex-1"><p className="font-semibold text-[#0552CC]">{j.title}</p><p className="text-sm text-slate-500">{j.company_name} - {j.location || "Remote"}</p></div><Tag t="gray">Job</Tag></button></Card>)}
        {show("People") && d.engineers.map((p: any) => <Card key={p.id} c="rounded-xl"><button className="flex w-full items-center gap-3 text-left" onClick={() => { sessionStorage.setItem("rap-person-id", p.id); nav("engineer"); }}><Av name={p.full_name || "Engineer"} s={44} /><div className="flex-1"><p className="font-semibold text-[#0552CC]">{p.full_name || "Engineer"}</p><p className="text-sm text-slate-500">{p.headline || p.primary_role}</p></div><Tag t="gray">Person</Tag></button></Card>)}
        {show("Companies") && (d.companies || []).map((c: any) => <Card key={c.id} c="rounded-xl"><button className="flex w-full items-center gap-3 text-left" onClick={() => { sessionStorage.setItem("rap-company-id", c.id); nav("company"); }}><Lg name={c.name} s={44} r={8} /><p className="flex-1 font-semibold text-[#0552CC]">{c.name}</p><Tag t="gray">Company</Tag></button></Card>)}
        {r.data && !d.jobs.length && !d.engineers.length && !(d.companies || []).length && <Card c="rounded-xl"><p className="text-slate-500">No results for “{q0}”. Try a broader keyword.</p></Card>}
      </div>
    </Wrap>
  );
}

export function CoProfile() {
  // Live: loads and saves the real company profile (creates it on first save).
  const [f, setF] = useState({ name: "", industry: "", company_size: "11-50", location: "", website: "", description: "", logo_url: "" });
  const [exists, setExists] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [logoEdit, setLogoEdit] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const set = (k: string, v: string) => setF((c) => ({ ...c, [k]: v }));
  useEffect(() => {
    api.get("/companies/me").then((r) => { const d = r.data; setExists(true); setF({ name: d.name || "", industry: d.industry || "", company_size: d.company_size || "11-50", location: d.location || "", website: d.website || "", description: d.description || "", logo_url: d.logo_url || "" }); })
      .catch(() => {}).finally(() => setLoading(false));
  }, []);
  const save = async () => {
    if (!f.name.trim()) { setMsg({ ok: false, text: "Enter your organization’s name." }); return; }
    setBusy(true); setMsg(null);
    const body = { name: f.name.trim(), industry: f.industry.trim() || null, company_size: f.company_size, location: f.location.trim() || null, website: f.website.trim() || null, description: f.description.trim() || null, logo_url: f.logo_url.trim() || null };
    try { await (exists ? api.put("/companies/me", body) : api.post("/companies/me", body)); setExists(true); setMsg({ ok: true, text: "Company profile saved." }); }
    catch (e) { setMsg({ ok: false, text: extractErrorMessage(e, "We couldn't save your company profile.") }); }
    finally { setBusy(false); }
  };
  return (
    <Wrap w="max-w-[900px]">
      <div className="mb-4"><h1>Company profile</h1><p className="text-sm text-slate-500">{exists ? "This is how candidates see your organization" : "Set up your organization so candidates can learn about your team"}</p></div>
      {loading ? <Card c="rounded-xl"><p className="text-slate-500">Loading…</p></Card> :
      <Card c="rounded-xl"><div className="mb-4 flex flex-wrap items-center gap-4">{f.logo_url ? <img src={f.logo_url} alt="" className="h-[72px] w-[72px] rounded-[14px] object-contain" /> : <Lg name={f.name || "Company"} s={72} r={14} />}<Btn v="outline" onClick={() => setLogoEdit(!logoEdit)}>Change logo</Btn>{logoEdit && <input aria-label="Logo URL" placeholder="https://… logo image URL" value={f.logo_url} onChange={(e) => set("logo_url", e.target.value)} className={cx(inputCls, "max-w-sm")} />}</div><div className="grid gap-3 grid-cols-1 md:grid-cols-2"><Field label="Organization name"><input value={f.name} onChange={(e) => set("name", e.target.value)} className={inputCls} /></Field><Field label="Industry"><input value={f.industry} onChange={(e) => set("industry", e.target.value)} className={inputCls} /></Field><Field label="Size"><select value={f.company_size} onChange={(e) => set("company_size", e.target.value)} className={inputCls}>{["1-10", "11-50", "51-200", "201-500", "500+"].map((x) => <option key={x}>{x}</option>)}</select></Field><Field label="Location"><input value={f.location} onChange={(e) => set("location", e.target.value)} className={inputCls} /></Field><Field label="Website"><input value={f.website} onChange={(e) => set("website", e.target.value)} placeholder="https://" className={inputCls} /></Field></div><div className="mt-3"><Field label="Description"><textarea rows={4} value={f.description} onChange={(e) => set("description", e.target.value)} className={cx(inputCls, "h-auto py-2")} /></Field></div>{msg && <p role={msg.ok ? "status" : "alert"} className={cx("mt-3 text-sm", msg.ok ? "text-green-700" : "text-red-600")}>{msg.text}</p>}<Btn v="primary" c="mt-4" onClick={save}>{busy ? "Saving…" : exists ? "Save profile" : "Create company profile"}</Btn></Card>}
    </Wrap>
  );
}

const LEGAL: Record<string, [string, string[]]> = {
  terms: ["Terms of Service", ["Using Remote-AI-Platform", "Accounts and eligibility", "Contracts, escrow and payments", "Acceptable use", "Termination", "Liability"]],
  privacy: ["Privacy Policy", ["Data we collect", "How we use AI on your data", "Sharing and processors", "Retention", "Your rights (GDPR)", "Contact"]],
  impressum: ["Impressum", ["Provider", "Contact", "Responsible for content", "Dispute resolution"]],
};
export function Legal({ kind }: { kind: string }) {
  const d = LEGAL[kind] || LEGAL.terms;
  return (
    <Wrap w="max-w-[860px]"><Card c="rounded-xl"><h1>{d[0]}</h1><p className="mt-1 text-sm text-slate-500">Last updated September 2026</p>{d[1].map((s, i) => <div key={s} className="mt-5"><h3>{i + 1}. {s}</h3><p className="mt-1 text-slate-600">Remote-AI-Platform describes this section in plain language here. Replace with your final legal copy before launch.</p></div>)}</Card></Wrap>
  );
}
export const Terms = () => <Legal kind="terms" />;
export const Privacy = () => <Legal kind="privacy" />;
export const Impressum = () => <Legal kind="impressum" />;

export function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center bg-[#F0F2F5] p-6 text-center"><span className="flex h-20 w-20 items-center justify-center rounded-full bg-[#E8F0FC] text-[#0552CC]"><Ic n="compass" s={36} /></span><h1 className="mt-5">This page is not available</h1><p className="mt-1 max-w-md text-slate-500">The link may be broken or the page may have been removed.</p><Btn v="primary" c="mt-5" onClick={() => nav("feed")}>Go to feed</Btn></div>
  );
}

export function GroupDetail() {
  // Live: the Figma group view for the group chosen elsewhere (feed, search, links).
  return <Groups initial={new URLSearchParams(window.location.search).get("id") || sessionStorage.getItem("rap-group-id")} />;
}
