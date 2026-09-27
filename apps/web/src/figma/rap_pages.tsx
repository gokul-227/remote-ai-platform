import { useState, useEffect } from "react";
import { IMPRESSUM, LAST_UPDATED, PRIVACY, TERMS, type Block, type Section } from "./legal_content";
import api, { extractErrorMessage } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useApi, toFigmaJob, goRoute } from "./live";
import { Groups } from "./rap_social";
import { Ic, Av, Lg, Btn, Card, Tag, Tabs, Bar, Stars, Modal, cx, Field, inputCls } from "./rap_kit";

const nav = (h: string) => { goRoute(h); };
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
  if (!id || q.error) return <Wrap><Card c="rounded-xl p-10 text-center"><h2>Profile not found</h2><p className="mt-2 text-slate-500">This profile isn’t available.</p><Btn c="mt-4" onClick={() => { goRoute("engineers"); }}>Browse professionals</Btn></Card></Wrap>;
  if (!p0) return <Wrap><Card c="rounded-xl p-10 text-center text-slate-500">Loading profile…</Card></Wrap>;
  const p = { n: p0.full_name || "Professional", t: p0.headline || p0.primary_role || "Professional", loc: p0.location || "Remote", rate: p0.hourly_rate, skills: p0.skills || [], score: Math.round(p0.profile_score || 0) };
  const conn = (conns.data ?? []).find((c: any) => [c.sender_id, c.receiver_id].includes(p0.user_id));
  const connect = async () => { if (!user) { goRoute("login"); return; } try { await api.post("/connections", { receiver_id: p0.user_id }); conns.reload(); setNotice("Connection request sent"); } catch (e) { setNotice(extractErrorMessage(e, "Couldn't send that request.")); } };
  const message = () => { if (!user) { goRoute("login"); return; } sessionStorage.setItem("rap-contact-id", p0.user_id); goRoute("messenger"); };
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
        <div className="space-y-4">{/* ai_summary / profile_score are private to the owner (and admins); other viewers only get the trust score. */}{(p0.ai_summary != null || p0.profile_score != null || trust.data) && <Card c="rounded-xl">{p0.ai_summary != null && <><h3>AI profile summary</h3><p className="mt-2 text-sm text-slate-600">{p0.ai_summary}</p></>}{p0.profile_score != null && <div className="mt-3"><Bar v={p.score} c="bg-[#0552CC]" /><p className="mt-1 text-xs text-slate-500">Profile completeness {p.score}/100</p></div>}{trust.data && <p className="mt-2 text-xs text-slate-500">Trust score {Math.round(trust.data.overall_score)}</p>}</Card>}<Card c="rounded-xl"><h3>Availability</h3><p className="mt-1 text-sm text-slate-600">{[p0.availability, p0.remote_preference, p0.timezone].filter(Boolean).join(" - ") || "Not specified"}</p></Card></div>
      </div>
      <Modal open={invOpen} onClose={() => setInvOpen(false)} title={`Invite ${p.n} to apply`}>{(myJobs.data ?? []).filter((j: any) => j.is_active).length ? <div className="space-y-2">{(myJobs.data ?? []).filter((j: any) => j.is_active).map((j: any) => <button key={j.id} onClick={() => invite(j.id)} className="flex w-full items-center justify-between rounded-lg border border-slate-200 p-3 text-left hover:bg-slate-50"><b>{j.title}</b><Ic n="send" s={16} /></button>)}</div> : <p className="text-slate-500">Post a job first, then invite professionals to apply.</p>}</Modal>
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
  const startApply = () => { if (!user) { nav("login"); return; } if (!fj.easy) { if (j.external_url) window.open(j.external_url, "_blank", "noopener"); else setNotice("This listing was imported from another job board and has no application link. Apply on the original board."); return; } setApply(true); };
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
  // Live: review and sign (or decline) a contract offer — /contracts/{id}, /sign, /terminate.
  const { user } = useAuth();
  const [id] = useState(() => new URLSearchParams(window.location.search).get("id") || sessionStorage.getItem("rap-contract-id") || "");
  const q = useApi<any>(id ? `/contracts/${id}` : null);
  const [notice, setNotice] = useState("");
  const c = q.data;
  if (!id || q.error) return <Wrap w="max-w-[900px]"><Card c="rounded-xl p-10 text-center"><h2>Contract not found</h2><Btn c="mt-4" onClick={() => nav("contracts")}>Go to contracts</Btn></Card></Wrap>;
  if (!c) return <Wrap w="max-w-[900px]"><Card c="rounded-xl p-10 text-center text-slate-500">Loading contract…</Card></Wrap>;
  const mine = c.client_id === user?.id ? c.client_signed_at : c.worker_signed_at;
  const from = c.client_id === user?.id ? c.worker?.full_name : c.client?.full_name;
  const total = c.milestones?.length ? c.milestones.reduce((a: number, m: any) => a + m.amount, 0) : c.rate_amount;
  const fmt = (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: c.currency || "USD", maximumFractionDigits: 0 }).format(n);
  const dur = c.start_date && c.end_date ? `${Math.max(1, Math.round((+new Date(c.end_date) - +new Date(c.start_date)) / 2629800000))} months` : "Open-ended";
  const act = async (path: string, ok: string) => { try { await api.post(path); q.reload(); setNotice(ok); } catch (e) { setNotice(extractErrorMessage(e, "That didn't work. Please try again.")); } };
  const ended = ["COMPLETED", "TERMINATED"].includes(c.status);
  return (
    <Wrap w="max-w-[900px]">
      <Card c="rounded-xl"><div className="flex items-center justify-between"><div><h1>Contract offer</h1><p className="text-sm text-slate-500">{c.title}{from ? ` - with ${from}` : ""}</p></div><Tag t={c.status === "ACTIVE" ? "green" : ended ? "gray" : "amber"}>{c.status === "ACTIVE" ? "Active" : ended ? c.status.charAt(0) + c.status.slice(1).toLowerCase() : mine ? "Waiting for the other party" : "Awaiting your signature"}</Tag></div>
        <div className="mt-4 grid gap-3 grid-cols-1 md:grid-cols-3">{[["Type", c.rate_type === "FIXED" ? "Fixed price" : c.rate_type === "HOURLY" ? `Hourly - ${fmt(c.rate_amount)}/hr` : `Monthly - ${fmt(c.rate_amount)}`], ["Total", fmt(total)], ["Duration", dur]].map((s) => <div key={s[0]} className="rounded-lg bg-slate-100 p-3"><p className="text-xs text-slate-500">{s[0]}</p><p className="font-bold">{s[1]}</p></div>)}</div>
        <h3 className="mt-5">Scope</h3><p className="mt-1 whitespace-pre-line text-slate-700">{c.scope_description}</p>
        {c.terms && <><h3 className="mt-5">Terms</h3><p className="mt-1 whitespace-pre-line text-slate-700">{c.terms}</p></>}
        {(c.milestones || []).length > 0 && <><h3 className="mt-5">Milestones</h3>{c.milestones.map((m: any, i: number) => <div key={m.id} className="mt-2 flex items-center gap-3 rounded-lg border border-slate-200 p-3"><span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#E8F0FC] text-sm font-bold text-[#0552CC]">{i + 1}</span><span className="flex-1">{m.title}</span><b>{fmt(m.amount)}</b></div>)}</>}
        <div className="mt-5 flex items-center gap-2 rounded-lg bg-[#E8F0FC] p-3 text-sm text-[#0552CC]"><Ic n="shieldcheck" s={18} />Each milestone is approved by the client before its payment is released.</div>
        {!ended && <div className="mt-5 flex justify-end gap-2">{!mine && <Btn v="gray" onClick={() => { if (window.confirm("Decline this contract?")) act(`/contracts/${c.id}/terminate`, "Contract declined"); }}>Decline</Btn>}<Btn v="primary" onClick={() => !mine && act(`/contracts/${c.id}/sign`, "Contract signed")}>{mine ? "Signed" : "Sign digitally"}</Btn></div>}</Card>
      {notice && <button onClick={() => setNotice("")} className="v2-toast">{notice} · Dismiss</button>}
    </Wrap>
  );
}

export function Workspace() {
  // Live: my tasks, active contracts, offers, reputation; the timer logs real time to a task's work ledger.
  const { user } = useAuth();
  const eng = user?.role === "ENGINEER";
  const tasksQ = useApi<any[]>(eng ? "/projects/my-tasks" : null);
  const offersQ = useApi<any[]>(eng ? "/projects/my-offers" : null);
  const contractsQ = useApi<any[]>(user ? "/contracts/me" : null);
  const repQ = useApi<any>(eng ? `/projects/reputation/${user!.id}` : null);
  const projectsQ = useApi<any[]>(!eng && user ? "/projects" : null);
  const [run, setRun] = useState(false);
  const [secs, setSecs] = useState(0);
  const [taskId, setTaskId] = useState("");
  const [note, setNote] = useState("");
  const [notice, setNotice] = useState("");
  useEffect(() => { if (!run) return; const t = setInterval(() => setSecs((x) => x + 1), 1000); return () => clearInterval(t); }, [run]);
  const clock = String(Math.floor(secs / 3600)).padStart(2, "0") + ":" + String(Math.floor((secs % 3600) / 60)).padStart(2, "0") + ":" + String(secs % 60).padStart(2, "0");
  const tasks = (tasksQ.data ?? []).filter((t: any) => t.task.status !== "COMPLETED");
  const active = (contractsQ.data ?? []).filter((c: any) => c.status === "ACTIVE");
  const pendingOffers = (offersQ.data ?? []).filter((o: any) => o.offer.status === "OFFERED").length;
  const prog = (c: any) => (c.milestones?.length ? Math.round((c.milestones.filter((m: any) => ["APPROVED", "PAID"].includes(m.status)).length / c.milestones.length) * 100) : 0);
  const logTime = async () => { const minutes = Math.max(1, Math.round(secs / 60)); if (!taskId) { setNotice("Choose the task you worked on."); return; } try { await api.post(`/projects/tasks/${taskId}/ledger`, { duration_minutes: Math.min(minutes, 1440), description: note.trim() || "Tracked with the workspace timer" }); setRun(false); setSecs(0); setNote(""); setNotice(`Logged ${minutes} minute${minutes > 1 ? "s" : ""}`); } catch (e) { setNotice(extractErrorMessage(e, "Couldn't log that time.")); } };
  const stats: any[] = eng ? [["Open tasks", String(tasks.length), `${pendingOffers} new offer${pendingOffers === 1 ? "" : "s"}`], ["Active contracts", String(active.length), `${(contractsQ.data ?? []).filter((c: any) => ["OFFERED", "SIGNED", "DRAFT"].includes(c.status)).length} awaiting signature`], ["Completion rate", repQ.data?.completion_rate != null ? `${repQ.data.completion_rate}%` : "—", "Of assigned tasks"], ["Client rating", repQ.data?.average_rating != null ? repQ.data.average_rating.toFixed(1) : "—", `${repQ.data?.rating_count ?? 0} reviews`]] : [["Projects", String((projectsQ.data ?? []).length), "On your boards"], ["Active contracts", String(active.length), "With professionals"], ["Awaiting signature", String((contractsQ.data ?? []).filter((c: any) => ["OFFERED", "SIGNED", "DRAFT"].includes(c.status)).length), "Offers sent"], ["Completed", String((contractsQ.data ?? []).filter((c: any) => c.status === "COMPLETED").length), "Contracts"]];
  return (
    <Wrap w="max-w-none">
      <div className="mb-4"><h1 className="text-2xl font-bold">My workspace</h1><p className="text-sm text-slate-500">Active contracts, tasks and time in one place</p></div>
      <div className="mb-4 grid grid-cols-2 gap-3 xl:grid-cols-4">{stats.map((x) => <Card key={x[0]} c="rounded-xl" p="p-4"><p className="text-sm text-slate-500">{x[0]}</p><p className="text-2xl font-bold">{x[1]}</p><p className="text-sm text-[#0552CC]">{x[2]}</p></Card>)}</div>
      <div className="grid gap-4 grid-cols-1 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-4">
          {eng ? <Card c="rounded-xl" p="p-5"><div className="mb-3 flex items-center justify-between"><h2 className="text-[17px] font-bold">My tasks</h2><button className="text-sm text-[#0552CC]" onClick={() => nav("taskmarket")}>Task offers →</button></div>
            {tasks.map((t: any) => <div key={t.task.id} className="flex items-center gap-3 border-t border-slate-100 py-3 text-[15px]"><Ic n="board" s={18} c="text-slate-500" /><span className="flex-1">{t.task.title}<span className="block text-xs text-slate-500">{t.project_title} - {t.task.status.replace(/_/g, " ").toLowerCase()}</span></span>{t.latest_submission && <Tag t="gray">{t.latest_submission.status.replace(/_/g, " ").toLowerCase()}</Tag>}</div>)}{!tasksQ.loading && !tasks.length && <p className="border-t border-slate-100 pt-3 text-sm text-slate-500">No open tasks. Accept a task offer to get started.</p>}</Card>
          : <Card c="rounded-xl" p="p-5"><div className="mb-3 flex items-center justify-between"><h2 className="text-[17px] font-bold">Your projects</h2><button className="text-sm text-[#0552CC]" onClick={() => nav("projects")}>Open board →</button></div>{(projectsQ.data ?? []).map((p: any) => <div key={p.id} className="flex items-center gap-3 border-t border-slate-100 py-3"><Lg name={p.title || p.name || "Project"} s={36} /><span className="flex-1 font-semibold">{p.title || p.name}</span><Tag t="gray">{(p.status || "").toLowerCase()}</Tag></div>)}{!projectsQ.loading && !(projectsQ.data ?? []).length && <p className="border-t border-slate-100 pt-3 text-sm text-slate-500">No projects yet.</p>}</Card>}
          <Card c="rounded-xl" p="p-5"><h2 className="mb-3 text-[17px] font-bold">Active contracts</h2>
            {active.map((c: any) => { const other = c.client_id === user?.id ? c.worker : c.client; return <div key={c.id} className="flex items-center gap-4 border-t border-slate-100 py-3"><Lg name={other?.full_name || c.title} s={44} /><div className="min-w-0 flex-1"><button onClick={() => nav("contracts")} className="text-[15px] font-semibold text-[#0552CC] hover:underline">{c.title}</button><p className="text-sm text-slate-500">{other?.full_name || ""}</p><div className="mt-1 h-2 rounded-full bg-slate-100"><div className="h-2 rounded-full bg-[#0552CC]" style={{ width: prog(c) + "%" }} /></div></div><span className="text-sm font-semibold">{prog(c)}%</span></div>; })}{!contractsQ.loading && !active.length && <p className="border-t border-slate-100 pt-3 text-sm text-slate-500">No active contracts.</p>}</Card>
        </div>
        <div className="space-y-4">
          {eng && <Card c="rounded-xl" p="p-5"><h2 className="mb-2 text-[17px] font-bold">Time tracker</h2><p className="text-4xl font-bold tabular-nums">{clock}</p><select aria-label="Task" className={cx(inputCls, "my-3")} value={taskId} onChange={(e) => setTaskId(e.target.value)}><option value="">Choose a task…</option>{tasks.map((t: any) => <option key={t.task.id} value={t.task.id}>{t.task.title}</option>)}</select><input aria-label="What did you work on?" placeholder="What did you work on?" className={cx(inputCls, "mb-3")} value={note} onChange={(e) => setNote(e.target.value)} /><div className="flex gap-2"><Btn v={run ? "danger" : "primary"} icon={run ? "clock" : "play"} full onClick={() => setRun(!run)}>{run ? "Pause" : secs ? "Resume" : "Start timer"}</Btn>{secs > 0 && <Btn v="gray" onClick={logTime}>Log time</Btn>}</div></Card>}
          <Card c="rounded-xl" p="p-5"><h2 className="mb-2 text-[17px] font-bold">Upcoming</h2>{[...(tasksQ.data ?? []).filter((t: any) => t.task.deadline).map((t: any) => [t.task.title, new Date(t.task.deadline), "check"]), ...active.flatMap((c: any) => (c.milestones || []).filter((m: any) => m.due_date && !["APPROVED", "PAID"].includes(m.status)).map((m: any) => [`${m.title} - ${c.title}`, new Date(m.due_date), "calendar"]))].sort((a: any, b: any) => a[1] - b[1]).slice(0, 5).map((x: any) => <div key={x[0]} className="flex items-center gap-3 py-2"><span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#E8F0FC] text-[#0552CC]"><Ic n={x[2]} s={18} /></span><div><p className="text-sm font-semibold">{x[0]}</p><p className="text-xs text-slate-500">{x[1].toLocaleDateString()}</p></div></div>)}{![...(tasksQ.data ?? []).filter((t: any) => t.task.deadline), ...active].length && <p className="text-sm text-slate-500">No upcoming deadlines.</p>}</Card>
        </div>
      </div>
      {notice && <button onClick={() => setNotice("")} className="v2-toast">{notice} · Dismiss</button>}
    </Wrap>
  );
}

export function Quality() {
  // Live: POST /quality/review-code — AI review of a pasted snippet (the API reviews code, not whole repositories).
  const [task, setTask] = useState("");
  const [code, setCode] = useState("");
  const [lang, setLang] = useState("python");
  const [state, setState] = useState("idle");
  const [r, setR] = useState<any>(null);
  const [err, setErr] = useState("");
  const start = async () => { if (!code.trim() || !task.trim()) { setErr("Describe the task and paste the code to review."); return; } setErr(""); setState("run"); try { const res = await api.post("/quality/review-code", { task_description: task.trim(), code_snippet: code, language: lang }); setR(res.data); setState("done"); } catch (e) { setErr(extractErrorMessage(e, "The AI review is unavailable right now. Please try again shortly.")); setState("idle"); } };
  const sev: any = { critical: "red", high: "red", warning: "amber", medium: "amber", info: "gray", low: "gray" };
  const exportReport = () => { const blob = new Blob([JSON.stringify(r, null, 2)], { type: "application/json" }); const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "code-review.json"; a.click(); };
  return (
    <Wrap w="max-w-none">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3"><div><h1 className="text-2xl font-bold">AI code quality review</h1><p className="text-sm text-slate-500">Paste a snippet for an explainable evaluation report</p></div>{state === "done" && <Btn v="outline" icon="download" onClick={exportReport}>Export report</Btn>}</div>
      <Card c="mb-4 rounded-xl" p="p-4"><div className="space-y-2"><div className="flex flex-wrap gap-2"><input aria-label="What should this code do?" placeholder="What should this code do?" value={task} onChange={(e) => setTask(e.target.value)} className={cx(inputCls, "flex-1")} style={{ minWidth: 240 }} /><select aria-label="Language" value={lang} onChange={(e) => setLang(e.target.value)} className={cx(inputCls, "w-40")}>{["python", "typescript", "javascript", "go", "rust", "java", "sql"].map((l) => <option key={l}>{l}</option>)}</select><Btn v="primary" icon="spark" onClick={start}>{state === "run" ? "Reviewing..." : "Run review"}</Btn></div><textarea aria-label="Code to review" rows={8} value={code} onChange={(e) => setCode(e.target.value)} placeholder="Paste code here…" className={cx(inputCls, "h-auto py-2 font-mono text-xs")} />{err && <p role="alert" className="text-sm text-red-600">{err}</p>}</div></Card>
      {state === "idle" && !r && <Card c="rounded-xl" p="p-10"><div className="text-center text-slate-500"><span className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-[#E8F0FC] text-[#0552CC]"><Ic n="code" s={26} /></span><p className="font-semibold text-slate-900">No review yet</p><p className="text-sm">Run a review to see scores, findings and suggested fixes.</p></div></Card>}
      {state === "run" && <Card c="rounded-xl" p="p-10"><div className="text-center"><div className="mx-auto mb-3 h-10 w-10 animate-spin rounded-full border-4 border-[#E8F0FC] border-t-[#0552CC]" /><p className="font-semibold">Reviewing your code…</p><p className="text-sm text-slate-500">AI review of correctness, security and maintainability</p></div></Card>}
      {state === "done" && r && (
        <div className="grid gap-4 grid-cols-1 xl:grid-cols-[320px_minmax(0,1fr)]">
          <div className="space-y-4">
            <Card c="rounded-xl" p="p-5"><p className="text-sm text-slate-500">Overall quality score</p><p className="text-5xl font-bold text-[#0552CC]">{r.overall_score}<span className="text-xl text-slate-400">/100</span></p><p className="text-sm text-slate-600">Grade {r.grade} - {String(r.verdict).replace(/_/g, " ")}</p></Card>
            {Object.keys(r.complexity_analysis || {}).length > 0 && <Card c="rounded-xl" p="p-5"><p className="mb-3 text-[17px] font-bold">Complexity</p>{Object.entries(r.complexity_analysis).filter(([, v]) => v).map(([k, v]: any) => <div key={k} className="mb-2 text-sm"><span className="text-slate-500">{k.replace(/_/g, " ")}</span><p className="font-semibold">{String(v)}</p></div>)}</Card>}
            {(r.security_flags || []).length > 0 && <Card c="rounded-xl" p="p-5"><p className="mb-2 text-[17px] font-bold">Security flags</p>{r.security_flags.map((f: string) => <p key={f} className="mb-1 text-sm text-red-700">• {f}</p>)}</Card>}
          </div>
          <div className="space-y-4">
            <Card c="rounded-xl bg-[#F3F0FF]" p="p-5"><p className="mb-1 flex items-center gap-2 font-bold text-[#5B4BDB]"><Ic n="spark" s={16} />AI summary</p><p className="text-slate-700">{r.summary}</p></Card>
            <Card c="rounded-xl" p="p-0"><div className="border-b border-slate-200 p-4"><p className="text-[17px] font-bold">Findings ({(r.line_comments || []).length})</p></div>
              {(r.line_comments || []).map((f: any, i: number) => <div key={i} className="flex flex-wrap items-start gap-3 border-b border-slate-100 p-4 last:border-0"><Tag v={sev[String(f.severity).toLowerCase()] || "gray"}>{f.severity}</Tag><div className="min-w-0 flex-1"><p className="font-semibold">{f.comment}</p>{f.line != null && <p className="font-mono text-xs text-slate-500">line {f.line}</p>}</div></div>)}{!(r.line_comments || []).length && <p className="p-4 text-sm text-slate-500">No line-level findings.</p>}</Card>
            {(r.suggestions || []).length > 0 && <Card c="rounded-xl" p="p-5"><p className="mb-2 text-[17px] font-bold">Suggestions</p><ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">{r.suggestions.map((s: string) => <li key={s}>{s}</li>)}</ul></Card>}
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
  const signOutAll = async () => { try { await api.post("/auth/logout-all"); } catch {} await logout({ everywhere: true }); nav("login"); };
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
        {show("People") && d.engineers.map((p: any) => <Card key={p.id} c="rounded-xl"><button className="flex w-full items-center gap-3 text-left" onClick={() => { sessionStorage.setItem("rap-person-id", p.id); nav("engineer"); }}><Av name={p.full_name || "Professional"} s={44} /><div className="flex-1"><p className="font-semibold text-[#0552CC]">{p.full_name || "Professional"}</p><p className="text-sm text-slate-500">{p.headline || p.primary_role}</p></div><Tag t="gray">Person</Tag></button></Card>)}
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

const LEGAL: Record<string, [string, Section[]]> = { terms: ["Terms of Service", TERMS], privacy: ["Privacy Policy", PRIVACY], impressum: ["Impressum", IMPRESSUM] };
function LegalBlock({ b }: { b: Block }) {
  if (typeof b === "string") return <p className="mt-2 text-slate-600">{b}</p>;
  if (Array.isArray(b)) return <ul className="mt-2 list-disc space-y-1 pl-5 text-slate-600">{b.map((x) => <li key={x}>{x}</li>)}</ul>;
  // Operator-only facts are never guessed: until supplied they show as pending.
  return b.fact ? <p className="mt-2 text-slate-600">{b.fact}</p> : <p className="mt-2 rounded-md bg-slate-100 px-3 py-2 text-sm text-slate-700">Coming soon: {b.label}.</p>;
}
export function Legal({ kind }: { kind: string }) {
  const [title, sections] = LEGAL[kind] || LEGAL.terms;
  return (
    <Wrap w="max-w-[860px]"><Card c="rounded-xl"><h1>{title}</h1><p className="mt-1 text-sm text-slate-500">Last updated {LAST_UPDATED}</p>{sections.map((s, i) => <section key={s.h} className="mt-5"><h3>{i + 1}. {s.h}</h3>{s.body.map((b, j) => <LegalBlock key={j} b={b} />)}</section>)}</Card></Wrap>
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
