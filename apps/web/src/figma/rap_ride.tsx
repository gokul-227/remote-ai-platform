import { useState } from "react";
import { Ic, Av, Btn, Tag, cx } from "./rap_kit";

const OPT = [
  { id: "fast", n: "Fast Match", ic: "zap", eta: "2 min", sub: "Best fit available now", price: "$95/hr", cap: "1 engineer", tag: "Fastest" },
  { id: "best", n: "Best Fit", ic: "target", eta: "6 min", sub: "Highest verified skill match", price: "$110/hr", cap: "1 engineer", tag: "96% match" },
  { id: "team", n: "Squad", ic: "users", eta: "14 min", sub: "Lead plus two specialists", price: "$290/hr", cap: "3 engineers", tag: "Team" },
  { id: "sprint", n: "Sprint Pack", ic: "bolt", eta: "1 day", sub: "40 hours, fixed scope", price: "$3,800", cap: "Fixed price", tag: "Save 14%" },
];
const CAND = [["Priya Raman", "ML Platform Engineer", 4.98, "96%", "2 min"], ["Mateo Silva", "Data Engineer, Databricks", 4.94, "93%", "5 min"], ["Elena Petrova", "Staff SRE", 4.92, "91%", "8 min"]];
const STEPS = ["Request sent", "Matching engineers", "Engineer accepted", "Kickoff scheduled"];

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
  const [step, setStep] = useState(0);
  const [sel, setSel] = useState("best");
  const [mode, setMode] = useState("now");
  const [q, setQ] = useState("Senior ML engineer, RAG and evaluation");
  const cur = OPT.find((o) => o.id === sel)!;
  return (
    <div className="relative h-[calc(100vh-130px)] min-h-[560px] overflow-hidden bg-white">
      <div className="absolute inset-0"><Map step={step} /></div>
      <div className="absolute left-6 top-6 z-10 flex w-[400px] max-w-[calc(100%-48px)] flex-col gap-3">
        <div className="max-h-[calc(100vh-190px)] overflow-y-auto rounded-lg bg-white p-6 shadow-xl">
          {step === 0 && (
            <>
              <h1 className="text-[32px] font-bold leading-9 text-slate-900">Get an engineer</h1>
              <div className="mt-2 flex gap-2">{[["now", "Now"], ["later", "Schedule"]].map((m) => <button key={m[0]} onClick={() => setMode(m[0])} className={cx("flex h-9 items-center gap-1 rounded-full px-4 text-sm font-medium", mode === m[0] ? "bg-[#050505] text-white" : "bg-slate-100 text-slate-900")}><Ic n={m[0] === "now" ? "clock" : "calendar"} s={14} />{m[1]}</button>)}</div>
              <div className="relative mt-4 space-y-2 pl-6"><span className="absolute left-2 top-5 h-8 w-px bg-[#050505]" /><span className="absolute left-[3px] top-4 h-2.5 w-2.5 rounded-full border-2 border-[#050505] bg-white" /><span className="absolute left-[3px] top-[58px] h-2.5 w-2.5 bg-[#050505]" />
                <input value={q} onChange={(e) => setQ(e.target.value)} className="h-11 w-full rounded-lg bg-slate-100 px-3 text-sm font-medium outline-none" /><input defaultValue="Project: Matching v2 - 40 hrs, remote EU timezone" className="h-11 w-full rounded-lg bg-slate-100 px-3 text-sm font-medium outline-none" /></div>
              <p className="mb-2 mt-5 text-sm font-bold text-slate-900">Suggested for you</p>
              {OPT.map((o) => (
                <button key={o.id} onClick={() => setSel(o.id)} className={cx("mb-2 flex w-full items-center gap-3 rounded-lg border-2 p-3 text-left", sel === o.id ? "border-[#050505] bg-slate-50" : "border-transparent hover:bg-slate-50")}>
                  <span className="flex h-12 w-12 items-center justify-center rounded-lg bg-slate-100 text-slate-900"><Ic n={o.ic} s={22} /></span>
                  <div className="flex-1"><p className="flex items-center gap-2 font-bold text-slate-900">{o.n}<Tag t={o.tag === "Fastest" ? "green" : "gray"}>{o.tag}</Tag></p><p className="text-xs text-slate-500">{o.eta} - {o.sub}</p></div>
                  <p className="font-bold text-slate-900">{o.price}</p>
                </button>
              ))}
              <button onClick={() => setStep(1)} className="mt-3 h-12 w-full rounded-lg bg-[#050505] text-base font-medium text-white hover:bg-[#0443A8]">Request {cur.n}</button>
            </>
          )}
          {step >= 1 && (
            <>
              <div className="flex items-center justify-between"><h2 className="text-2xl font-bold text-slate-900">{step === 1 ? "Finding your match" : step === 2 ? "Priya is on the way" : "Kickoff confirmed"}</h2><button onClick={() => setStep(0)} className="rounded-full bg-slate-100 p-2"><Ic n="x" s={16} /></button></div>
              <div className="mt-4 h-1 overflow-hidden rounded bg-slate-200"><div className="h-full bg-[#050505] transition-all" style={{ width: step * 33 + "%" }} /></div>
              <div className="mt-4 space-y-3">{STEPS.map((s, i) => <div key={s} className="flex items-center gap-3 text-sm"><span className={cx("flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold", i <= step ? "bg-[#050505] text-white" : "bg-slate-200 text-slate-500")}>{i < step ? <Ic n="check" s={12} /> : i + 1}</span><span className={i <= step ? "font-semibold text-slate-900" : "text-slate-400"}>{s}</span></div>)}</div>
              {step >= 1 && <p className="mb-2 mt-5 text-sm font-bold text-slate-900">{step === 1 ? "Top candidates" : "Your engineer"}</p>}
              {(step === 1 ? CAND : CAND.slice(0, 1)).map((c) => <div key={c[0]} className="mb-2 flex items-center gap-3 rounded-lg bg-slate-50 p-3"><Av name={String(c[0])} s={48} /><div className="flex-1"><p className="font-bold text-slate-900">{c[0]}</p><p className="text-xs text-slate-500">{c[1]}</p><p className="text-xs text-slate-600">Rating {c[2]} - {c[3]} match</p></div><p className="text-xs font-bold text-slate-900">{c[4]}</p></div>)}
              <div className="mt-3 flex gap-2">{step < 3 ? <button onClick={() => setStep(step + 1)} className="h-12 flex-1 rounded-lg bg-[#050505] font-medium text-white">{step === 1 ? "Confirm Priya" : "Schedule kickoff"}</button> : <button onClick={() => setStep(0)} className="h-12 flex-1 rounded-lg bg-[#050505] font-medium text-white">Done</button>}<button className="h-12 rounded-lg bg-slate-100 px-4 font-medium text-slate-900">Message</button></div>
            </>
          )}
        </div>
      </div>
      <div className="absolute bottom-6 right-6 z-10 hidden w-72 rounded-lg bg-white p-4 shadow-xl lg:block"><p className="text-xs font-bold uppercase text-slate-500">Also for you</p>{[["Projects matching your skills", "5 new"], ["Teams hiring in your timezone", "12 open"], ["Upcoming kickoff calls", "Tomorrow 10:00"]].map((r) => <div key={r[0]} className="flex items-center justify-between border-b border-slate-100 py-2 text-sm last:border-0"><span className="text-slate-900">{r[0]}</span><span className="font-bold text-slate-900">{r[1]}</span></div>)}</div>
    </div>
  );
}
