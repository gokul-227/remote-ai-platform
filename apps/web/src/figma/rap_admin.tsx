import { useState } from "react";
import { Ic, Av, Btn, Card, Tag, Bar, Bars, cx, PEOPLE, COMPANIES } from "./rap_kit";

const IND = "#0552CC";

const NAV: [string, string, string][] = [
    ["Overview", "chart", "overview"],
    ["Users", "users", "market"],
    ["Organizations", "building", "market"],
    ["Jobs & listings", "briefcase", "market"],
    ["Verification queue", "shieldcheck", "market"],
    ["Moderation", "shield", "trust"],
    ["Disputes", "flag", "trust"],
    ["Security", "lock", "trust"],
    ["Payments & escrow", "wallet", "finance"],
    ["Payouts", "dollar", "finance"],
    ["Feature flags", "settings", "platform"],
    ["Integrations", "link", "platform"],
    ["Notifications", "bell", "platform"],
    ["Platform settings", "settings", "platform"],
    ["AI usage", "spark", "ops"],
    ["Job sync", "zap", "ops"],
    ["System health", "bolt", "ops"],
    ["Audit log", "history", "ops"],
  ];
const GROUPS: [string, string][] = [["overview", ""], ["market", "Marketplace"], ["trust", "Trust & safety"], ["finance", "Finance"], ["platform", "Platform"], ["ops", "Operations"]];

const KPI = [["Active users", "48,210", "+6.2%", "users"], ["Open jobs", "3,904", "+2.1%", "briefcase"], ["Escrow volume", "$2.41M", "+11%", "wallet"], ["Open disputes", "17", "-4", "flag"]];
const Q = [["Fake profile - Marco T.", "Identity mismatch on 2 documents", "high"], ["Payment dispute RC-2291", "Milestone 3 rejected twice", "medium"], ["Spam job post - Zeta Ltd", "Reported 9 times in 1 hour", "high"], ["Content report - feed post", "Harassment reported by 3 users", "low"]];
const LOG = [["09:42", "Aisha Rahman", "Suspended account", "user 8821"], ["09:31", "System", "Released escrow", "RC-2288"], ["09:12", "Kenji W.", "Updated policy", "Trust v4.2"], ["08:55", "Priya R.", "Approved verification", "user 7710"], ["08:41", "System", "SSO metadata rotated", "Northstar Cloud"], ["08:20", "Marius V.", "Created feature flag", "Reactions v2"], ["07:58", "System", "Escrow funded", "RC-2301"], ["07:44", "Elena P.", "Invited teammate", "biplab@aster.dev"]];

const ORGS = [
  { n: "Northstar Cloud", plan: "Enterprise", seats: 42, jobs: 18, spend: "$84,200", status: "Active", ssoStatus: "Connected", since: "Mar 2025" },
  { n: "Helix Labs", plan: "Growth", seats: 16, jobs: 9, spend: "$31,900", status: "Active", ssoStatus: "Not connected", since: "Jul 2025" },
  { n: "Brightpath", plan: "Enterprise", seats: 28, jobs: 14, spend: "$52,600", status: "Active", ssoStatus: "Connected", since: "Jan 2025" },
  { n: "Aster Labs", plan: "Growth", seats: 11, jobs: 5, spend: "$14,300", status: "Trial", ssoStatus: "Not connected", since: "Sep 2026" },
  { n: "CloudNova", plan: "Enterprise", seats: 35, jobs: 21, spend: "$71,050", status: "Active", ssoStatus: "Connected", since: "Nov 2024" },
  { n: "Vector Forge", plan: "Starter", seats: 4, jobs: 2, spend: "$2,400", status: "Past due", ssoStatus: "Not connected", since: "Aug 2026" },
  ];
const DISPUTES = [
  { id: "RC-2291", parties: "Priya Raman - Helix Labs", amount: "$4,200", stage: "Milestone rejected twice", opened: "3 days ago", risk: "high" },
  { id: "RC-2278", parties: "Lucas Meyer - Aster Labs", amount: "$1,850", stage: "Awaiting evidence", opened: "6 days ago", risk: "medium" },
  { id: "RC-2260", parties: "Sofia Alvarez - Brightpath", amount: "$900", stage: "Escrow held pending review", opened: "1 week ago", risk: "low" },
  ];

const PAYOUTS = [
  { n: "Priya Raman", method: "Wire - HDFC ***4821", amount: "$8,400", status: "Processing" },
  { n: "Mateo Silva", method: "SEPA ***3390", amount: "$3,120", status: "Paid" },
  { n: "Kenji Watanabe", method: "Wire - MUFG ***0092", amount: "$6,050", status: "Paid" },
  { n: "Elena Petrova", method: "SEPA ***1187", amount: "$2,940", status: "On hold" },
  ];
const INTEGRATIONS = [
  { n: "Slack", d: "Post hiring + payment events to a channel", on: true, icon: "chat" },
  { n: "Greenhouse", d: "Sync candidates and stages two-way", on: true, icon: "briefcase" },
  { n: "QuickBooks", d: "Export contractor payouts for accounting", on: false, icon: "wallet" },
  { n: "Okta / SAML", d: "Enterprise SSO for company workspaces", on: true, icon: "shieldcheck" },
  { n: "Zapier", d: "Automate workflows across 5,000+ apps", on: false, icon: "zap" },
  { n: "Datadog", d: "Stream platform + API health metrics", on: true, icon: "bolt" },
  ];

const TEMPLATES = [
  { n: "New match found", ch: "Email + push", updated: "2 days ago" },
  { n: "Milestone approved", ch: "Email", updated: "1 week ago" },
  { n: "Contract signed", ch: "Email + push", updated: "3 weeks ago" },
  { n: "Payout processed", ch: "Email", updated: "1 month ago" },
  { n: "Security alert", ch: "Email + SMS", updated: "2 months ago" },
  ];
const DELIVERY = [
  { t: "09:41", tmpl: "New match found", to: "priya.raman@example.com", status: "delivered" },
  { t: "09:38", tmpl: "Payout processed", to: "mateo.silva@example.com", status: "delivered" },
  { t: "09:20", tmpl: "Security alert", to: "admin@northstar.example.com", status: "delivered" },
  { t: "08:55", tmpl: "Contract signed", to: "elena.petrova@example.com", status: "bounced" },
  ];

function StatusDot({ ok }: { ok: boolean }) {
    return <span className={cx("h-2 w-2 rounded-full", ok ? "bg-emerald-500" : "bg-amber-500")} />;
}

function Toggle({ on, onClick }: { on: boolean; onClick: () => void }) {
    return (
          <button onClick={onClick} className={cx("h-6 w-11 rounded-full p-0.5 transition", on ? "bg-[#0552CC]" : "bg-slate-300")}>
                  <span className={cx("block h-5 w-5 rounded-full bg-white transition", on && "translate-x-5")} />
          </button>
        );
}

export function Admin() {
  const [tab, setTab] = useState("Overview");
  const [act, setAct] = useState<string[]>([]);
  const [q, setQ] = useState("");
  const [drawer, setDrawer] = useState<string | null>(null);
  const [flags, setFlags] = useState<Record<string, boolean>>({ "AI match explanations": true, "Escrow v2": true, "Discover squads": false, "Reactions v2": true, "Company SSO enforcement": false });
  const [integ, setInteg] = useState<Record<string, boolean>>(Object.fromEntries(INTEGRATIONS.map((i) => [i.n, i.on])));

  const nav = NAV.filter((n) => !q || n[0].toLowerCase().includes(q.toLowerCase()));
  const person = PEOPLE.find((p) => p.n === drawer);

  return (
    <div className="flex flex-col min-h-[calc(100vh-130px)] bg-[#F4F5F7] md:flex-row">
      <div className="border-b border-slate-200 bg-white p-3 md:hidden"><select value={tab} onChange={(e) => setTab(e.target.value)} className="h-9 w-full rounded-md border border-slate-300 px-2 text-sm">{nav.map((i) => <option key={i[0]} value={i[0]}>{i[0]}</option>)}</select></div>
      <aside className="hidden w-64 shrink-0 overflow-y-auto bg-[#0B2B5C] p-3 text-slate-300 md:block">
        <p className="px-2 pb-2 pt-1 text-xs font-bold uppercase tracking-wide text-slate-400">Admin console</p>
        <div className="relative mb-2 px-1">
          <Ic n="search" s={14} c="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search admin..." className="h-8 w-full rounded-md bg-white/10 pl-8 pr-2 text-xs text-white placeholder-slate-500 outline-none focus:bg-white/15" />
        </div>
        {GROUPS.map(([gk, gl]) => {
          const items = nav.filter((n) => n[2] === gk);
          if (!items.length) return null;
          return (
            <div key={gk} className="mb-1">
              {gl && <p className="px-3 pb-1 pt-3 text-[10px] font-bold uppercase tracking-wide text-slate-500">{gl}</p>}
              {items.map((i) => (
                <button key={i[0]} onClick={() => setTab(i[0])} className={cx("mb-0.5 flex w-full items-center gap-2 rounded px-3 py-2 text-left text-sm font-medium", tab === i[0] ? "bg-[#0552CC] text-white" : "hover:bg-white/10")}>
                  <Ic n={i[1]} s={16} />{i[0]}
                  {i[0] === "Disputes" && <Tag t="red">3</Tag>}
                  {i[0] === "Verification queue" && <Tag t="amber">6</Tag>}
                </button>
              ))}
            </div>
          );
        })}
        <div className="mt-6 rounded-lg bg-white/10 p-3 text-xs">
          <p className="mb-1 flex items-center gap-1 font-bold text-white"><Ic n="spark" s={14} />AI insight</p>
          Fraud signals are up 18% in EU freelancers this week.
        </div>
      </aside>

      <div className="min-w-0 flex-1 p-6">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">{tab}</h1>
            <p className="text-sm text-slate-500">Remote-AI-Platform admin console</p>
          </div>
          <div className="flex gap-2"><Btn v="gray" icon="download">Export</Btn><Btn v="primary" icon="plus" c="!bg-[#0552CC]">New policy</Btn></div>
        </div>

        {tab === "Overview" && (
          <>
            <div className="grid gap-4 grid-cols-1 md:grid-cols-4">{KPI.map((k) => <Card key={k[0]} c="rounded-lg"><div className="flex items-center justify-between text-slate-500"><span className="text-sm">{k[0]}</span><Ic n={k[3]} s={18} /></div><p className="mt-2 text-2xl font-semibold">{k[1]}</p><p className={cx("text-xs font-semibold", k[2].startsWith("-") ? "text-red-600" : "text-emerald-600")}>{k[2]} vs last week</p></Card>)}</div>
            <div className="mt-4 grid gap-4 grid-cols-1 lg:grid-cols-[1.4fr_1fr]">
              <Card c="rounded-lg"><p className="font-semibold">Platform activity - 30 days</p><div className="mt-4"><Bars d={[30, 44, 38, 52, 61, 58, 70, 66, 74, 81, 77, 90]} c={IND} h={170} /></div></Card>
              <Card c="rounded-lg"><p className="mb-3 font-semibold">Marketplace health</p>{[["Match acceptance", 82], ["Contracts completed", 91], ["On-time milestones", 76], ["Dispute rate (low is good)", 8]].map((h) => <div key={String(h[0])} className="mb-3"><div className="mb-1 flex justify-between text-xs"><span>{h[0]}</span><b>{h[1]}%</b></div><Bar v={Number(h[1])} c="bg-[#0552CC]" /></div>)}</Card>
            </div>
            <div className="mt-4 grid gap-4 grid-cols-1 md:grid-cols-3">
              <Card c="rounded-lg"><p className="mb-2 text-sm font-semibold">Pending actions</p>{[["Verification queue", 6], ["Open disputes", 3], ["Bounced notifications", 1]].map((r) => <div key={String(r[0])} className="flex items-center justify-between border-t border-slate-100 py-2 text-sm first:border-0"><span>{r[0]}</span><Tag t="amber">{r[1]}</Tag></div>)}</Card>
              <Card c="rounded-lg lg:col-span-1"><p className="mb-2 text-sm font-semibold">Top organizations by spend</p>{ORGS.slice(0, 4).map((o) => <div key={o.n} className="flex items-center justify-between border-t border-slate-100 py-2 text-sm first:border-0"><span className="font-medium">{o.n}</span><span className="text-slate-500">{o.spend}</span></div>)}</Card>
              <Card c="rounded-lg"><p className="mb-2 text-sm font-semibold">System status</p>{[["API", true], ["Payments", true], ["Search", true], ["Federation (SSO)", false]].map((r) => <div key={String(r[0])} className="flex items-center justify-between border-t border-slate-100 py-2 text-sm first:border-0"><span className="flex items-center gap-2"><StatusDot ok={r[1] as boolean} />{r[0]}</span><span className="text-xs text-slate-400">{r[1] ? "Operational" : "Degraded"}</span></div>)}</Card>
            </div>
            <Card c="mt-4 rounded-lg" p={false}><p className="p-4 font-semibold">Moderation queue</p>{Q.map((q2) => <div key={q2[0]} className="flex items-center gap-3 border-t border-slate-100 p-4"><Tag t={q2[2] === "high" ? "red" : q2[2] === "medium" ? "amber" : "gray"}>{q2[2]}</Tag><div className="flex-1"><p className="text-sm font-semibold">{q2[0]}</p><p className="text-xs text-slate-500">{q2[1]}</p></div>{act.includes(q2[0]) ? <Tag t="green">Resolved</Tag> : <><Btn v="gray" sm>Review</Btn><Btn v="danger" sm onClick={() => setAct([...act, q2[0]])}>Take action</Btn></>}</div>)}</Card>
          </>
        )}

        {tab === "Users" && (
          <Card c="rounded-lg" p={false}>
            <table className="w-full text-sm"><thead className="bg-slate-50 text-left text-xs uppercase text-slate-500"><tr>{["User", "Role", "Location", "Trust score", "Status", ""].map((h) => <th key={h} className="px-4 py-2">{h}</th>)}</tr></thead>
              <tbody>{PEOPLE.map((p) => <tr key={p.n} className="border-t border-slate-100"><td className="px-4 py-3"><button onClick={() => setDrawer(p.n)} className="flex items-center gap-3 text-left"><Av name={p.n} s={32} /><div><p className="font-semibold hover:underline">{p.n}</p><p className="text-xs text-slate-500">{p.t}</p></div></button></td><td className="px-4 py-3">Engineer</td><td className="px-4 py-3">{p.loc}</td><td className="px-4 py-3">{p.score}</td><td className="px-4 py-3"><Tag t={p.on ? "green" : "gray"}>{p.on ? "Active" : "Idle"}</Tag></td><td className="px-4 py-3 text-right"><Btn v="gray" sm onClick={() => setDrawer(p.n)}>Manage</Btn></td></tr>)}</tbody>
            </table>
          </Card>
        )}

        {tab === "Organizations" && (
          <Card c="rounded-lg" p={false}>
            <table className="w-full text-sm"><thead className="bg-slate-50 text-left text-xs uppercase text-slate-500"><tr>{["Organization", "Plan", "Seats", "Open jobs", "Spend (30d)", "SSO", "Status", ""].map((h) => <th key={h} className="px-4 py-2">{h}</th>)}</tr></thead>
              <tbody>{ORGS.map((o) => <tr key={o.n} className="border-t border-slate-100"><td className="px-4 py-3 font-semibold">{o.n}</td><td className="px-4 py-3">{o.plan}</td><td className="px-4 py-3">{o.seats}</td><td className="px-4 py-3">{o.jobs}</td><td className="px-4 py-3">{o.spend}</td><td className="px-4 py-3"><Tag t={o.ssoStatus === "Connected" ? "green" : "gray"}>{o.ssoStatus}</Tag></td><td className="px-4 py-3"><Tag t={o.status === "Active" ? "green" : o.status === "Trial" ? "blue" : "red"}>{o.status}</Tag></td><td className="px-4 py-3 text-right"><Btn v="gray" sm>Manage</Btn></td></tr>)}</tbody>
            </table>
          </Card>
        )}

        {tab === "Jobs & listings" && (
          <>
            <div className="mb-4 grid gap-4 grid-cols-1 md:grid-cols-4">{[["Live jobs", "3,904"], ["Flagged", "22"], ["Duplicates found", "9"], ["Pending review", "14"]].map((k) => <Card key={k[0]} c="rounded-lg"><p className="text-sm text-slate-500">{k[0]}</p><p className="mt-1 text-2xl font-semibold">{k[1]}</p></Card>)}</div>
            <Card c="rounded-lg" p={false}><table className="w-full text-sm"><thead className="bg-slate-50 text-left text-xs uppercase text-slate-500"><tr>{["Job", "Company", "Source", "Flag", "Status", ""].map((h) => <th key={h} className="px-4 py-2">{h}</th>)}</tr></thead>
              <tbody>{[["Senior AI Platform Engineer", "Northstar Cloud", "Direct", "-", "Live"], ["Data Product Manager", "Brightpath", "RemoteOK", "Duplicate of #2291", "Needs review"], ["MLOps Engineer", "CloudNova", "Direct", "3 reports", "Needs review"], ["Staff Data Engineer", "Helix Labs", "Direct", "-", "Live"]].map((r) => <tr key={r[0]} className="border-t border-slate-100"><td className="px-4 py-3 font-semibold">{r[0]}</td><td className="px-4 py-3">{r[1]}</td><td className="px-4 py-3">{r[2]}</td><td className="px-4 py-3 text-slate-500">{r[3]}</td><td className="px-4 py-3"><Tag t={r[4] === "Live" ? "green" : "amber"}>{r[4]}</Tag></td><td className="px-4 py-3 text-right"><Btn v="gray" sm>Review</Btn></td></tr>)}</tbody>
            </table></Card>
          </>
        )}

        {tab === "Verification queue" && (
          <Card c="rounded-lg" p={false}>{PEOPLE.slice(0, 6).map((p, i) => <div key={p.n} className="flex items-center gap-4 border-b border-slate-100 p-4 last:border-0"><Av name={p.n} s={36} /><div className="flex-1"><p className="text-sm font-semibold">{p.n}</p><p className="text-xs text-slate-500">Submitted {["government ID", "proof of address", "work sample", "government ID", "tax form", "government ID"][i % 6]} - {i + 1}h ago</p></div><Tag t="amber">Pending</Tag><Btn v="gray" sm>Review</Btn><Btn v="primary" sm c="!bg-[#0552CC]">Approve</Btn></div>)}</Card>
        )}

        {(tab === "Moderation") && (
          <Card c="rounded-lg" p={false}>{Q.map((q2) => <div key={q2[0]} className="flex items-center gap-3 border-b border-slate-100 p-4 last:border-0"><Tag t={q2[2] === "high" ? "red" : q2[2] === "medium" ? "amber" : "gray"}>{q2[2]}</Tag><div className="flex-1"><p className="text-sm font-semibold">{q2[0]}</p><p className="text-xs text-slate-500">{q2[1]}</p></div><Btn v="gray" sm>Open</Btn></div>)}</Card>
        )}

        {tab === "Disputes" && (
          <div className="space-y-3">{DISPUTES.map((d) => <Card key={d.id} c="rounded-lg"><div className="flex items-center justify-between"><div><p className="font-semibold">{d.id} - {d.parties}</p><p className="text-sm text-slate-500">{d.stage} - opened {d.opened}</p></div><div className="flex items-center gap-3"><Tag t={d.risk === "high" ? "red" : d.risk === "medium" ? "amber" : "gray"}>{d.risk} risk</Tag><b>{d.amount}</b><Btn v="gray" sm>Open case</Btn></div></div></Card>)}</div>
        )}

        {tab === "Security" && (
          <div className="space-y-4">
            <Card c="rounded-lg"><p className="mb-3 font-semibold">Platform security posture</p><div className="grid gap-4 sm:grid-cols-3">{[["Score", "94/100"], ["MFA adoption", "78%"], ["Orgs with SSO", "3 / 6"]].map((k) => <div key={k[0]}><p className="text-xs text-slate-500">{k[0]}</p><p className="text-xl font-semibold">{k[1]}</p></div>)}</div></Card>
            <Card c="rounded-lg">{[["Require MFA for admins", true], ["Require MFA for company owners", false], ["Block new sign-ins from unrecognized countries", true], ["Enforce SSO for enterprise plans", false]].map((r) => <div key={String(r[0])} className="flex items-center justify-between border-b border-slate-100 py-3 last:border-0"><span className="font-medium">{r[0]}</span><Toggle on={r[1] as boolean} onClick={() => {}} /></div>)}</Card>
            <Card c="rounded-lg" p={false}><p className="p-4 font-semibold">Recent security events</p>{[["Impossible travel flagged", "elena.petrova@aster.dev", "3h ago", "amber"], ["Credential stuffing blocked", "212 attempts", "6h ago", "red"], ["New device sign-in", "gokul@remote-ai.dev", "1d ago", "gray"]].map((r) => <div key={r[0]} className="flex items-center gap-3 border-t border-slate-100 p-4"><Tag t={r[3]}>{r[3] === "red" ? "high" : r[3] === "amber" ? "medium" : "info"}</Tag><div className="flex-1"><p className="text-sm font-semibold">{r[0]}</p><p className="text-xs text-slate-500">{r[1]}</p></div><span className="text-xs text-slate-400">{r[2]}</span></div>)}</Card>
          </div>
        )}

        {tab === "Payments & escrow" && (
          <div className="space-y-4">
            <div className="grid gap-4 grid-cols-1 md:grid-cols-4">{[["In escrow", "$2.41M"], ["Released (30d)", "$1.86M"], ["Platform fees (30d)", "$92,400"], ["Failed payments", "6"]].map((k) => <Card key={k[0]} c="rounded-lg"><p className="text-sm text-slate-500">{k[0]}</p><p className="mt-1 text-2xl font-semibold">{k[1]}</p></Card>)}</div>
            <Card c="rounded-lg"><p className="mb-3 font-semibold">Escrow volume - 30 days</p><Bars d={[40, 52, 48, 61, 70, 66, 78, 74, 88, 95, 90, 102]} c={IND} h={160} /></Card>
          </div>
        )}

        {tab === "Payouts" && (
          <Card c="rounded-lg" p={false}><table className="w-full text-sm"><thead className="bg-slate-50 text-left text-xs uppercase text-slate-500"><tr>{["Payee", "Method", "Amount", "Status", ""].map((h) => <th key={h} className="px-4 py-2">{h}</th>)}</tr></thead>
            <tbody>{PAYOUTS.map((p) => <tr key={p.n} className="border-t border-slate-100"><td className="px-4 py-3 font-semibold">{p.n}</td><td className="px-4 py-3 text-slate-500">{p.method}</td><td className="px-4 py-3">{p.amount}</td><td className="px-4 py-3"><Tag t={p.status === "Paid" ? "green" : p.status === "Processing" ? "blue" : "amber"}>{p.status}</Tag></td><td className="px-4 py-3 text-right"><Btn v="gray" sm>View</Btn></td></tr>)}</tbody>
          </table></Card>
        )}

        {tab === "Feature flags" && (
          <Card c="rounded-lg">{Object.keys(flags).map((f) => <div key={f} className="flex items-center justify-between border-b border-slate-100 py-3 last:border-0"><div><p className="font-semibold">{f}</p><p className="text-xs text-slate-500">Rollout to 100% of accounts</p></div><Toggle on={flags[f]} onClick={() => setFlags({ ...flags, [f]: !flags[f] })} /></div>)}</Card>
        )}

        {tab === "Integrations" && (
          <div className="grid gap-4 grid-cols-1 md:grid-cols-2">{INTEGRATIONS.map((i) => <Card key={i.n} c="rounded-lg"><div className="flex items-start justify-between"><div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#E8F0FC] text-[#0552CC]"><Ic n={i.icon} s={20} /></div><div><p className="font-semibold">{i.n}</p><p className="text-xs text-slate-500">{i.d}</p></div></div><Toggle on={integ[i.n]} onClick={() => setInteg({ ...integ, [i.n]: !integ[i.n] })} /></div></Card>)}</div>
        )}

        {tab === "Notifications" && (
          <div className="space-y-4">
            <Card c="rounded-lg" p={false}><p className="p-4 font-semibold">Templates</p>{TEMPLATES.map((t) => <div key={t.n} className="flex items-center gap-4 border-t border-slate-100 p-4"><div className="flex-1"><p className="text-sm font-semibold">{t.n}</p><p className="text-xs text-slate-500">{t.ch}</p></div><span className="text-xs text-slate-400">Updated {t.updated}</span><Btn v="gray" sm>Edit</Btn></div>)}</Card>
            <Card c="rounded-lg" p={false}><p className="p-4 font-semibold">Delivery log</p>{DELIVERY.map((d, i) => <div key={i} className="flex items-center gap-4 border-t border-slate-100 p-4 text-sm"><span className="w-14 text-slate-500">{d.t}</span><span className="flex-1 font-medium">{d.tmpl}</span><span className="text-slate-500">{d.to}</span><Tag t={d.status === "delivered" ? "green" : "red"}>{d.status}</Tag></div>)}</Card>
          </div>
        )}

        {tab === "Platform settings" && (
          <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
            <Card c="rounded-lg"><p className="mb-3 font-semibold">Branding</p><div className="space-y-3 text-sm"><div className="flex items-center justify-between"><span>Primary color</span><span className="flex items-center gap-2"><span className="h-5 w-5 rounded-full border border-slate-200" style={{ background: "#0552CC" }} />#0552CC</span></div><div className="flex items-center justify-between"><span>Product name</span><span className="font-medium">Remote-AI-Platform</span></div><div className="flex items-center justify-between"><span>Support email</span><span className="font-medium">support@remote-ai-platform.com</span></div></div></Card>
            <Card c="rounded-lg"><p className="mb-3 font-semibold">Domains</p>{[["app.remote-ai-platform.com", "Primary", "green"], ["api.remote-ai-platform.com", "API", "green"], ["status.remote-ai-platform.com", "Status page", "amber"]].map((d) => <div key={d[0]} className="flex items-center justify-between border-t border-slate-100 py-2 text-sm first:border-0"><span>{d[0]}</span><Tag t={d[2]}>{d[1]}</Tag></div>)}</Card>
            <Card c="rounded-lg lg:col-span-2"><p className="mb-3 font-semibold">Global search & command center</p><p className="text-sm text-slate-500">Admins can jump to any user, organization, job or contract with Cmd/Ctrl + K from anywhere in the console.</p></Card>
          </div>
        )}

        {tab === "AI usage" && (
          <div className="space-y-4">
            <div className="grid gap-4 grid-cols-1 md:grid-cols-4">{[["LLM calls (30d)", "182,440"], ["Prompt tokens", "96.2M"], ["Completion tokens", "21.7M"], ["Est. cost", "USD 1,284"]].map((k) => <Card key={k[0]} c="rounded-lg"><p className="text-sm text-slate-500">{k[0]}</p><p className="mt-1 text-2xl font-semibold">{k[1]}</p></Card>)}</div>
            <Card c="rounded-lg"><p className="mb-3 font-semibold">Cost by feature</p>{[["Resume parsing", 38], ["Match explanations", 31], ["Cover-letter assistant", 17], ["Quality review", 9], ["Ask AI", 5]].map((f) => <div key={f[0]} className="mb-2 flex items-center gap-3 text-sm"><span className="w-44">{f[0]}</span><div className="flex-1"><Bar v={Number(f[1])} c="bg-[#0552CC]" /></div><b className="w-10 text-right">{f[1]}%</b></div>)}</Card>
          </div>
        )}

        {tab === "Job sync" && (
          <Card c="rounded-lg" p={false}><table className="w-full text-sm"><thead className="bg-slate-50 text-left text-xs uppercase text-slate-500"><tr>{["Source", "Last run", "Jobs imported", "Status"].map((h) => <th key={h} className="px-4 py-2">{h}</th>)}</tr></thead><tbody>{[["RemoteOK", "12 min ago", "418", "ok"], ["Arbeitnow", "12 min ago", "203", "ok"], ["Remotive", "1 h ago", "356", "ok"], ["USAJobs", "1 h ago", "0", "failed"], ["The Muse", "2 h ago", "121", "ok"]].map((r) => <tr key={r[0]} className="border-t border-slate-100"><td className="px-4 py-3 font-semibold">{r[0]}</td><td className="px-4 py-3">{r[1]}</td><td className="px-4 py-3">{r[2]}</td><td className="px-4 py-3"><Tag t={r[3] === "ok" ? "green" : "red"}>{r[3] === "ok" ? "Success" : "Failed"}</Tag></td></tr>)}</tbody></table></Card>
        )}

        {tab === "System health" && (
          <Card c="rounded-lg" p={false}>{[["Auth service", "42 ms"], ["Jobs API", "88 ms"], ["Database", "12 ms"], ["Redis", "3 ms"], ["Celery workers", "4 queues"], ["Object storage", "61 ms"]].map((r) => <div key={r[0]} className="flex items-center gap-3 border-b border-slate-100 p-4 last:border-0"><span className="h-3 w-3 rounded-full bg-emerald-500" /><span className="flex-1 font-semibold">{r[0]}</span><span className="text-sm text-slate-500">{r[1]}</span><Tag t="green">Operational</Tag></div>)}</Card>
        )}

        {tab === "Audit log" && (
          <Card c="rounded-lg" p={false}>{LOG.map((l, i) => <div key={i} className="flex items-center gap-4 border-b border-slate-100 p-4 text-sm last:border-0"><span className="w-14 text-slate-500">{l[0]}</span><Av name={l[1]} s={28} /><span className="w-32 font-semibold">{l[1]}</span><span className="flex-1">{l[2]}</span><Tag t="indigo">{l[3]}</Tag></div>)}</Card>
        )}
      </div>

      {person && (
        <div className="fixed inset-0 z-[90] flex justify-end bg-black/40" onClick={() => setDrawer(null)}>
          <div className="h-full w-full max-w-md overflow-y-auto bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between"><h3 className="text-lg font-bold">Manage user</h3><button onClick={() => setDrawer(null)} className="rounded-full p-1.5 hover:bg-slate-100"><Ic n="x" /></button></div>
            <div className="flex items-center gap-3"><Av name={person.n} s={56} /><div><p className="text-lg font-bold">{person.n}</p><p className="text-sm text-slate-500">{person.t} - {person.loc}</p></div></div>
            <div className="mt-5 grid grid-cols-2 gap-3 text-sm"><Card c="rounded-lg"><p className="text-xs text-slate-500">Trust score</p><p className="text-xl font-semibold">{person.score}</p></Card><Card c="rounded-lg"><p className="text-xs text-slate-500">Jobs completed</p><p className="text-xl font-semibold">{person.jobs}</p></Card></div>
            <p className="mt-5 text-sm font-semibold">Sessions</p>
            <div className="mt-2 space-y-2 text-sm">{[["MacBook Pro - Chrome", "Berlin, Germany", true], ["iPhone 17 - App", "Berlin, Germany", true]].map((s) => <div key={s[0] as string} className="flex items-center justify-between rounded-lg border border-slate-200 p-3"><div><p className="font-medium">{s[0]}</p><p className="text-xs text-slate-500">{s[1]}</p></div><Btn v="gray" sm>Revoke</Btn></div>)}</div>
            <div className="mt-6 flex gap-2"><Btn v="outline" full>Reset password</Btn><Btn v="danger" full>Suspend account</Btn></div>
          </div>
        </div>
      )}
    </div>
  );
}
