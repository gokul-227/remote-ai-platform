// @ts-nocheck -- Figma Make export, kept verbatim (never type-checked upstream).
import { useState } from "react";
import { Ic, Av, Lg, Btn, Card, Tag, Tabs, Modal, Bar, Bars, Stars, cx, PEOPLE, Field, inputCls } from "./rap_kit";

const GR = "#0552CC";
const WORK = [
  { id: 1, t: "Build a production RAG pipeline with evaluation harness", tm: "Posted 12 minutes ago", kind: "Hourly: $80.00 - $120.00", lvl: "Expert", est: "Est. time: 3 to 6 months, 30+ hrs/week", d: "We need a senior engineer to design a retrieval-augmented generation pipeline over 2M documents, including chunking, hybrid search, reranking and an automated evaluation harness with weekly reports. You will work with our product and data teams asynchronously.", sk: ["RAG", "Python", "Vector databases", "LLM evaluation"], pr: "Less than 5", co: "Helix Labs", loc: "Germany", spent: "$48K+ spent", rate: 4.9, ver: true },
  { id: 2, t: "Databricks lakehouse migration - milestone-based", tm: "Posted 1 hour ago", kind: "Fixed-price - Budget: $18,000", lvl: "Intermediate", est: "Est. time: 1 to 3 months", d: "Migrate a legacy warehouse to Databricks with Delta Live Tables, Unity Catalog governance and CDC ingestion. Three milestones with acceptance tests defined upfront.", sk: ["Databricks", "Delta Lake", "Spark", "dbt"], pr: "5 to 10", co: "Brightpath", loc: "United States", spent: "$210K+ spent", rate: 4.8, ver: true },
  { id: 3, t: "AI agent console: product design and prototype", tm: "Posted 3 hours ago", kind: "Hourly: $60.00 - $90.00", lvl: "Intermediate", est: "Est. time: 1 to 3 months, 10-30 hrs/week", d: "Design an agent operations console covering run history, tool traces, evaluations and approvals. Deliver a Figma system and a clickable prototype.", sk: ["Figma", "Design systems", "SaaS UX"], pr: "10 to 15", co: "Northstar Cloud", loc: "Canada", spent: "$92K+ spent", rate: 5.0, ver: true },
  { id: 4, t: "Kubernetes and Terraform platform hardening", tm: "Posted 5 hours ago", kind: "Hourly: $70.00 - $110.00", lvl: "Expert", est: "Est. time: Less than 1 month", d: "Harden a multi-region EKS platform: cluster policy, IaC review, cost controls and disaster recovery drills.", sk: ["Kubernetes", "Terraform", "AWS", "Security"], pr: "15 to 20", co: "CloudNova", loc: "United Kingdom", spent: "$15K+ spent", rate: 4.6, ver: false },
];

export function Work() {
  const [tab, setTab] = useState("Best Matches");
  const [sel, setSel] = useState<(typeof WORK)[number] | null>(null);
  const [saved, setSaved] = useState<number[]>([]);
  const [prop, setProp] = useState(false);
  const [bid, setBid] = useState(100);
  const fee = bid * 0.1;
  return (
    <div className="bg-white">
      <div className="mx-auto max-w-[1300px] px-4 py-6">
        <h1 className="text-3xl font-light">Jobs you might like</h1>
        <div className="mt-4 flex gap-2"><div className="flex h-11 flex-1 items-center gap-2 rounded-full border border-slate-300 px-4"><Ic n="search" c="text-slate-500" /><input placeholder="Search for jobs" className="flex-1 outline-none" /></div><button className="rounded-full px-6 font-semibold text-white" style={{ background: GR }}>Search</button></div>
        <div className="mt-5 grid gap-8 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_300px]">
          <div>
            <Tabs items={["Best Matches", "Most Recent", "Saved Jobs " + saved.length]} v={tab} set={setTab} />
            <p className="py-3 text-sm text-slate-500">Browse jobs that match your experience to a client's hiring preferences. Ordered by most relevant.</p>
            {WORK.filter((w) => tab.startsWith("Saved") ? saved.includes(w.id) : true).map((w) => (
              <div key={w.id} onClick={() => setSel(w)} className="cursor-pointer border-t border-slate-200 p-4 hover:bg-slate-50">
                <div className="flex justify-between"><p className="text-xs text-slate-500">{w.tm}</p><div className="flex gap-2"><button onClick={(e) => { e.stopPropagation(); }} className="rounded-full border border-slate-300 p-1.5 text-slate-500"><Ic n="thumb" s={16} c="rotate-180" /></button><button onClick={(e) => { e.stopPropagation(); setSaved(saved.includes(w.id) ? saved.filter((x) => x !== w.id) : [...saved, w.id]); }} className={cx("rounded-full border p-1.5", saved.includes(w.id) ? "border-[#0552CC] text-[#0552CC]" : "border-slate-300 text-slate-500")}><Ic n="heart" s={16} c={saved.includes(w.id) ? "fill-current" : ""} /></button></div></div>
                <h3 className="mt-1 text-lg font-semibold hover:underline" style={{ color: GR }}>{w.t}</h3>
                <p className="mt-1 text-xs text-slate-500">{w.kind} - {w.lvl} - {w.est}</p>
                <p className="mt-2 line-clamp-2 text-[15px] leading-6 text-slate-700">{w.d}</p>
                <div className="mt-3 flex flex-wrap gap-2">{w.sk.map((s) => <span key={s} className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">{s}</span>)}</div>
                <p className="mt-3 flex flex-wrap items-center gap-3 text-xs text-slate-500"><span className="flex items-center gap-1">{w.ver ? <><Ic n="shieldcheck" s={14} c="text-[#0552CC]" />Payment verified</> : "Payment unverified"}</span><Stars v={w.rate} /><span>{w.spent}</span><span className="flex items-center gap-1"><Ic n="pin" s={12} />{w.loc}</span></p>
                <p className="mt-1 text-xs text-slate-500">Proposals: <b>{w.pr}</b></p>
              </div>
            ))}
          </div>
          <aside className="hidden space-y-4 lg:block">
            <Card c="rounded-lg"><div className="flex items-center gap-3"><Av name="Gokul Raj" s={64} /><div><p className="font-semibold">Gokul R.</p><p className="text-sm text-slate-600">Data and AI platform engineer</p></div></div><Btn v="outline" full sm c="mt-3">Complete your profile</Btn><div className="mt-3"><div className="mb-1 flex justify-between text-xs"><span>Profile completeness</span><b>86%</b></div><Bar v={86} c="bg-[#0552CC]" /></div></Card>
            <Card c="rounded-lg"><p className="font-semibold">Availability</p><p className="text-sm text-slate-600">More than 30 hrs/week</p><p className="mt-3 font-semibold">Connects</p><p className="text-sm text-slate-600">42 available - <span style={{ color: GR }}>View details</span></p></Card>
            <Card c="rounded-lg"><p className="mb-2 font-semibold">Your categories</p>{["AI and machine learning", "Data engineering", "DevOps and cloud"].map((c) => <p key={c} className="border-b border-slate-100 py-2 text-sm" style={{ color: GR }}>{c}</p>)}</Card>
          </aside>
        </div>
      </div>
      {sel && (
        <div className="fixed inset-0 z-[90] flex justify-end bg-black/40" onClick={() => setSel(null)}>
          <div className="h-full w-full max-w-3xl overflow-y-auto bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="sticky top-0 flex items-center justify-between border-b border-slate-200 bg-white p-4"><button onClick={() => setSel(null)} className="rounded-full p-1.5 hover:bg-slate-100"><Ic n="x" /></button><div className="flex gap-2"><Btn v="outline" icon="heart">Save job</Btn><Btn v="primary" onClick={() => setProp(true)}>Apply now</Btn></div></div>
            <div className="grid gap-6 p-6 grid-cols-1 md:grid-cols-[1fr_240px]">
              <div><h2 className="text-2xl font-semibold">{sel.t}</h2><p className="mt-1 text-sm text-slate-500">{sel.tm} - Worldwide</p><p className="mt-4 whitespace-pre-line text-[15px] leading-7 text-slate-700">{sel.d}</p><div className="mt-5 grid grid-cols-3 gap-4 border-y border-slate-200 py-4 text-sm"><div><p className="font-semibold">{sel.lvl}</p><p className="text-slate-500">Experience level</p></div><div><p className="font-semibold">{sel.kind.split(" - ")[0]}</p><p className="text-slate-500">Budget</p></div><div><p className="font-semibold">Remote</p><p className="text-slate-500">Location</p></div></div><p className="mt-4 font-semibold">Skills and expertise</p><div className="mt-2 flex flex-wrap gap-2">{sel.sk.map((s) => <span key={s} className="rounded-full bg-slate-100 px-3 py-1 text-sm">{s}</span>)}</div><p className="mt-5 font-semibold">Activity on this job</p><p className="mt-1 text-sm text-slate-600">Proposals: {sel.pr} - Interviewing: 2 - Invites sent: 6</p></div>
              <div className="space-y-4"><Card c="rounded-lg"><p className="font-semibold">About the client</p><p className="mt-2 flex items-center gap-1 text-sm"><Ic n="shieldcheck" s={16} c="text-[#0552CC]" />Payment method verified</p><Stars v={sel.rate} /><p className="mt-2 text-sm font-semibold">{sel.co}</p><p className="text-sm text-slate-500">{sel.loc}</p><p className="mt-2 text-sm">{sel.spent} total - 86% hire rate</p></Card><Card c="rounded-lg"><p className="font-semibold">Send a proposal for: 16 Connects</p><p className="text-sm text-slate-500">Available Connects: 42</p></Card></div>
            </div>
          </div>
        </div>
      )}
      <Modal open={prop} onClose={() => setProp(false)} title="Submit a proposal" w="max-w-2xl">
        <p className="mb-1 font-semibold">Terms</p><p className="mb-3 text-sm text-slate-500">What is the rate you would like to bid for this job?</p>
        <div className="space-y-3 rounded-lg border border-slate-200 p-4">{[["Hourly rate", null], ["10% Remote-AI service fee", -fee], ["You will receive", bid - fee]].map(([l, v], i) => <div key={String(l)} className="flex items-center justify-between text-sm"><span className={i === 2 ? "font-bold" : ""}>{l}</span>{i === 0 ? <input type="number" value={bid} onChange={(e) => setBid(Number(e.target.value))} className="h-10 w-32 rounded-lg border border-slate-300 px-3 text-right" /> : <span className={i === 2 ? "font-bold" : ""}>{Number(v) < 0 ? "-" : ""}${Math.abs(Number(v)).toFixed(2)}/hr</span>}</div>)}</div>
        <Field label="Cover letter"><textarea rows={5} className={cx(inputCls, "mt-2 h-auto py-2")} placeholder="Introduce yourself and explain why you are a strong fit" /></Field>
        <div className="mt-3 flex items-center gap-2 rounded-lg bg-[#F6F4FF] p-3 text-sm text-[#5B4BDB]"><Ic n="spark" s={16} />AI can draft a cover letter from your profile and this job.<button className="ml-auto font-bold">Generate</button></div>
        <div className="mt-5 flex justify-end gap-2"><Btn v="outline" onClick={() => setProp(false)}>Cancel</Btn><Btn v="primary" onClick={() => setProp(false)}>Send for 16 Connects</Btn></div>
      </Modal>
    </div>
  );
}

export function Talent() {
  const [inv, setInv] = useState<string[]>([]);
  const [fav, setFav] = useState<string[]>([]);
  const tal = PEOPLE.filter((p) => p.rate > 0);
  return (
    <div className="bg-white">
      <div className="mx-auto max-w-[1300px] px-4 py-6">
        <h1 className="text-3xl font-light">Find talent</h1>
        <div className="mt-4 flex gap-2"><div className="flex h-11 flex-1 items-center gap-2 rounded-full border border-slate-300 px-4"><Ic n="search" c="text-slate-500" /><input defaultValue="ML engineer" className="flex-1 outline-none" /></div><button className="rounded-full px-6 font-semibold text-white" style={{ background: GR }}>Search</button></div>
        <div className="mt-6 grid gap-8 grid-cols-1 lg:grid-cols-[240px_minmax(0,1fr)]">
          <aside className="space-y-5 text-sm">{[["Category", ["AI and ML", "Data engineering", "Design", "DevOps"]], ["Job success", ["Any", "80% and up", "90% and up"]], ["Hourly rate", ["Any", "$30 - $60", "$60 - $100", "$100+"]], ["Experience level", ["Entry", "Intermediate", "Expert"]]].map(([h, o]) => <div key={String(h)}><p className="mb-2 font-semibold">{h}</p>{(o as string[]).map((x) => <label key={x} className="flex items-center gap-2 py-1"><input type="checkbox" />{x}</label>)}</div>)}</aside>
          <div>
            <p className="mb-3 text-sm text-slate-500">{tal.length} freelancers match your search</p>
            {tal.map((p) => (
              <div key={p.n} className="flex gap-4 border-t border-slate-200 p-5 hover:bg-slate-50">
                <Av name={p.n} s={72} dot={p.on} />
                <div className="min-w-0 flex-1"><div className="flex items-center gap-2"><h3 className="text-lg font-semibold" style={{ color: GR }}>{p.n}</h3>{p.jss >= 97 && <Tag v="blue">Top Rated Plus</Tag>}</div><p className="font-semibold">{p.t}</p><p className="mt-1 text-sm text-slate-600"><b>{"$" + p.rate}/hr</b> - {p.earn} earned - <span className="inline-flex items-center gap-1"><Ic n="target" s={14} c="text-[#0552CC]" />{p.jss}% Job Success</span> - {p.loc}</p><p className="mt-2 line-clamp-2 text-sm text-slate-600">Delivered {p.jobs} projects for remote teams. Specializes in {p.skills.slice(0, 3).join(", ")} with strong written communication and documented handovers.</p><div className="mt-2 flex flex-wrap gap-2">{p.skills.map((s) => <span key={s} className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">{s}</span>)}</div></div>
                <div className="flex flex-col items-end gap-2"><button onClick={() => setFav(fav.includes(p.n) ? fav.filter((x) => x !== p.n) : [...fav, p.n])} className={cx("rounded-full border p-2", fav.includes(p.n) ? "border-[#0552CC] text-[#0552CC]" : "border-slate-300 text-slate-500")}><Ic n="heart" s={16} c={fav.includes(p.n) ? "fill-current" : ""} /></button><Btn v={inv.includes(p.n) ? "gray" : "primary"} onClick={() => setInv([...inv, p.n])}>{inv.includes(p.n) ? "Invited" : "Invite to job"}</Btn><Btn v="outline" sm>Message</Btn></div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

const MS0 = [["Discovery and architecture", "$4,000", "Released", 100], ["Ingestion and CDC pipelines", "$6,200", "Released", 100], ["Unity Catalog and governance", "$5,000", "In review", 80], ["Cutover and handover", "$3,200", "Not funded", 0]];
export function Contracts() {
  const [tab, setTab] = useState("Active");
  const [open, setOpen] = useState(true);
  const [ms, setMs] = useState(MS0);
  const [dt, setDt] = useState("Milestones");
  const rows = [["Databricks lakehouse migration", "Brightpath", "$18,400", "Milestone 3 in review", 68], ["RAG platform delivery sprint", "Helix Labs", "$12,200", "Weekly retainer active", 42], ["LLM evaluation audit", "Northstar Cloud", "$9,800", "Awaiting kickoff", 12]];
  return (
    <div className="bg-[#F1F2F4] py-6">
      <div className="mx-auto max-w-[1300px] px-4">
        <div className="mb-4 flex items-center justify-between"><h1 className="text-3xl font-light">Contracts</h1><Btn v="primary" icon="plus">Send offer</Btn></div>
        <Card p={false} c="rounded-lg"><Tabs items={["Active", "Paused", "Ended", "Disputes"]} v={tab} set={setTab} c="px-3" />
          {rows.map((r, i) => <div key={r[0] as string} onClick={() => setOpen(i === 0)} className="flex cursor-pointer items-center gap-4 border-b border-slate-100 p-4 hover:bg-slate-50"><Lg name={String(r[1])} s={44} r={8} /><div className="flex-1"><p className="font-semibold" style={{ color: GR }}>{r[0]}</p><p className="text-sm text-slate-500">{r[1]} - {r[3]}</p></div><div className="hidden w-48 md:block"><Bar v={Number(r[4])} c="bg-[#0552CC]" /><p className="mt-1 text-xs text-slate-500">{r[4]}% complete</p></div><p className="w-24 text-right font-semibold">{r[2]}</p></div>)}
        </Card>
        {open && (
          <Card c="mt-5 rounded-lg" p={false}>
            <div className="flex flex-wrap items-start justify-between gap-4 p-6"><div><Tag v="blue">Active - Fixed price</Tag><h2 className="mt-2 text-2xl font-semibold">Databricks lakehouse migration</h2><p className="text-sm text-slate-500">Contract RC-2291 - Client Brightpath - Started Aug 4, 2026</p></div><div className="flex gap-6 text-right">{[["Budget", "$18,400"], ["In escrow", "$5,000"], ["Paid", "$10,200"]].map((s) => <div key={s[0]}><p className="text-xs text-slate-500">{s[0]}</p><p className="text-xl font-semibold">{s[1]}</p></div>)}</div></div>
            <Tabs items={["Milestones", "Messages", "Files", "Time and activity", "Feedback"]} v={dt} set={setDt} c="px-4" />
            <div className="p-6">
              {ms.map((m, i) => (
                <div key={i} className="mb-3 flex flex-wrap items-center gap-4 rounded-lg border border-slate-200 p-4">
                  <span className={cx("flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold", m[2] === "Released" ? "bg-emerald-100 text-emerald-700" : m[2] === "In review" ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-500")}>{m[2] === "Released" ? <Ic n="check" s={16} /> : i + 1}</span>
                  <div className="min-w-[200px] flex-1"><p className="font-semibold">{m[0]}</p><div className="mt-1 max-w-xs"><Bar v={Number(m[3])} c={m[2] === "Released" ? "bg-emerald-500" : "bg-amber-500"} /></div></div>
                  <Tag t={m[2] === "Released" ? "primary" : m[2] === "In review" ? "amber" : "gray"}>{m[2]}</Tag><p className="w-20 text-right font-semibold">{m[1]}</p>
                  {m[2] === "In review" && <><Btn v="line" sm onClick={() => setMs(ms.map((x, j) => j === i ? [x[0], x[1], "Not funded", 60] : x))}>Request changes</Btn><Btn v="primary" sm onClick={() => setMs(ms.map((x, j) => j === i ? [x[0], x[1], "Released", 100] : x))}>Approve and release</Btn></>}
                  {m[2] === "Not funded" && <Btn v="outline" sm onClick={() => setMs(ms.map((x, j) => j === i ? [x[0], x[1], "In review", 20] : x))}>Fund milestone</Btn>}
                </div>
              ))}
              <div className="mt-4 flex items-center gap-3 rounded-lg bg-slate-50 p-4 text-sm"><Ic n="shieldcheck" c="text-[#0552CC]" s={22} />Funds are held in escrow and released only when you approve the work. Need help? <button className="font-semibold" style={{ color: GR }}>Open a dispute</button></div>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}

export function Earnings() {
  const [w, setW] = useState(false);
  const tx = [["Sep 21", "Milestone 2 - Databricks lakehouse", "Brightpath", "+$6,200.00", "Paid"], ["Sep 14", "Weekly retainer - RAG delivery", "Helix Labs", "+$2,880.00", "Paid"], ["Sep 09", "Service fee (10%)", "Remote-AI", "-$620.00", "Fee"], ["Sep 02", "Milestone 1 - Discovery", "Brightpath", "+$4,000.00", "Paid"], ["Aug 28", "Withdrawal to bank", "Payout", "-$8,000.00", "Sent"]];
  return (
    <div className="bg-[#F1F2F4] py-6">
      <div className="mx-auto max-w-[1300px] px-4">
        <div className="mb-4 flex items-center justify-between"><h1 className="text-3xl font-light">Earnings and payments</h1><Btn v="primary" onClick={() => setW(true)}>Withdraw funds</Btn></div>
        <div className="grid gap-4 grid-cols-1 md:grid-cols-4">{[["Available now", "$8,420.00", "wallet"], ["In escrow", "$5,000.00", "lock"], ["Pending review", "$3,200.00", "clock"], ["Earned this year", "$96,340.00", "trend"]].map((s) => <Card key={s[0]} c="rounded-lg"><div className="flex items-center justify-between text-slate-500"><span className="text-sm">{s[0]}</span><Ic n={s[2]} s={18} /></div><p className="mt-2 text-2xl font-semibold">{s[1]}</p></Card>)}</div>
        <div className="mt-4 grid gap-4 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_340px]">
          <Card c="rounded-lg"><p className="font-semibold">Earnings by month</p><div className="mt-4"><Bars d={[4200, 6100, 5300, 7800, 9200, 8400, 11800, 14200, 13400]} c="#0552CC" h={180} /></div><div className="mt-2 flex justify-between text-xs text-slate-500">{["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep"].map((m) => <span key={m}>{m}</span>)}</div></Card>
          <Card c="rounded-lg"><p className="font-semibold">Payout methods</p>{[["Bank account (SEPA)", "DE89 **** 3000", true], ["PayPal", "gokul@***.com", false]].map((p) => <div key={String(p[0])} className="mt-3 flex items-center gap-3 rounded-lg border border-slate-200 p-3"><Ic n="wallet" c="text-slate-500" /><div className="flex-1"><p className="text-sm font-semibold">{p[0]}</p><p className="text-xs text-slate-500">{p[1]}</p></div>{p[2] && <Tag v="blue">Default</Tag>}</div>)}<Btn v="outline" full sm c="mt-3" icon="plus">Add method</Btn></Card>
        </div>
        <Card c="mt-4 rounded-lg" p={false}><p className="p-4 font-semibold">Transaction history</p><table className="w-full text-sm"><thead className="bg-slate-50 text-left text-xs uppercase text-slate-500"><tr>{["Date", "Description", "Client", "Amount", "Status"].map((h) => <th key={h} className="px-4 py-2">{h}</th>)}</tr></thead><tbody>{tx.map((r, i) => <tr key={i} className="border-t border-slate-100">{r.map((c, j) => <td key={j} className={cx("px-4 py-3", j === 3 && (String(c).startsWith("+") ? "font-semibold text-emerald-700" : "font-semibold"))}>{j === 4 ? <Tag t={c === "Paid" ? "primary" : "gray"}>{c}</Tag> : c}</td>)}</tr>)}</tbody></table></Card>
      </div>
      <Modal open={w} onClose={() => setW(false)} title="Withdraw funds"><p className="text-sm text-slate-500">Available: $8,420.00</p><div className="mt-3 space-y-3"><Field label="Amount"><input defaultValue="8,420.00" className={inputCls} /></Field><Field label="Method"><select className={inputCls}><option>Bank account (SEPA) - 1-2 business days</option><option>PayPal - instant</option></select></Field></div><Btn v="primary" full c="mt-5" onClick={() => setW(false)}>Confirm withdrawal</Btn></Modal>
    </div>
  );
}

export function CoPayments() {
  const [modal, setModal] = useState<string | null>(null);
  const escrows = [
    { id: "ESC-4471", contract: "Priya Raman - Milestone 2", amount: "$6,200.00", status: "Held", milestone: "Lakehouse migration - Phase 2", due: "Sep 28" },
    { id: "ESC-4460", contract: "Mateo Silva - Milestone 1", amount: "$3,500.00", status: "Held", milestone: "Agent console redesign - Discovery", due: "Oct 03" },
    { id: "ESC-4452", contract: "Elena Petrova - Retainer", amount: "$2,880.00", status: "Released", milestone: "Weekly RAG evaluation retainer", due: "Sep 14" },
    { id: "ESC-4438", contract: "Daniel Okafor - Milestone 3", amount: "$4,000.00", status: "Refunded", milestone: "Lakehouse migration - Phase 1 (disputed)", due: "Aug 30" },
  ];
  const tx = [["Sep 21", "Escrow funded - Milestone 2", "Priya Raman", "-$6,200.00", "Funded"], ["Sep 14", "Escrow released - Retainer", "Elena Petrova", "-$2,880.00", "Released"], ["Sep 09", "Platform fee (10%)", "Remote-AI", "-$288.00", "Fee"], ["Aug 30", "Escrow refunded - Milestone 1", "Daniel Okafor", "+$4,000.00", "Refunded"], ["Aug 24", "Wallet top-up", "Stripe", "+$25,000.00", "Received"]];
  return (
    <div className="bg-[#F1F2F4] py-6">
      <div className="mx-auto max-w-[1300px] px-4">
        <div className="mb-4 flex items-center justify-between"><h1 className="text-3xl font-light">Payments and escrow</h1><Btn v="primary" onClick={() => setModal("fund")}>Fund escrow</Btn></div>
        <div className="grid gap-4 grid-cols-1 md:grid-cols-4">{[["Wallet balance", "$18,120.00", "wallet"], ["In escrow", "$9,700.00", "lock"], ["Released this month", "$14,880.00", "check"], ["Spent this year", "$212,400.00", "trend"]].map((s) => <Card key={s[0]} c="rounded-lg"><div className="flex items-center justify-between text-slate-500"><span className="text-sm">{s[0]}</span><Ic n={s[2]} s={18} /></div><p className="mt-2 text-2xl font-semibold">{s[1]}</p></Card>)}</div>
        <div className="mt-4 grid gap-4 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_340px]">
          <Card c="rounded-lg"><p className="font-semibold">Escrow held - active milestones</p>{escrows.map((e) => <div key={e.id} className="flex items-center gap-3 border-t border-slate-100 py-3 first:border-0"><div className="flex-1"><p className="text-sm font-semibold">{e.milestone}</p><p className="text-xs text-slate-500">{e.contract} - due {e.due}</p></div><Tag t={e.status === "Held" ? "amber" : e.status === "Released" ? "green" : "red"}>{e.status}</Tag><b className="w-24 text-right">{e.amount}</b>{e.status === "Held" && <div className="flex gap-2"><Btn v="gray" sm onClick={() => setModal("refund:" + e.id)}>Refund</Btn><Btn v="primary" sm onClick={() => setModal("release:" + e.id)}>Release</Btn></div>}</div>)}</Card>
          <Card c="rounded-lg"><p className="font-semibold">Payment method</p><div className="mt-3 flex items-center gap-3 rounded-lg border border-slate-200 p-3"><Ic n="wallet" s={20} c="text-[#0552CC]" /><div className="flex-1"><p className="text-sm font-semibold">Visa **** 4471</p><p className="text-xs text-slate-500">Stripe - default</p></div><Tag t="green">Active</Tag></div><Btn v="outline" full c="mt-3">Add payment method</Btn></Card>
        </div>
        <Card c="mt-4 rounded-lg" p={false}><p className="p-4 font-semibold">Transaction history</p><table className="w-full text-sm"><thead className="bg-slate-50 text-left text-xs uppercase text-slate-500"><tr>{["Date", "Description", "Party", "Amount", "Status"].map((h) => <th key={h} className="px-4 py-2">{h}</th>)}</tr></thead><tbody>{tx.map((r, i) => <tr key={i} className="border-t border-slate-100"><td className="px-4 py-3 text-slate-500">{r[0]}</td><td className="px-4 py-3">{r[1]}</td><td className="px-4 py-3">{r[2]}</td><td className={cx("px-4 py-3 font-semibold", r[3].startsWith("+") ? "text-emerald-600" : "text-slate-900")}>{r[3]}</td><td className="px-4 py-3"><Tag t="gray">{r[4]}</Tag></td></tr>)}</tbody></table></Card>
      </div>
      <Modal open={!!modal} onClose={() => setModal(null)} title={modal && modal.indexOf("fund") === 0 ? "Fund escrow" : modal && modal.indexOf("release") === 0 ? "Release milestone" : modal && modal.indexOf("refund") === 0 ? "Refund escrow" : ""}>
        <p className="text-sm text-slate-600">{modal && modal.indexOf("fund") === 0 ? "Move funds from your wallet into escrow for a contract milestone." : modal && modal.indexOf("release") === 0 ? "Approve this milestone and release the held funds to the engineer's wallet." : "Return the held funds to your wallet. The engineer will be notified."}</p>
        <div className="mt-4 flex justify-end gap-2"><Btn v="gray" onClick={() => setModal(null)}>Cancel</Btn><Btn v="primary" onClick={() => setModal(null)}>Confirm</Btn></div>
      </Modal>
    </div>
  );
}

export function TaskMarketplace() {
  const [tab, setTab] = useState("open");
  const [modal, setModal] = useState<string | null>(null);
  const open = [
    { id: "T-812", title: "Wire hybrid retrieval scores into match explanation payload", project: "Matching v2 - Northstar Cloud", budget: "$1,200", offers: 3, due: "Sep 30" },
    { id: "T-809", title: "Add CDC connector for orders table", project: "Lakehouse migration - Brightpath", budget: "$2,400", offers: 1, due: "Oct 05" },
    { id: "T-804", title: "Write eval harness for agent tool-use accuracy", project: "Agent console redesign - Helix Labs", budget: "$900", offers: 5, due: "Sep 27" },
  ];
  const myOffers = [
    { id: "T-798", title: "Add Okta SAML provisioning hooks", amount: "$1,800", status: "Pending" },
    { id: "T-791", title: "Backfill trust score for legacy profiles", amount: "$650", status: "Accepted" },
    { id: "T-780", title: "Reduce cold-start latency for match API", amount: "$1,100", status: "Declined" },
  ];
  const submissions = [
    { id: "S-231", task: "Backfill trust score for legacy profiles", status: "Approved", ai: 92, note: "Clean migration, covered by tests. AI review flagged no regressions." },
    { id: "S-225", task: "Fix duplicate job detection false positives", status: "In AI review", ai: null, note: "Awaiting automated quality pass before human review." },
    { id: "S-219", task: "Add rate-limit backoff to job aggregator", status: "Changes requested", ai: 68, note: "AI review found missing retry-jitter and one untested branch." },
  ];
  const reviews = [
    { from: "Northstar Cloud", rating: 5, text: "Shipped ahead of schedule and documented everything clearly.", proj: "Matching v2" },
    { from: "Helix Labs", rating: 5, text: "Excellent communicator, caught issues before they became problems.", proj: "Agent console redesign" },
    { from: "Brightpath", rating: 4, text: "Solid delivery, one milestone needed an extra review pass.", proj: "Lakehouse migration" },
  ];
  const TABS: [string, string][] = [["open", "Open tasks"], ["offers", "My offers"], ["submissions", "Submissions"], ["reviews", "Reputation"]];
  return (
    <div className="bg-[#F1F2F4] py-6">
      <div className="mx-auto max-w-[1300px] px-4">
        <div className="mb-4"><h1 className="text-3xl font-light">Task marketplace</h1><p className="text-sm text-slate-500">Bid on open tasks inside active projects, track submissions and AI review, and see your reputation.</p></div>
        <div className="mb-4 flex gap-1 border-b border-slate-200">{TABS.map(([k, l]) => <button key={k} onClick={() => setTab(k)} className={cx("border-b-2 px-4 py-2 text-sm font-semibold", tab === k ? "border-[#0552CC] text-[#0552CC]" : "border-transparent text-slate-500 hover:text-slate-800")}>{l}</button>)}</div>

        {tab === "open" && (
          <div className="space-y-3">{open.map((t) => <Card key={t.id} c="rounded-lg"><div className="flex items-center gap-4"><div className="flex-1"><p className="font-semibold">{t.title}</p><p className="text-sm text-slate-500">{t.project} - due {t.due}</p></div><Tag t="blue">{t.offers} offers</Tag><b className="w-20 text-right">{t.budget}</b><Btn v="primary" sm onClick={() => setModal("offer:" + t.id)}>Make offer</Btn></div></Card>)}</div>
        )}

        {tab === "offers" && (
          <Card c="rounded-lg" p={false}><table className="w-full text-sm"><thead className="bg-slate-50 text-left text-xs uppercase text-slate-500"><tr>{["Task", "Amount", "Status", ""].map((h) => <th key={h} className="px-4 py-2">{h}</th>)}</tr></thead><tbody>{myOffers.map((o) => <tr key={o.id} className="border-t border-slate-100"><td className="px-4 py-3 font-semibold">{o.title}</td><td className="px-4 py-3">{o.amount}</td><td className="px-4 py-3"><Tag t={o.status === "Accepted" ? "green" : o.status === "Declined" ? "red" : "amber"}>{o.status}</Tag></td><td className="px-4 py-3 text-right">{o.status === "Pending" && <Btn v="gray" sm onClick={() => setModal("cancel:" + o.id)}>Cancel</Btn>}</td></tr>)}</tbody></table></Card>
        )}

        {tab === "submissions" && (
          <div className="space-y-3">{submissions.map((s) => <Card key={s.id} c="rounded-lg"><div className="flex items-start gap-4"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#E8F0FC] text-[#0552CC]"><Ic n="code" s={20} /></div><div className="flex-1"><p className="font-semibold">{s.task}</p><p className="mt-1 text-sm text-slate-500">{s.note}</p></div><div className="text-right"><Tag t={s.status === "Approved" ? "green" : s.status === "Changes requested" ? "red" : "amber"}>{s.status}</Tag>{s.ai !== null && <p className="mt-1 text-xs text-slate-500">AI quality score: <b className="text-slate-800">{s.ai}/100</b></p>}</div></div></Card>)}</div>
        )}

        {tab === "reviews" && (
          <>
            <div className="mb-4 grid gap-4 grid-cols-1 md:grid-cols-3">{[["Average rating", "4.8", "star"], ["Completed tasks", "64", "check"], ["Repeat clients", "9", "users"]].map((k) => <Card key={k[0]} c="rounded-lg"><div className="flex items-center justify-between text-slate-500"><span className="text-sm">{k[0]}</span><Ic n={k[2]} s={18} /></div><p className="mt-2 text-2xl font-semibold">{k[1]}</p></Card>)}</div>
            <div className="space-y-3">{reviews.map((r, i) => <Card key={i} c="rounded-lg"><div className="mb-1 flex items-center justify-between"><p className="font-semibold">{r.from}</p><span className="text-amber-500">{"\u2605".repeat(r.rating)}{"\u2606".repeat(5 - r.rating)}</span></div><p className="text-sm text-slate-600">{r.text}</p><p className="mt-1 text-xs text-slate-400">{r.proj}</p></Card>)}</div>
          </>
        )}
      </div>
      <Modal open={!!modal} onClose={() => setModal(null)} title={modal && modal.indexOf("offer") === 0 ? "Make an offer" : "Cancel offer"}>
        <p className="text-sm text-slate-600">{modal && modal.indexOf("offer") === 0 ? "Submit your bid amount and estimated delivery time for this task." : "Withdraw this offer. The client will be notified."}</p>
        <div className="mt-4 flex justify-end gap-2"><Btn v="gray" onClick={() => setModal(null)}>Cancel</Btn><Btn v="primary" onClick={() => setModal(null)}>Confirm</Btn></div>
      </Modal>
    </div>
  );
}
