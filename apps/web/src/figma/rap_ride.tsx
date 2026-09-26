import { useState } from "react";
import api, { extractErrorMessage } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useApi, goRoute } from "./live";
import { Ic, Av, Tag, cx } from "./rap_kit";

// Engagement options: how many engineers and how candidates are ranked. Prices
// come from the matched engineers' own hourly rates, never invented.
const OPT = [
  { id: "fast", n: "Fast Match", ic: "zap", sub: "Best fit who is available now", count: 1, tag: "Fastest", rank: "available" },
  { id: "best", n: "Best Fit", ic: "target", sub: "Strongest profile for your brief", count: 1, tag: "Top profile", rank: "score" },
  { id: "team", n: "Squad", ic: "users", sub: "Lead plus two specialists", count: 3, tag: "Team", rank: "score" },
  { id: "sprint", n: "Sprint Pack", ic: "bolt", sub: "40 hours, fixed scope", count: 1, tag: "Fixed price", rank: "score", hours: 40 },
];
const STEPS = ["Describe the work", "Review matches", "Offer sent", "Kickoff scheduled"];

function Map({ step }: { step: number }) {
  return (
    <svg viewBox="0 0 800 600" className="h-full w-full" preserveAspectRatio="xMidYMid slice">
      <rect width="800" height="600" fill="#E8ECEF" />
      {[60, 170, 290, 400, 520, 650].map((x) => <rect key={x} x={x} y="0" width="26" height="600" fill="#F8F9FA" />)}
      {[80, 200, 330, 450].map((y) => <rect key={y} x="0" y={y} width="800" height="24" fill="#F8F9FA" />)}
      <path d="M0 520 C 200 470, 320 560, 520 500 S 720 420, 800 440 L800 600 L0 600Z" fill="#C9DDF0" />
      <rect x="440" y="120" width="120" height="80" rx="10" fill="#D5E8D4" />
      <path d="M120 440 L120 212 L303 212 L303 342 L533 342" fill="none" stroke="#050505" strokeWidth="6" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx="120" cy="440" r="10" fill="#fff" stroke="#050505" strokeWidth="5" />
      <rect x="523" y="332" width="20" height="20" fill="#050505" />
      {step >= 1 && [[220, 300], [400, 250], [610, 400]].map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r="8" fill="#5B4BDB" opacity="0.85" />)}
    </svg>
  );
}

export function Ride() {
  // Live: real engineers matched from /engineers/search; confirming sends a real contract offer
  // (POST /contracts) at the engineer's own rate; kickoff opens a conversation with them.
  const { user } = useAuth();
  const company = user?.role === "COMPANY";
  const [step, setStep] = useState(0);
  const [sel, setSel] = useState("best");
  const [mode, setMode] = useState("now");
  const [q, setQ] = useState("");
  const [brief, setBrief] = useState("");
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState<any[]>([]);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const pool = useApi<any[]>(search ? "/engineers/search" : null, { query: search, limit: 50 });
  const contracts = useApi<any[]>(company ? "/contracts/me" : null);
  const jobs = useApi<any[]>(company ? "/jobs/company" : null, { limit: 100 });
  const available = useApi<any[]>(company ? "/engineers" : null, { limit: 100 });
  const cur = OPT.find((o) => o.id === sel)!;
  const rated = (pool.data ?? []).filter((e: any) => e.user_id !== user?.id && e.hourly_rate > 0);
  const ranked = [...rated].sort((a: any, b: any) => (cur.rank === "available" ? Number(/now|immediate|open/i.test(b.availability || "")) - Number(/now|immediate|open/i.test(a.availability || "")) : 0) || (b.profile_score || 0) - (a.profile_score || 0));
  const cands = ranked.slice(0, Math.max(3, cur.count));
  const from = (o: any) => { const r = rated.map((e: any) => e.hourly_rate).sort((a: number, b: number) => a - b)[0]; if (!r) return "—"; return o.hours ? `$${(r * o.hours).toLocaleString()}` : `$${Math.round(r * o.count)}/hr`; };
  const request = () => { if (q.trim().length < 2) { setNotice("Describe who you need, e.g. “Python data engineer”."); return; } setSearch(q.trim()); setPicked([]); setStep(1); };
  const confirm = async () => { const chosen = picked.length ? picked : cands.slice(0, cur.count); if (!chosen.length) return; setBusy(true); try { for (const e of chosen) { await api.post("/contracts", { worker_id: e.user_id, title: q.trim().slice(0, 200) || "Engagement", scope_description: brief.trim() || q.trim(), rate_type: cur.hours ? "FIXED" : "HOURLY", rate_amount: cur.hours ? e.hourly_rate * cur.hours : e.hourly_rate, ...(cur.hours ? { milestones: [{ title: "Sprint delivery (40 hours)", amount: e.hourly_rate * cur.hours }] } : {}) }); } setPicked(chosen); setStep(2); contracts.reload(); } catch (e) { setNotice(extractErrorMessage(e, "We couldn't send the offer.")); } finally { setBusy(false); } };
  const kickoff = async () => { setBusy(true); try { for (const e of picked) { const c = await api.post("/conversations", { participant_id: e.user_id }); await api.post(`/conversations/${c.data.id}/messages`, { content: `Hi ${(e.full_name || "").split(" ")[0] || "there"} — I've sent you a contract offer for "${q.trim()}". ${mode === "now" ? "Could we kick off as soon as you've signed?" : "When would suit you for a kickoff call?"}` }); } setStep(3); } catch (e) { setNotice(extractErrorMessage(e, "We couldn't message this professional.")); } finally { setBusy(false); } };
  const toggle = (e: any) => setPicked((p) => (p.some((x) => x.id === e.id) ? p.filter((x) => x.id !== e.id) : [...p, e].slice(-cur.count)));
  const chosenNames = (picked.length ? picked : cands.slice(0, cur.count)).map((e: any) => (e.full_name || "Professional").split(" ")[0]).join(", ");
  return (
    <div className="relative h-[calc(100vh-130px)] min-h-[560px] overflow-hidden bg-white">
      <div className="absolute inset-0"><Map step={step} /></div>
      <div className="absolute left-6 top-6 z-10 flex w-[400px] max-w-[calc(100%-48px)] flex-col gap-3">
        <div className="max-h-[calc(100vh-190px)] overflow-y-auto rounded-lg bg-white p-6 shadow-xl">
          {!company ? <><h1 className="text-[32px] font-bold leading-9 text-slate-900">Hire a professional</h1><p className="mt-3 text-sm text-slate-600">Instant hiring is for company workspaces. Switch to your company workspace from the account menu to request a professional.</p></> : step === 0 ? (
            <>
              <h1 className="text-[32px] font-bold leading-9 text-slate-900">Hire a professional</h1>
              <div className="mt-2 flex gap-2">{[["now", "Now"], ["later", "Schedule"]].map((m) => <button key={m[0]} onClick={() => setMode(m[0])} className={cx("flex h-9 items-center gap-1 rounded-full px-4 text-sm font-medium", mode === m[0] ? "bg-[#050505] text-white" : "bg-slate-100 text-slate-900")}><Ic n={m[0] === "now" ? "clock" : "calendar"} s={14} />{m[1]}</button>)}</div>
              <div className="relative mt-4 space-y-2 pl-6"><span className="absolute left-2 top-5 h-8 w-px bg-[#050505]" /><span className="absolute left-[3px] top-4 h-2.5 w-2.5 rounded-full border-2 border-[#050505] bg-white" /><span className="absolute left-[3px] top-[58px] h-2.5 w-2.5 bg-[#050505]" />
                <input aria-label="Who do you need?" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Who do you need? e.g. Senior ML engineer, RAG" className="h-11 w-full rounded-lg bg-slate-100 px-3 text-sm font-medium outline-none" /><input aria-label="Scope" value={brief} onChange={(e) => setBrief(e.target.value)} placeholder="Scope, e.g. 40 hrs, remote EU timezone" className="h-11 w-full rounded-lg bg-slate-100 px-3 text-sm font-medium outline-none" /></div>
              <p className="mb-2 mt-5 text-sm font-bold text-slate-900">Choose how to engage</p>
              {OPT.map((o) => (
                <button key={o.id} onClick={() => setSel(o.id)} className={cx("mb-2 flex w-full items-center gap-3 rounded-lg border-2 p-3 text-left", sel === o.id ? "border-[#050505] bg-slate-50" : "border-transparent hover:bg-slate-50")}>
                  <span className="flex h-12 w-12 items-center justify-center rounded-lg bg-slate-100 text-slate-900"><Ic n={o.ic} s={22} /></span>
                  <div className="flex-1"><p className="flex items-center gap-2 font-bold text-slate-900">{o.n}<Tag t={o.tag === "Fastest" ? "green" : "gray"}>{o.tag}</Tag></p><p className="text-xs text-slate-500">{o.count} professional{o.count > 1 ? "s" : ""} - {o.sub}</p></div>
                </button>
              ))}
              <button onClick={request} className="mt-3 h-12 w-full rounded-lg bg-[#050505] text-base font-medium text-white hover:bg-[#0443A8]">Request {cur.n}</button>
            </>
          ) : (
            <>
              <div className="flex items-center justify-between"><h2 className="text-2xl font-bold text-slate-900">{step === 1 ? (pool.loading ? "Finding your match" : cands.length ? "Your best matches" : "No matches yet") : step === 2 ? `Offer sent to ${chosenNames}` : "Kickoff requested"}</h2><button aria-label="Start over" onClick={() => { setStep(0); setPicked([]); }} className="rounded-full bg-slate-100 p-2"><Ic n="x" s={16} /></button></div>
              <div className="mt-4 h-1 overflow-hidden rounded bg-slate-200"><div className="h-full bg-[#050505] transition-all" style={{ width: step * 33 + "%" }} /></div>
              <div className="mt-4 space-y-3">{STEPS.map((s, i) => <div key={s} className="flex items-center gap-3 text-sm"><span className={cx("flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold", i <= step ? "bg-[#050505] text-white" : "bg-slate-200 text-slate-500")}>{i < step ? <Ic n="check" s={12} /> : i + 1}</span><span className={i <= step ? "font-semibold text-slate-900" : "text-slate-400"}>{s}</span></div>)}</div>
              {step === 1 && <><p className="mb-2 mt-5 text-sm font-bold text-slate-900">{cands.length ? `Pick ${cur.count > 1 ? `up to ${cur.count}` : "one"} · ${cur.n} from ${from(cur)}` : "Try a broader description — we only match professionals with a set rate."}</p>
                {cands.map((c: any) => { const on = picked.some((x) => x.id === c.id) || (!picked.length && cands.slice(0, cur.count).includes(c)); return <button key={c.id} onClick={() => toggle(c)} className={cx("mb-2 flex w-full items-center gap-3 rounded-lg p-3 text-left", on ? "bg-slate-100 ring-2 ring-[#050505]" : "bg-slate-50")}><Av name={c.full_name || "Professional"} s={48} /><div className="flex-1"><p className="font-bold text-slate-900">{c.full_name || "Professional"}</p><p className="text-xs text-slate-500">{c.headline || c.primary_role}</p><p className="text-xs text-slate-600">{c.profile_score != null && `Profile ${Math.round(c.profile_score)}% - `}{c.availability || "Availability not set"}</p></div><p className="text-xs font-bold text-slate-900">${c.hourly_rate}/hr</p></button>; })}</>}
              {step >= 2 && <p className="mt-5 text-sm text-slate-600">{step === 2 ? "The contract offer is waiting for their signature in Contracts. Let them know you’re ready to start." : "We messaged them about the kickoff. You’ll get a notification when they reply or sign."}</p>}
              <div className="mt-3 flex gap-2">{step === 1 ? <button disabled={busy || !cands.length} onClick={confirm} className="h-12 flex-1 rounded-lg bg-[#050505] font-medium text-white disabled:opacity-50">{busy ? "Sending offer…" : `Confirm ${chosenNames || "professional"}`}</button> : step === 2 ? <button disabled={busy} onClick={kickoff} className="h-12 flex-1 rounded-lg bg-[#050505] font-medium text-white">{busy ? "Messaging…" : "Schedule kickoff"}</button> : <button onClick={() => { goRoute("contracts"); }} className="h-12 flex-1 rounded-lg bg-[#050505] font-medium text-white">View contracts</button>}<button onClick={() => { goRoute("messenger"); }} className="h-12 rounded-lg bg-slate-100 px-4 font-medium text-slate-900">Message</button></div>
            </>
          )}
          {notice && <p role="alert" className="mt-3 text-sm text-red-600">{notice}</p>}
        </div>
      </div>
      {company && <div className="absolute bottom-6 right-6 z-10 hidden w-72 rounded-lg bg-white p-4 shadow-xl lg:block"><p className="text-xs font-bold uppercase text-slate-500">Also for you</p>{[["Professionals open to work", String((available.data ?? []).filter((e: any) => e.is_open_to_work !== false).length)], ["Your open job postings", String((jobs.data ?? []).filter((j: any) => j.is_active).length)], ["Contracts awaiting signature", String((contracts.data ?? []).filter((c: any) => ["OFFERED", "SIGNED", "DRAFT"].includes(c.status)).length)]].map((r) => <div key={r[0]} className="flex items-center justify-between border-b border-slate-100 py-2 text-sm last:border-0"><span className="text-slate-900">{r[0]}</span><span className="font-bold text-slate-900">{r[1]}</span></div>)}</div>}
    </div>
  );
}
