// @ts-nocheck -- Figma Make export, kept verbatim (never type-checked upstream).
import { useState, useEffect } from "react";
import { Ic, Av, Lg, Btn, Card, Tag, Tabs, Bar, Stars, cx, PEOPLE, JOBS, Field, inputCls } from "./rap_kit";

const nav = (h: string) => { window.location.hash = h; };
function Wrap({ children, w }: { children: any; w?: string }) { return <div className="bg-[#F0F2F5] py-6"><div className={cx("mx-auto px-4", w || "max-w-[1100px]")}>{children}</div></div>; }

export function EngineerDetail() {
  const p = PEOPLE[0];
  const [t, setT] = useState("About");
  const [inv, setInv] = useState(false);
  return (
    <Wrap>
      <Card p={false} c="overflow-hidden rounded-xl">
        <div className="h-44 bg-gradient-to-r from-[#031B4E] via-[#0552CC] to-[#5B9BFF]" />
        <div className="px-6 pb-4"><div className="-mt-14 flex flex-wrap items-end justify-between gap-3"><div className="rounded-full border-4 border-white"><Av name={p.n} s={112} dot /></div><div className="flex gap-2"><Btn v="primary" icon="plus">Connect</Btn><Btn v={inv ? "gray" : "outline"} onClick={() => setInv(true)}>{inv ? "Invited" : "Invite to job"}</Btn><Btn v="gray" icon="chat">Message</Btn></div></div>
          <h1 className="mt-3">{p.n}</h1><p className="text-slate-700">{p.t}</p><p className="text-sm text-slate-500">{p.loc} - {"$" + p.rate}/hr - {p.jss}% job success</p></div>
        <Tabs items={["About", "Experience", "Projects", "Reviews"]} v={t} set={setT} c="px-4" />
      </Card>
      <div className="mt-4 grid gap-4 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Card c="rounded-xl">
          {t === "About" && <><h3>About</h3><p className="mt-2 text-slate-700">Senior engineer focused on production ML platforms, retrieval systems and evaluation. Ships documented, testable work for remote teams across timezones.</p><h3 className="mt-5">Skills</h3><div className="mt-2 flex flex-wrap gap-2">{p.skills.map((s) => <Tag key={s} t="blue">{s}</Tag>)}</div></>}
          {t === "Experience" && [["Staff ML Engineer", "Northstar Cloud", "2022 - Present"], ["Senior Engineer", "Helix Labs", "2019 - 2022"]].map((e) => <div key={e[0]} className="flex gap-3 border-b border-slate-200 py-3 last:border-0"><Lg name={e[1]} s={44} r={8} /><div><p className="font-semibold">{e[0]}</p><p className="text-sm text-slate-500">{e[1]} - {e[2]}</p></div></div>)}
          {t === "Projects" && ["RAG evaluation harness", "Realtime feature store"].map((x) => <div key={x} className="border-b border-slate-200 py-3 last:border-0"><p className="font-semibold">{x}</p><p className="text-sm text-slate-500">Open source - Python, Kafka</p></div>)}
          {t === "Reviews" && [["Brightpath", "Delivered ahead of schedule and documented everything."], ["Helix Labs", "Excellent communicator, sharp on evaluation design."]].map((r) => <div key={r[0]} className="border-b border-slate-200 py-3 last:border-0"><Stars v={5} /><p className="mt-1 text-sm text-slate-700">{r[1]}</p><p className="text-xs text-slate-500">{r[0]}</p></div>)}
        </Card>
        <div className="space-y-4"><Card c="rounded-xl"><h3>AI match summary</h3><p className="mt-2 text-sm text-slate-600">Strong fit for ML platform and evaluation roles. Verified skills: Python, RAG, Kubernetes.</p><div className="mt-3"><Bar v={p.score} c="bg-[#0552CC]" /><p className="mt-1 text-xs text-slate-500">Profile score {p.score}/100</p></div></Card><Card c="rounded-xl"><h3>Availability</h3><p className="mt-1 text-sm text-slate-600">30+ hrs/week - responds within 2 hours</p></Card></div>
      </div>
    </Wrap>
  );
}

export function JobDetail() {
  const [saved, setSaved] = useState(false);
  const [apply, setApply] = useState(false);
  const [sent, setSent] = useState(false);
  const [tab, setTab] = useState("Overview");
  const [cover, setCover] = useState("I have shipped three production RAG platforms and led evaluation pipelines for teams of five. I would love to help Northstar Cloud harden its AI platform.");
  const fit = [["Skills", 92], ["Experience", 88], ["Timezone", 100], ["Rate", 90], ["Availability", 96]];
  return (
    <Wrap w="max-w-none">
      <div className="grid gap-4 grid-cols-1 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-4">
          <Card c="rounded-xl overflow-hidden" p="p-0">
            <div className="h-20 bg-gradient-to-r from-[#0552CC] to-[#0A7CFF]" />
            <div className="px-6 pb-5">
              <div className="-mt-8 flex flex-wrap items-end justify-between gap-3">
                <div className="flex items-start gap-4"><span className="flex h-16 w-16 items-center justify-center rounded-xl border-4 border-white bg-[#E8590C] text-2xl font-bold text-white">NO</span><div className="mt-10 pb-1"><h1 className="text-2xl font-bold">Senior AI Platform Engineer</h1><p className="text-sm text-slate-600">Northstar Cloud - Remote (US/EU) - Posted 2 hours ago - 34 applicants</p></div></div>
                <div className="flex gap-2">{sent ? <Btn v="gray" icon="check">Applied</Btn> : <Btn v="primary" icon="send" onClick={() => setApply(true)}>Easy Apply</Btn>}<Btn v={saved ? "gray" : "outline"} icon="bookmark" onClick={() => setSaved(!saved)}>{saved ? "Saved" : "Save"}</Btn></div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2"><Tag v="gray">Full-time</Tag><Tag v="gray">Senior</Tag><Tag v="gray">USD 165K - 210K</Tag><Tag v="gray">Remote</Tag><Tag v="blue">96% match</Tag><Tag v="green">Escrow-backed</Tag></div>
            </div>
            <div className="flex gap-1 border-t border-slate-200 px-4">{["Overview", "Company", "Hiring team", "Reviews"].map((x) => <button key={x} onClick={() => setTab(x)} className={cx("border-b-[3px] px-4 py-3 text-sm font-semibold", tab === x ? "border-[#0552CC] text-[#0552CC]" : "border-transparent text-slate-600 hover:bg-slate-50")}>{x}</button>)}</div>
          </Card>
          {tab === "Overview" && (
            <Card c="rounded-xl" p="p-6">
              <h2 className="mb-2 text-xl font-bold">About the role</h2>
              <p className="text-slate-700">Own platform reliability and developer experience for production AI systems. Work asynchronously with product, research and go-to-market teams across the US and Europe.</p>
              <h3 className="mb-2 mt-5 text-[17px] font-bold">What you will do</h3>
              <ul className="list-disc space-y-1 pl-5 text-slate-700"><li>Design and operate inference and retrieval services with clear SLOs.</li><li>Build evaluation pipelines that catch regressions before release.</li><li>Mentor engineers and set standards for observability and incident response.</li></ul>
              <h3 className="mb-2 mt-5 text-[17px] font-bold">Requirements</h3>
              <ul className="list-disc space-y-1 pl-5 text-slate-700"><li>5+ years building distributed systems.</li><li>Hands-on Kubernetes and infrastructure as code.</li><li>Experience running LLM workloads in production.</li></ul>
              <h3 className="mb-2 mt-5 text-[17px] font-bold">Skills</h3>
              <div className="flex flex-wrap gap-2">{["Kubernetes", "LLMOps", "Python", "Terraform", "RAG", "Observability"].map((k) => <Tag key={k} v="gray">{k}</Tag>)}</div>
              <h3 className="mb-2 mt-5 text-[17px] font-bold">Benefits</h3>
              <div className="grid gap-2 text-sm text-slate-700 grid-cols-1 xl:grid-cols-2">{["Escrow-protected milestone payments", "Flexible hours, async first", "Annual learning budget", "Equipment stipend"].map((x) => <div key={x} className="flex items-center gap-2 rounded-lg bg-slate-50 p-3"><Ic n="check" s={16} c="text-[#0552CC]" />{x}</div>)}</div>
            </Card>
          )}
          {tab === "Company" && <Card c="rounded-xl" p="p-6"><h2 className="mb-2 text-xl font-bold">About Northstar Cloud</h2><p className="text-slate-700">Cloud infrastructure for AI teams. 1,001-5,000 employees, remote-first, 48K followers. Rated 4.8 for culture by verified engineers.</p><div className="mt-4 grid grid-cols-3 gap-3 text-center">{[["12", "Open roles"], ["4.8", "Culture"], ["9 days", "Avg hire time"]].map((x) => <div key={x[1]} className="rounded-lg bg-[#E8F0FC] p-3"><p className="text-xl font-bold text-[#0552CC]">{x[0]}</p><p className="text-sm text-slate-600">{x[1]}</p></div>)}</div></Card>}
          {tab === "Hiring team" && <Card c="rounded-xl" p="p-6"><h2 className="mb-3 text-xl font-bold">Meet the hiring team</h2>{[["Aisha Rahman", "Principal AI Recruiter"], ["Lucas Meyer", "Engineering Manager"]].map((x) => <div key={x[0]} className="flex items-center gap-3 border-t border-slate-100 py-3"><Av name={x[0]} s={48} /><div className="flex-1"><p className="font-semibold">{x[0]}</p><p className="text-sm text-slate-500">{x[1]}</p></div><Btn v="outline" sm icon="chat">Message</Btn></div>)}</Card>}
          {tab === "Reviews" && <Card c="rounded-xl" p="p-6"><h2 className="mb-3 text-xl font-bold">Engineer reviews</h2>{["Clear scopes, fast payouts and respectful reviews.", "Milestones were fair and escrow removed all payment worry."].map((x) => <div key={x} className="border-t border-slate-100 py-3"><p className="text-sm font-semibold text-[#0552CC]">Verified engineer</p><p className="text-slate-700">{x}</p></div>)}</Card>}
        </div>
        <div className="space-y-4">
          <Card c="rounded-xl" p="p-4"><p className="mb-3 flex items-center gap-2 text-[17px] font-bold"><Ic n="spark" s={16} c="text-[#5B4BDB]" />Why you match</p>{fit.map((x: any) => <div key={x[0]} className="mb-2"><div className="flex justify-between text-sm"><span>{x[0]}</span><span className="font-semibold">{x[1]}%</span></div><div className="h-2 rounded-full bg-slate-100"><div className="h-2 rounded-full bg-[#0552CC]" style={{ width: x[1] + "%" }} /></div></div>)}<p className="mt-3 rounded-lg bg-[#F3F0FF] p-3 text-sm text-slate-700">Your RAG delivery and evaluation history closely match this brief.</p></Card>
          <Card c="rounded-xl" p="p-4"><p className="mb-2 text-[17px] font-bold">Job insights</p><div className="space-y-2 text-sm">{[["Applicants", "34"], ["Top match score", "97%"], ["Response time", "Within 2 days"], ["Contract", "Escrow funded"]].map((x) => <div key={x[0]} className="flex justify-between"><span className="text-slate-500">{x[0]}</span><span className="font-semibold">{x[1]}</span></div>)}</div></Card>
          <Card c="rounded-xl" p="p-4"><p className="mb-2 text-[17px] font-bold">Similar jobs</p>{[["Applied ML Engineer, Search", "Helix Labs", "HE"], ["LLM Evaluation Lead", "Aster Labs", "AS"], ["Data Product Manager", "Brightpath", "BR"]].map((x) => <button key={x[0]} onClick={() => nav("jobs")} className="flex w-full items-center gap-3 rounded-lg p-2 text-left hover:bg-slate-100"><Lg name={x[1]} s={40} /><span><span className="block text-sm font-semibold text-[#0552CC]">{x[0]}</span><span className="block text-xs text-slate-500">{x[1]} - Remote</span></span></button>)}</Card>
        </div>
      </div>
      {apply && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-4" onClick={() => setApply(false)}>
          <div className="w-full max-w-[520px] rounded-xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            {sent ? (<div className="py-6 text-center"><span className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-[#E8F0FC] text-[#0552CC]"><Ic n="check" s={28} /></span><h2 className="text-xl font-bold">Application sent</h2><p className="mt-1 text-sm text-slate-500">Northstar Cloud will respond within 2 days. Track it under Applications.</p><div className="mt-4 flex justify-center gap-2"><Btn v="primary" onClick={() => { setApply(false); nav("applications"); }}>View applications</Btn><Btn v="gray" onClick={() => setApply(false)}>Close</Btn></div></div>) : (<>
              <div className="mb-4 flex items-center justify-between"><h2 className="text-xl font-bold">Apply to Northstar Cloud</h2><button onClick={() => setApply(false)} className="rounded-full p-2 hover:bg-slate-100"><Ic n="x" s={16} /></button></div>
              <div className="mb-3 flex items-center gap-3 rounded-lg bg-slate-50 p-3"><Av name="Gokul Raj" s={40} /><div><p className="text-sm font-semibold">Gokul Raj</p><p className="text-xs text-slate-500">gokul@company.com - Berlin, Germany</p></div></div>
              <label className="mb-1 block text-sm font-semibold">Resume</label>
              <div className="mb-3 flex items-center gap-2 rounded-lg border border-slate-200 p-3 text-sm"><Ic n="file" s={16} />Gokul_Raj_Resume.pdf<span className="ml-auto text-[#0552CC]">Change</span></div>
              <label className="mb-1 block text-sm font-semibold">Cover note</label>
              <textarea value={cover} onChange={(e) => setCover(e.target.value)} rows={5} className={inputCls} />
              <div className="mt-2 flex items-center gap-2 rounded-lg bg-[#F3F0FF] p-2 text-sm text-[#5B4BDB]"><Ic n="spark" s={14} />AI drafted this from your profile</div>
              <div className="mt-4 flex justify-end gap-2"><Btn v="gray" onClick={() => setApply(false)}>Cancel</Btn><Btn v="primary" icon="send" onClick={() => setSent(true)}>Submit application</Btn></div>
            </>)}
          </div>
        </div>
      )}
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
  const [tog, setTog] = useState<Record<string, boolean>>({ mfa: true, alerts: true, passkey: false, escrowLock: true });
  const [sessions, setSessions] = useState([["Chrome on macOS", "Berlin, Germany", "Current session", true], ["Safari on iPhone", "Berlin, Germany", "2 hours ago", false], ["Firefox on Windows", "Munich, Germany", "3 days ago", false]]);
  const rows = [["mfa", "Two-step verification", "Require a one-time code at every sign-in"], ["passkey", "Passkeys", "Sign in with your device instead of a code"], ["alerts", "Sign-in alerts", "Email me when a new device signs in"], ["escrowLock", "Payout protection", "Require confirmation before changing payout details"]];
  return (
    <Wrap w="max-w-none">
      <div className="mb-4"><h1 className="text-2xl font-bold">Security and trust</h1><p className="text-sm text-slate-500">Protect your account, payouts and data</p></div>
      <div className="mb-4 grid grid-cols-2 gap-3 xl:grid-cols-4">{[["Security score", "86 / 100", "shieldcheck"], ["Verified identity", "Complete", "check"], ["Active sessions", String(sessions.length), "lock"], ["Last review", "12 days ago", "clock"]].map((x: any) => <Card key={x[0]} c="rounded-xl" p="p-4"><div className="flex items-center justify-between text-slate-500"><span className="text-sm">{x[0]}</span><Ic n={x[2]} s={18} c="text-[#0552CC]" /></div><p className="mt-1 text-2xl font-bold">{x[1]}</p></Card>)}</div>
      <div className="grid gap-4 grid-cols-1 xl:grid-cols-2">
        <Card c="rounded-xl" p="p-5"><h2 className="mb-2 text-[17px] font-bold">Protection settings</h2>
          {rows.map((r: any) => <div key={r[0]} className="flex items-center gap-3 border-t border-slate-100 py-3"><div className="flex-1"><p className="font-semibold">{r[1]}</p><p className="text-sm text-slate-500">{r[2]}</p></div><button onClick={() => setTog({ ...tog, [r[0]]: !tog[r[0]] })} className={cx("h-6 w-11 rounded-full p-0.5 transition", tog[r[0]] ? "bg-[#0552CC]" : "bg-slate-300")}><span className={cx("block h-5 w-5 rounded-full bg-white transition", tog[r[0]] ? "translate-x-5" : "")} /></button></div>)}</Card>
        <Card c="rounded-xl" p="p-5"><h2 className="mb-2 text-[17px] font-bold">Where you are signed in</h2>
          {sessions.map((x: any, i: number) => <div key={x[0]} className="flex items-center gap-3 border-t border-slate-100 py-3"><span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#E8F0FC] text-[#0552CC]"><Ic n="lock" s={18} /></span><div className="flex-1"><p className="font-semibold">{x[0]}</p><p className="text-sm text-slate-500">{x[1]} - {x[2]}</p></div>{x[3] ? <Tag v="blue">This device</Tag> : <Btn v="outline" sm onClick={() => setSessions(sessions.filter((_: any, j: number) => j !== i))}>Sign out</Btn>}</div>)}</Card>
        <Card c="rounded-xl" p="p-5"><h2 className="mb-2 text-[17px] font-bold">Recent security activity</h2>
          {[["New sign-in from Berlin on Chrome", "Today 09:12"], ["Payout method verified", "Sep 21"], ["Two-step verification enabled", "Sep 02"], ["Password-less sign-in used", "Aug 28"]].map((x: any) => <div key={x[0]} className="flex justify-between border-t border-slate-100 py-3 text-sm"><span className="font-medium">{x[0]}</span><span className="text-slate-500">{x[1]}</span></div>)}</Card>
        <Card c="rounded-xl" p="p-5"><h2 className="mb-2 text-[17px] font-bold">How we protect you</h2>
          {[["Escrow-backed payments", "Funds are held until milestones are approved.", "wallet"], ["Immutable audit logging", "Every sensitive action is recorded.", "history"], ["Verified profiles", "Identity and skills checked on every profile.", "shieldcheck"], ["Data privacy", "GDPR-ready export and deletion controls.", "file"]].map((x: any) => <div key={x[0]} className="flex items-start gap-3 border-t border-slate-100 py-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#E8F0FC] text-[#0552CC]"><Ic n={x[2]} s={18} /></span><div><p className="font-semibold">{x[0]}</p><p className="text-sm text-slate-500">{x[1]}</p></div></div>)}<div className="mt-3 flex gap-2"><Btn v="outline" icon="download">Export my data</Btn><Btn v="danger">Delete account</Btn></div></Card>
      </div>
    </Wrap>
  );
}

export function Search() {
  const [t, setT] = useState("All");
  return (
    <Wrap w="max-w-[900px]">
      <h1 className="mb-3">Results for "ML engineer"</h1><Tabs items={["All", "Jobs", "People", "Companies"]} v={t} set={setT} />
      <div className="mt-4 space-y-3">{(t === "All" || t === "Jobs") && JOBS.slice(0, 2).map((j) => <Card key={j.id} c="rounded-xl"><div className="flex items-center gap-3"><Lg name={j.co} s={44} r={8} /><div className="flex-1"><p className="font-semibold text-[#0552CC]">{j.t}</p><p className="text-sm text-slate-500">{j.co} - {j.loc}</p></div><Tag t="gray">Job</Tag></div></Card>)}{(t === "All" || t === "People") && PEOPLE.slice(0, 3).map((p) => <Card key={p.n} c="rounded-xl"><div className="flex items-center gap-3"><Av name={p.n} s={44} /><div className="flex-1"><p className="font-semibold text-[#0552CC]">{p.n}</p><p className="text-sm text-slate-500">{p.t}</p></div><Tag t="gray">Person</Tag></div></Card>)}{(t === "All" || t === "Companies") && ["Northstar Cloud", "Helix Labs"].map((c) => <Card key={c} c="rounded-xl"><div className="flex items-center gap-3"><Lg name={c} s={44} r={8} /><p className="flex-1 font-semibold text-[#0552CC]">{c}</p><Tag t="gray">Company</Tag></div></Card>)}</div>
    </Wrap>
  );
}

export function CoProfile() {
  return (
    <Wrap w="max-w-[900px]">
      <div className="mb-4"><h1>Company profile</h1><p className="text-sm text-slate-500">This is how candidates see your organization</p></div>
      <Card c="rounded-xl"><div className="mb-4 flex items-center gap-4"><Lg name="Northstar Cloud" s={72} r={14} /><Btn v="outline">Change logo</Btn></div><div className="grid gap-3 grid-cols-1 md:grid-cols-2"><Field label="Organization name"><input defaultValue="Northstar Cloud" className={inputCls} /></Field><Field label="Industry"><input defaultValue="Cloud infrastructure" className={inputCls} /></Field><Field label="Size"><select className={inputCls}><option>201-500</option><option>51-200</option></select></Field><Field label="Location"><input defaultValue="Remote (US/EU)" className={inputCls} /></Field><Field label="Website"><input defaultValue="northstar.example" className={inputCls} /></Field></div><div className="mt-3"><Field label="Description"><textarea rows={4} className={cx(inputCls, "h-auto py-2")} defaultValue="We build production AI infrastructure for remote-first teams." /></Field></div><Btn v="primary" c="mt-4">Save profile</Btn></Card>
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
  const [j, setJ] = useState(false);
  return (
    <Wrap>
      <Card p={false} c="overflow-hidden rounded-xl"><div className="h-40 bg-gradient-to-r from-[#0552CC] to-[#5B9BFF]" /><div className="flex flex-wrap items-center justify-between gap-3 p-5"><div><h1>LLMOps Engineers</h1><p className="text-sm text-slate-500">Public group - 12.4K members</p></div><Btn v={j ? "gray" : "primary"} onClick={() => setJ(!j)}>{j ? "Joined" : "Join group"}</Btn></div></Card>
      <div className="mt-4 grid gap-4 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_300px]"><div className="space-y-3">{[["Priya Raman", "Anyone benchmarking rerankers on long-tail queries? We got +9 nDCG with a small cross-encoder."], ["Mateo Silva", "Sharing our Delta Live Tables CDC template for the group."]].map((p) => <Card key={p[0]} c="rounded-xl"><div className="flex items-center gap-3"><Av name={p[0]} s={40} /><div><p className="font-semibold">{p[0]}</p><p className="text-xs text-slate-500">2h</p></div></div><p className="mt-3 text-slate-700">{p[1]}</p><div className="mt-3 flex gap-4 border-t border-slate-200 pt-2 text-sm font-semibold text-slate-500"><span>Like</span><span>Comment</span><span>Share</span></div></Card>)}</div><Card c="rounded-xl"><h3>About</h3><p className="mt-2 text-sm text-slate-600">Practical discussions on running LLM systems in production.</p></Card></div>
    </Wrap>
  );
}
