// Figma Make "Admin console" — layout kept, every section backed by the live admin API.
// Sections the platform has no backend for (disputes, payouts, integrations,
// notification templates, security policies, platform settings) are not shown.
import { useState } from "react";
import api, { extractErrorMessage } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useApi, timeAgo } from "./live";
import { Ic, Av, Btn, Card, Tag, Bar, Bars, cx } from "./rap_kit";

const NAV: [string, string, string, string][] = [
  ["Overview", "chart", "overview", "admin"],
  ["Users", "users", "market", "adminusers"],
  ["Organizations", "building", "market", "orgs"],
  ["Jobs & listings", "briefcase", "market", "adminjobs"],
  ["Verification queue", "shieldcheck", "market", "verifications"],
  ["Moderation", "shield", "trust", "reports"],
  ["Feature flags", "settings", "platform", "flags"],
  ["AI usage", "spark", "ops", "aiusage"],
  ["Job sync", "zap", "ops", "sync"],
  ["System health", "bolt", "ops", "health"],
  ["Audit log", "history", "ops", "audit"],
];
const GROUPS: [string, string][] = [["overview", ""], ["market", "Marketplace"], ["trust", "Trust & safety"], ["platform", "Platform"], ["ops", "Operations"]];
const tabFor = (route?: string | null) => NAV.find((n) => n[3] === route)?.[0] || "Overview";
const ok = (s: string) => ["OPERATIONAL", "HEALTHY", "SUCCESS", "OK"].includes((s || "").toUpperCase());

function StatusDot({ good }: { good: boolean }) { return <span className={cx("inline-block h-2 w-2 rounded-full", good ? "bg-emerald-500" : "bg-red-500")} />; }

export function Admin({ initial }: { initial?: string } = {}) {
  const { user } = useAuth();
  const admin = user?.role === "ADMIN";
  const [tab, setTab] = useState(() => tabFor(initial));
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const [notice, setNotice] = useState("");
  const on = (t: string) => admin && tab === t;
  const stats = useApi<any>(admin && ["Overview"].includes(tab) ? "/admin/stats" : null);
  const users = useApi<any[]>(on("Users") ? "/admin/users" : null, { limit: 100 });
  const orgs = useApi<any[]>(on("Organizations") ? "/companies/public" : null, { limit: 100 });
  const jobs = useApi<any[]>(on("Jobs & listings") ? "/admin/jobs" : null, { q: search || undefined, limit: 100 });
  const ver = useApi<any[]>(on("Verification queue") ? "/trust/verifications" : null);
  const reports = useApi<any[]>(admin && ["Moderation", "Overview"].includes(tab) ? "/moderation/reports" : null);
  const flags = useApi<any>(on("Feature flags") ? "/admin/feature-flags" : null);
  const ai = useApi<any>(on("AI usage") ? "/admin/ai-usage" : null);
  const sync = useApi<any[]>(on("Job sync") ? "/admin/sync-logs" : null, { limit: 50 });
  const health = useApi<any>(on("System health") ? "/admin/health/details" : null);
  const audit = useApi<any[]>(admin && ["Audit log", "Overview"].includes(tab) ? "/admin/audit-events" : null, { limit: 100 });
  const act = async (fn: () => Promise<unknown>, done: string, reload: { reload: () => void }) => { try { await fn(); reload.reload(); setNotice(done); } catch (e) { setNotice(extractErrorMessage(e, "That didn't work. Please try again.")); } };
  const nav = NAV.filter((n) => !q || n[0].toLowerCase().includes(q.toLowerCase()));
  const openReports = (reports.data ?? []).filter((r: any) => r.status === "OPEN");

  if (!admin) return <div className="mx-auto max-w-lg p-10 text-center"><Ic n="lock" s={36} c="mx-auto text-slate-400" /><h2 className="mt-4">Admin access required</h2><p className="mt-2 text-slate-500">This console is available to platform administrators only.</p></div>;

  const table = (head: string[], rows: any[], empty: string) => <Card c="rounded-lg" p={false}><div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-slate-50 text-left text-xs uppercase text-slate-500"><tr>{head.map((h) => <th key={h} className="px-4 py-3">{h}</th>)}</tr></thead><tbody>{rows}{!rows.length && <tr><td colSpan={head.length} className="px-4 py-10 text-center text-slate-500">{empty}</td></tr>}</tbody></table></div></Card>;
  const exportCsv = (name: string, rows: any[]) => { if (!rows.length) return; const keys = Object.keys(rows[0]); const csv = [keys.join(","), ...rows.map((r) => keys.map((k) => `"${String(typeof r[k] === "object" ? JSON.stringify(r[k]) : r[k] ?? "").replace(/"/g, '""')}"`).join(","))].join("\n"); const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" })); a.download = `${name}.csv`; a.click(); };
  const current: Record<string, any[] | undefined> = { Users: users.data, Organizations: orgs.data, "Jobs & listings": jobs.data, "Verification queue": ver.data, Moderation: reports.data, "Job sync": sync.data, "Audit log": audit.data };

  return (
    <div className="flex flex-col min-h-[calc(100vh-130px)] bg-[#F4F5F7] md:flex-row">
      <div className="border-b border-slate-200 bg-white p-3 md:hidden"><select value={tab} onChange={(e) => setTab(e.target.value)} className="h-9 w-full rounded-md border border-slate-300 px-2 text-sm">{nav.map((i) => <option key={i[0]} value={i[0]}>{i[0]}</option>)}</select></div>
      <aside className="hidden w-64 shrink-0 overflow-y-auto bg-[#0B2B5C] p-3 text-slate-300 md:block">
        <p className="px-2 pb-2 pt-1 text-xs font-bold uppercase tracking-wide text-slate-400">Admin console</p>
        <div className="relative mb-2 px-1"><Ic n="search" s={14} c="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" /><input aria-label="Search admin" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search admin..." className="h-8 w-full rounded-md bg-white/10 pl-8 pr-2 text-xs text-white placeholder-slate-500 outline-none focus:bg-white/15" /></div>
        {GROUPS.map(([gk, gl]) => { const items = nav.filter((n) => n[2] === gk); if (!items.length) return null; return (
          <div key={gk} className="mb-1">{gl && <p className="px-3 pb-1 pt-3 text-[10px] font-bold uppercase tracking-wide text-slate-500">{gl}</p>}
            {items.map((i) => <button key={i[0]} onClick={() => setTab(i[0])} className={cx("mb-0.5 flex w-full items-center gap-2 rounded px-3 py-2 text-left text-sm font-medium", tab === i[0] ? "bg-[#0552CC] text-white" : "hover:bg-white/10")}><Ic n={i[1]} s={16} />{i[0]}{i[0] === "Moderation" && openReports.length > 0 && <Tag t="red">{openReports.length}</Tag>}</button>)}
          </div>); })}
      </aside>

      <div className="min-w-0 flex-1 p-6">
        <div className="mb-4 flex items-center justify-between">
          <div><h1 className="text-2xl font-semibold">{tab}</h1><p className="text-sm text-slate-500">Remote-AI-Platform admin console</p></div>
          {current[tab] && <Btn v="gray" icon="download" onClick={() => exportCsv(tab.toLowerCase().replace(/\W+/g, "-"), current[tab] || [])}>Export</Btn>}
        </div>

        {tab === "Overview" && <>
          <div className="grid gap-4 grid-cols-1 md:grid-cols-4">{[["Users", stats.data?.total_users, "users"], ["Engineers / companies", stats.data ? `${stats.data.total_engineers} / ${stats.data.total_companies}` : undefined, "building"], ["Active jobs", stats.data?.total_active_jobs, "briefcase"], ["Open reports", openReports.length, "flag"]].map((k) => <Card key={k[0] as string} c="rounded-lg"><div className="flex items-center justify-between text-slate-500"><span className="text-sm">{k[0]}</span><Ic n={k[2] as string} s={18} /></div><p className="mt-2 text-2xl font-bold">{k[1] ?? "—"}</p></Card>)}</div>
          <div className="mt-4 grid gap-4 grid-cols-1 lg:grid-cols-2">
            <Card c="rounded-lg"><p className="mb-3 font-semibold">Jobs by source</p>{Object.entries(stats.data?.job_sources_breakdown ?? {}).map(([k, v]: any) => <div key={k} className="mb-2 flex items-center gap-3 text-sm"><span className="w-28 text-xs text-slate-500">{k}</span><div className="flex-1"><Bar v={stats.data?.total_jobs ? (v / stats.data.total_jobs) * 100 : 0} /></div><b className="w-8 text-right">{v}</b></div>)}<p className="mt-3 flex items-center gap-2 text-sm"><StatusDot good={ok(stats.data?.system_health)} />System health: {stats.data?.system_health ?? "—"} · {stats.data?.total_matches ?? 0} AI matches computed</p></Card>
            <Card c="rounded-lg"><p className="mb-3 font-semibold">Recent admin activity</p>{(audit.data ?? []).slice(0, 8).map((e: any) => <div key={e.id} className="flex justify-between border-t border-slate-100 py-2 text-sm"><span className="font-medium">{e.action.replace(/_/g, " ").toLowerCase()}<span className="block text-xs text-slate-500">{e.resource_type}{e.resource_id ? ` ${e.resource_id.slice(0, 8)}` : ""}</span></span><span className="text-xs text-slate-500">{timeAgo(e.created_at)}</span></div>)}{!(audit.data ?? []).length && <p className="text-sm text-slate-500">No audit events yet.</p>}</Card>
          </div>
        </>}

        {tab === "Users" && table(["Member", "Role", "Status", "Joined", "Actions"], (users.data ?? []).map((u: any) => <tr key={u.id} className="border-t border-slate-100"><td className="px-4 py-3"><div className="flex items-center gap-3"><Av name={u.full_name || u.email} s={32} /><span><b className="block">{u.full_name}</b><span className="text-xs text-slate-500">{u.email}</span></span></div></td><td className="px-4 py-3"><select aria-label={`Role for ${u.full_name}`} value={u.role} disabled={u.id === user?.id} onChange={(e) => act(() => api.patch(`/admin/users/${u.id}/role`, { role: e.target.value }), "Role updated", users)} className="rounded border border-slate-200 px-1 text-sm">{["ENGINEER", "COMPANY", "ADMIN"].map((r) => <option key={r} value={r}>{r.charAt(0) + r.slice(1).toLowerCase()}</option>)}</select></td><td className="px-4 py-3"><Tag t={u.is_active ? "green" : "red"}>{u.is_active ? "Active" : "Suspended"}</Tag></td><td className="px-4 py-3 text-slate-500">{new Date(u.created_at).toLocaleDateString()}</td><td className="px-4 py-3 text-right">{u.id !== user?.id && <><Btn v="outline" sm onClick={() => act(() => api.patch(`/admin/users/${u.id}/status`, { is_active: !u.is_active }), u.is_active ? "User suspended" : "User reactivated", users)}>{u.is_active ? "Suspend" : "Reactivate"}</Btn> <Btn v="line" sm onClick={() => { if (window.confirm(`Delete ${u.full_name}? This can't be undone.`)) act(() => api.delete(`/admin/users/${u.id}`), "User deleted", users); }}>Delete</Btn></>}</td></tr>), users.loading ? "Loading…" : "No users.")}

        {tab === "Organizations" && table(["Organization", "Industry", "Size", "Location", "Verified"], (orgs.data ?? []).map((c: any) => <tr key={c.id} className="border-t border-slate-100"><td className="px-4 py-3 font-semibold">{c.name}</td><td className="px-4 py-3">{c.industry || "—"}</td><td className="px-4 py-3">{c.company_size || "—"}</td><td className="px-4 py-3">{c.location || "—"}</td><td className="px-4 py-3"><Tag t={c.is_verified ? "green" : "gray"}>{c.is_verified ? "Verified" : "Unverified"}</Tag></td></tr>), orgs.loading ? "Loading…" : "No organizations.")}

        {tab === "Jobs & listings" && <><form className="mb-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); setSearch(q.trim()); }}><input aria-label="Search jobs" placeholder="Search by title or company" className="h-10 flex-1 rounded-lg border border-slate-300 px-3 text-sm" onChange={(e) => setSearch(e.target.value)} /><Btn v="outline" onClick={() => act(() => api.post("/admin/jobs/reclean-text"), "Job text re-cleaned", jobs)}>Re-clean job text</Btn></form>
          {table(["Job", "Source", "Posted", "Status", "Actions"], (jobs.data ?? []).map((j: any) => <tr key={j.id} className="border-t border-slate-100"><td className="px-4 py-3"><b className="block">{j.title}</b><span className="text-xs text-slate-500">{j.company_name}{j.location ? ` · ${j.location}` : ""}</span></td><td className="px-4 py-3">{j.source}</td><td className="px-4 py-3 text-slate-500">{timeAgo(j.posted_at)}</td><td className="px-4 py-3"><Tag t={j.is_active ? "green" : "amber"}>{j.is_active ? "Live" : "Hidden"}</Tag></td><td className="px-4 py-3 text-right"><Btn v="outline" sm onClick={() => act(() => api.patch(`/admin/jobs/${j.id}/status`, { is_active: !j.is_active }), j.is_active ? "Job hidden" : "Job restored", jobs)}>{j.is_active ? "Hide" : "Restore"}</Btn> <Btn v="line" sm onClick={() => { if (window.confirm("Delete this job permanently?")) act(() => api.delete(`/admin/jobs/${j.id}`), "Job deleted", jobs); }}>Delete</Btn></td></tr>), jobs.loading ? "Loading…" : "No jobs match.")}</>}

        {tab === "Verification queue" && table(["Request", "User", "Submitted", "Notes", "Decision"], (ver.data ?? []).map((v: any) => <tr key={v.id} className="border-t border-slate-100"><td className="px-4 py-3 font-semibold">{v.verification_type.replace(/_/g, " ").toLowerCase()}</td><td className="px-4 py-3 font-mono text-xs">{v.user_id.slice(0, 8)}</td><td className="px-4 py-3 text-slate-500">{timeAgo(v.created_at)}</td><td className="px-4 py-3 text-slate-600">{v.verifier_notes || "—"}</td><td className="px-4 py-3 text-right"><Btn v="line" sm onClick={() => act(() => api.patch(`/trust/verifications/${v.id}/review`, { status: "REJECTED" }), "Verification rejected", ver)}>Reject</Btn> <Btn sm onClick={() => act(() => api.patch(`/trust/verifications/${v.id}/review`, { status: "VERIFIED" }), "Verification approved", ver)}>Approve</Btn></td></tr>), ver.loading ? "Loading…" : "No verification requests awaiting review.")}

        {tab === "Moderation" && table(["Report", "Target", "Filed", "Status", "Decision"], (reports.data ?? []).map((r: any) => { const decide = (decision: string, label: string) => act(() => api.patch(`/moderation/reports/${r.id}`, { status: decision === "NO_ACTION" ? "DISMISSED" : "RESOLVED", decision }), label, reports); return <tr key={r.id} className="border-t border-slate-100"><td className="px-4 py-3">{r.reason}</td><td className="px-4 py-3"><Tag t="gray">{r.target_type.toLowerCase()}</Tag> <span className="font-mono text-xs">{String(r.target_id).slice(0, 8)}</span></td><td className="px-4 py-3 text-slate-500">{timeAgo(r.created_at)}</td><td className="px-4 py-3"><Tag t={r.status === "OPEN" ? "amber" : "gray"}>{r.status.toLowerCase()}</Tag></td><td className="px-4 py-3 text-right">{r.status === "OPEN" ? <><Btn v="line" sm onClick={() => decide("NO_ACTION", "Report dismissed")}>Dismiss</Btn> {r.target_type === "JOB" && <Btn sm onClick={() => decide("HIDE_JOB", "Job hidden")}>Hide job</Btn>}{r.target_type === "POST" && <Btn sm onClick={() => decide("REMOVE_POST", "Post removed")}>Remove post</Btn>}{r.target_type === "USER" && <Btn v="danger" sm onClick={() => decide("SUSPEND_USER", "User suspended")}>Suspend user</Btn>}</> : <span className="text-xs text-slate-500">{(r.decision || "").replace(/_/g, " ").toLowerCase()}</span>}</td></tr>; }), reports.loading ? "Loading…" : "No reports filed.")}

        {tab === "Feature flags" && <Card c="rounded-lg" p={false}>{Object.entries(flags.data?.flags ?? {}).map(([k, v]: any) => <div key={k} className="flex items-center gap-3 border-b border-slate-100 p-4 last:border-0"><div className="flex-1"><p className="font-semibold">{k.replace(/_/g, " ").replace(/^./, (c: string) => c.toUpperCase())}</p><p className="text-xs text-slate-500">Managed through server configuration</p></div><Tag t={v ? "green" : "gray"}>{v ? "Enabled" : "Disabled"}</Tag><Ic n="lock" s={16} c="text-slate-500" /></div>)}{flags.loading && <p className="p-4 text-sm text-slate-500">Loading…</p>}</Card>}

        {tab === "AI usage" && <><div className="grid gap-4 grid-cols-1 md:grid-cols-4">{[["AI calls", ai.data?.total_calls], ["Prompt tokens", ai.data?.total_prompt_tokens?.toLocaleString()], ["Completion tokens", ai.data?.total_completion_tokens?.toLocaleString()], ["Estimated cost", ai.data ? `$${ai.data.estimated_cost_usd.toFixed(2)}` : undefined]].map((k) => <Card key={k[0]} c="rounded-lg"><p className="text-sm text-slate-500">{k[0]}</p><p className="mt-2 text-2xl font-bold">{k[1] ?? "—"}</p></Card>)}</div>
          <div className="mt-4 grid gap-4 grid-cols-1 lg:grid-cols-2">{[["By model", ai.data?.model_breakdown], ["By feature", ai.data?.feature_breakdown]].map(([title, data]: any) => { const entries = Object.entries(data ?? {}); const max = Math.max(1, ...entries.map(([, v]: any) => v)); return <Card key={title} c="rounded-lg"><p className="mb-3 font-semibold">{title}</p>{entries.map(([k, v]: any) => <div key={k} className="mb-2 flex items-center gap-3 text-sm"><span className="w-40 truncate text-xs text-slate-500">{k}</span><div className="flex-1"><Bar v={(v / max) * 100} /></div><b className="w-10 text-right">{v}</b></div>)}{!entries.length && <p className="text-sm text-slate-500">No AI calls recorded yet.</p>}</Card>; })}</div></>}

        {tab === "Job sync" && <><div className="mb-3 flex justify-end"><Btn icon="zap" onClick={() => act(() => api.post("/jobs/sync"), "Job sync started", sync)}>Sync now</Btn></div>
          {(sync.data ?? []).length > 0 && <Card c="mb-4 rounded-lg"><p className="mb-2 font-semibold">Jobs inserted per run</p><Bars d={(sync.data ?? []).slice(0, 20).reverse().map((s: any) => s.jobs_inserted)} h={100} /></Card>}
          {table(["Source", "Fetched", "Inserted", "Updated", "Status", "Duration", "When"], (sync.data ?? []).map((s: any) => <tr key={s.id} className="border-t border-slate-100"><td className="px-4 py-3 font-semibold">{s.source}</td><td className="px-4 py-3">{s.jobs_fetched}</td><td className="px-4 py-3">{s.jobs_inserted}</td><td className="px-4 py-3">{s.jobs_updated}</td><td className="px-4 py-3"><span className="flex items-center gap-2"><StatusDot good={ok(s.status)} />{s.status}</span>{s.error_message && <span className="block text-xs text-red-600">{s.error_message}</span>}</td><td className="px-4 py-3">{(s.duration_ms / 1000).toFixed(1)}s</td><td className="px-4 py-3 text-slate-500">{timeAgo(s.created_at)}</td></tr>), sync.loading ? "Loading…" : "No sync runs recorded yet.")}</>}

        {tab === "System health" && <><p className="mb-3 flex items-center gap-2 text-sm"><StatusDot good={ok(health.data?.overall_status)} />Overall: <b>{health.data?.overall_status ?? "—"}</b>{health.data?.timestamp && <span className="text-slate-500">· checked {timeAgo(health.data.timestamp)}</span>}<button className="ml-2 font-semibold text-[#0552CC]" onClick={health.reload}>Refresh</button></p>
          <div className="grid gap-4 grid-cols-1 md:grid-cols-2 xl:grid-cols-3">{(health.data?.services ?? []).map((s: any) => <Card key={s.service} c="rounded-lg"><div className="flex items-center justify-between"><p className="font-semibold">{s.service}</p><StatusDot good={ok(s.status)} /></div><p className="mt-2 text-sm text-slate-500">{s.status} · {s.latency_ms != null ? `${Math.round(s.latency_ms)} ms` : "—"}</p>{s.details && <p className="mt-1 text-xs text-slate-500">{typeof s.details === "string" ? s.details : JSON.stringify(s.details)}</p>}</Card>)}</div></>}

        {tab === "Audit log" && table(["When", "Action", "Resource", "Actor", "Details"], (audit.data ?? []).map((e: any) => <tr key={e.id} className="border-t border-slate-100"><td className="px-4 py-3 text-slate-500">{new Date(e.created_at).toLocaleString()}</td><td className="px-4 py-3 font-semibold">{e.action.replace(/_/g, " ").toLowerCase()}</td><td className="px-4 py-3">{e.resource_type}{e.resource_id ? <span className="block font-mono text-xs text-slate-500">{e.resource_id.slice(0, 12)}</span> : null}</td><td className="px-4 py-3">{e.actor_role || "—"}{e.actor_id ? <span className="block font-mono text-xs text-slate-500">{e.actor_id.slice(0, 8)}</span> : null}</td><td className="max-w-xs truncate px-4 py-3 font-mono text-xs text-slate-500">{JSON.stringify(e.payload)}</td></tr>), audit.loading ? "Loading…" : "No audit events yet.")}
      </div>
      {notice && <button onClick={() => setNotice("")} className="v2-toast">{notice} · Dismiss</button>}
    </div>
  );
}
