"use client";

import { useState } from "react";
import { api } from "@/lib/client";
import { ReasonDialog, Section, State, errText, useLoad, when } from "./kit";

/* ---------------- Overview ---------------- */

interface Health {
  overall_status: string;
  services: { service: string; status: string; latency_ms: number | null; details: string | null }[];
}

export function Overview({ version }: { version: { environment: string; git_sha: string; version: string } | null }) {
  const stats = useLoad<Record<string, number | string>>("/admin/stats");
  const health = useLoad<Health>("/admin/health/details");
  const active = useLoad<unknown[]>("/admin/support/tickets?status=active&limit=1");
  const overdue = useLoad<unknown[]>("/admin/support/tickets?overdue=true&limit=1");
  const reports = useLoad<{ status: string }[]>("/moderation/reports");
  const metric = (label: string, value: string | number | null | undefined) => (
    <div className="card metric" key={label}>
      <span>{label}</span>
      <strong>{value ?? "—"}</strong>
    </div>
  );
  return (
    <Section title="Operations overview">
      <div className="grid">
        {metric("Open support tickets", active.total)}
        {metric("Overdue first responses", overdue.total)}
        {metric("Open content reports", reports.data?.filter((r) => r.status === "OPEN").length)}
        {metric("Users", stats.data?.total_users as number | undefined)}
        {metric("Active jobs", stats.data?.total_active_jobs as number | undefined)}
        {metric("API version", version ? `${version.version} · ${version.git_sha.slice(0, 7)}` : "unreachable")}
      </div>
      <h3>Service health</h3>
      <State loading={health.loading && !health.data} error={health.error} retry={health.reload} />
      {health.data && (
        <div className="card">
          <p>
            Overall:{" "}
            <span className={`pill ${health.data.overall_status === "HEALTHY" ? "green" : "red"}`}>
              {health.data.overall_status}
            </span>
          </p>
          <table>
            <thead>
              <tr>
                <th>Service</th>
                <th>Status</th>
                <th>Latency</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {health.data.services.map((s) => (
                <tr key={s.service}>
                  <td>{s.service}</td>
                  <td>
                    <span
                      className={`pill ${s.status === "OPERATIONAL" ? "green" : s.status === "DEGRADED" ? "amber" : "red"}`}
                    >
                      {s.status}
                    </span>
                  </td>
                  <td>{s.latency_ms != null ? `${Math.round(s.latency_ms)} ms` : "—"}</td>
                  <td className="muted">{s.details ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="muted">
        Free-tier hosting: the API can sleep when idle and the first request after that is slow. There is no paid uptime
        guarantee.
      </p>
    </Section>
  );
}

/* ---------------- Support ---------------- */

interface Ticket {
  id: string;
  subject: string;
  category: string;
  severity: string;
  status: string;
  assignee_id: string | null;
  version: number;
  overdue: boolean;
  requester_email: string | null;
  sla_due_at: string;
  created_at: string;
}
interface TicketDetail {
  ticket: Ticket;
  messages: {
    id: string;
    author_id: string | null;
    body: string;
    internal: boolean;
    from_staff: boolean;
    created_at: string;
  }[];
}

export function Support({
  writable,
  meId,
  initial = "status=active",
  title = "Ticket queue",
}: {
  writable: boolean;
  meId: string;
  initial?: string;
  title?: string;
}) {
  const [filter, setFilter] = useState(initial);
  const q = useLoad<Ticket[]>(`/admin/support/tickets?${filter}&limit=100`);
  const [sel, setSel] = useState<string | null>(null);
  return (
    <Section
      title={title}
      action={
        <select
          className="input"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          aria-label="Filter tickets"
        >
          <option value="status=active">Active</option>
          <option value="overdue=true">Overdue first response</option>
          <option value="assignee=me">Assigned to me</option>
          <option value="assignee=none&status=active">Unassigned</option>
          <option value="status=RESOLVED">Resolved</option>
          <option value="status=CLOSED">Closed</option>
        </select>
      }
    >
      <State loading={q.loading && !q.data} error={q.error} empty={q.data?.length === 0} retry={q.reload} />
      {!!q.data?.length && (
        <div className="card">
          <table>
            <thead>
              <tr>
                <th>Subject</th>
                <th>Requester</th>
                <th>Severity</th>
                <th>Status</th>
                <th>First response due</th>
              </tr>
            </thead>
            <tbody>
              {q.data.map((t) => (
                <tr
                  key={t.id}
                  onClick={() => setSel(t.id)}
                  style={{ cursor: "pointer", background: sel === t.id ? "#eef4ff" : undefined }}
                >
                  <td>
                    {t.subject} <span className="muted">· {t.category.toLowerCase()}</span>
                  </td>
                  <td>{t.requester_email}</td>
                  <td>
                    <span className={`pill ${["URGENT", "HIGH"].includes(t.severity) ? "red" : ""}`}>{t.severity}</span>
                  </td>
                  <td>{t.status.replace(/_/g, " ").toLowerCase()}</td>
                  <td className={t.overdue ? "error" : ""}>{when(t.sla_due_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {sel && <TicketPanel key={sel} id={sel} writable={writable} meId={meId} onChanged={q.reload} />}
    </Section>
  );
}

function TicketPanel({
  id,
  writable,
  meId,
  onChanged,
}: {
  id: string;
  writable: boolean;
  meId: string;
  onChanged: () => void;
}) {
  const q = useLoad<TicketDetail>(`/admin/support/tickets/${id}`);
  const [body, setBody] = useState("");
  const [internal, setInternal] = useState(false);
  const [change, setChange] = useState<Record<string, unknown> | null>(null);
  const [err, setErr] = useState("");
  if (!q.data) return <State loading={q.loading} error={q.error} retry={q.reload} />;
  const t = q.data.ticket;
  const reply = async () => {
    try {
      await api(`/admin/support/tickets/${id}/messages`, { method: "POST", json: { body, internal } });
      setBody("");
      q.reload();
      onChanged();
    } catch (e) {
      setErr(errText(e));
    }
  };
  return (
    <div className="card">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h3 style={{ margin: 0 }}>{t.subject}</h3>
        <span className="muted">v{t.version}</span>
      </div>
      <div className="row" style={{ margin: "10px 0" }}>
        <select
          className="input"
          disabled={!writable}
          value=""
          onChange={(e) => e.target.value && setChange({ status: e.target.value })}
          aria-label="Set status"
        >
          <option value="">Set status…</option>
          {["OPEN", "IN_PROGRESS", "WAITING_ON_USER", "RESOLVED", "CLOSED"].map((s) => (
            <option key={s} value={s}>
              {s.replace(/_/g, " ").toLowerCase()}
            </option>
          ))}
        </select>
        <select
          className="input"
          disabled={!writable}
          value=""
          onChange={(e) => e.target.value && setChange({ severity: e.target.value })}
          aria-label="Set severity"
        >
          <option value="">Set severity…</option>
          {["LOW", "NORMAL", "HIGH", "URGENT"].map((s) => (
            <option key={s} value={s}>
              {s.toLowerCase()}
            </option>
          ))}
        </select>
        <button
          className="btn"
          disabled={!writable || t.assignee_id === meId}
          onClick={() => setChange({ assignee_id: meId })}
        >
          Assign to me
        </button>
        {t.assignee_id && (
          <button className="btn" disabled={!writable} onClick={() => setChange({ unassign: true })}>
            Unassign
          </button>
        )}
      </div>
      <ul className="thread" style={{ padding: 0 }}>
        {q.data.messages.map((m) => (
          <li key={m.id} className={m.internal ? "internal" : m.from_staff ? "staff" : ""}>
            <div className="muted" style={{ fontSize: 12 }}>
              {m.internal ? "Internal note" : m.from_staff ? "Staff" : "Requester"} · {when(m.created_at)}
            </div>
            <pre>{m.body}</pre>
          </li>
        ))}
      </ul>
      <textarea
        className="input"
        style={{ width: "100%", height: 80 }}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        aria-label="Reply"
      />
      <div className="row" style={{ justifyContent: "space-between", marginTop: 6 }}>
        <label>
          <input type="checkbox" checked={internal} onChange={(e) => setInternal(e.target.checked)} /> Internal note
          (requester never sees it)
        </label>
        <button className="btn primary" disabled={!writable || !body.trim()} onClick={reply}>
          {internal ? "Add note" : "Send reply"}
        </button>
      </div>
      {err && <p className="error">{err}</p>}
      {change && (
        <ReasonDialog
          title="Update ticket"
          onCancel={() => setChange(null)}
          onConfirm={async (reason) => {
            await api(`/admin/support/tickets/${id}`, {
              method: "PATCH",
              json: { ...change, reason, expected_version: t.version },
            });
            setChange(null);
            q.reload();
            onChanged();
          }}
        />
      )}
    </div>
  );
}

/* ---------------- User directory ---------------- */

interface UserRow {
  id: string;
  email: string;
  full_name: string | null;
  role: string;
  is_active: boolean;
  created_at: string;
}

export function People({
  writable,
  meId,
  preset = "",
  title = "User directory",
}: {
  writable: boolean;
  meId: string;
  preset?: string;
  title?: string;
}) {
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const q = useLoad<UserRow[]>(
    `/admin/users?limit=50&skip=${page * 50}${preset}${query ? `&q=${encodeURIComponent(query)}` : ""}`,
  );
  const [pending, setPending] = useState<{
    user: UserRow;
    kind: "suspend" | "reactivate" | "role" | "revoke";
    role?: string;
  } | null>(null);
  const run = async (reason: string) => {
    if (!pending) return;
    const { user, kind } = pending;
    if (kind === "suspend" || kind === "reactivate")
      await api(`/admin/users/${user.id}/status`, {
        method: "PATCH",
        json: { is_active: kind === "reactivate", reason },
      });
    if (kind === "role")
      await api(`/admin/users/${user.id}/role`, { method: "PATCH", json: { role: pending.role, reason } });
    if (kind === "revoke") await api(`/admin/users/${user.id}/revoke-sessions`, { method: "POST", json: { reason } });
    setPending(null);
    q.reload();
  };
  return (
    <Section title={title}>
      <form
        className="row"
        style={{ marginBottom: 10 }}
        onSubmit={(e) => {
          e.preventDefault();
          setPage(0);
          setQuery(search.trim());
        }}
      >
        <input
          className="input"
          placeholder="Search email or name"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search people"
        />
        <button className="btn">Search</button>
      </form>
      <State loading={q.loading && !q.data} error={q.error} empty={q.data?.length === 0} retry={q.reload} />
      {!!q.data?.length && (
        <div className="card">
          <table>
            <thead>
              <tr>
                <th>Person</th>
                <th>Role</th>
                <th>Status</th>
                <th>Joined</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {q.data.map((u) => (
                <tr key={u.id}>
                  <td>
                    {u.full_name || "—"}
                    <div className="muted">{u.email}</div>
                  </td>
                  <td>
                    <select
                      className="input"
                      disabled={!writable || u.id === meId}
                      value={u.role === "ADMIN" ? "ADMIN" : "ENGINEER"}
                      aria-label={`Role for ${u.email}`}
                      onChange={(e) => setPending({ user: u, kind: "role", role: e.target.value })}
                    >
                      <option value="ENGINEER">Member</option>
                      <option value="ADMIN">Staff (admin)</option>
                    </select>
                  </td>
                  <td>
                    <span className={`pill ${u.is_active ? "green" : "red"}`}>
                      {u.is_active ? "Active" : "Suspended"}
                    </span>
                  </td>
                  <td className="muted">{when(u.created_at)}</td>
                  <td>
                    <div className="row">
                      <button
                        className="btn"
                        disabled={!writable || u.id === meId}
                        onClick={() => setPending({ user: u, kind: u.is_active ? "suspend" : "reactivate" })}
                      >
                        {u.is_active ? "Suspend" : "Reactivate"}
                      </button>
                      <button
                        className="btn"
                        disabled={!writable}
                        onClick={() => setPending({ user: u, kind: "revoke" })}
                      >
                        Sign out everywhere
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="row" style={{ marginTop: 8 }}>
            <button className="btn" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
              Previous
            </button>
            <button className="btn" disabled={(q.data?.length ?? 0) < 50} onClick={() => setPage((p) => p + 1)}>
              Next
            </button>
          </div>
        </div>
      )}
      {pending && (
        <ReasonDialog
          title={
            pending.kind === "role"
              ? `Change ${pending.user.email} to ${pending.role}`
              : pending.kind === "revoke"
                ? `Sign ${pending.user.email} out of every session`
                : `${pending.kind === "suspend" ? "Suspend" : "Reactivate"} ${pending.user.email}`
          }
          danger={pending.kind === "suspend" || pending.role === "ADMIN"}
          confirmWord={pending.kind === "suspend" || pending.role === "ADMIN" ? pending.user.email : undefined}
          onCancel={() => setPending(null)}
          onConfirm={run}
        />
      )}
    </Section>
  );
}

/* ---------------- Moderation ---------------- */

interface Report {
  id: string;
  target_type: string;
  target_id: string;
  reason: string;
  status: string;
  decision: string | null;
  created_at: string;
}

const DECISION_FOR: Record<string, string> = { JOB: "HIDE_JOB", USER: "SUSPEND_USER", POST: "REMOVE_POST" };

export function Moderation({ writable, history = false }: { writable: boolean; history?: boolean }) {
  const q = useLoad<Report[]>("/moderation/reports");
  const [showClosed, setShowClosed] = useState(history);
  const [pending, setPending] = useState<{ r: Report; action: boolean } | null>(null);
  const rows = (q.data ?? []).filter((r) => (history ? r.status !== "OPEN" : showClosed || r.status === "OPEN"));
  return (
    <Section
      title={history ? "Moderation history" : "Review queue"}
      action={
        <label>
          <input type="checkbox" checked={showClosed} onChange={(e) => setShowClosed(e.target.checked)} /> Show decided
          reports
        </label>
      }
    >
      <State loading={q.loading && !q.data} error={q.error} empty={!q.loading && rows.length === 0} retry={q.reload} />
      {rows.map((r) => (
        <div className="card" key={r.id}>
          <div className="row" style={{ justifyContent: "space-between" }}>
            <strong>
              {r.target_type} <span className="muted">{r.target_id}</span>
            </strong>
            <span className={`pill ${r.status === "OPEN" ? "amber" : ""}`}>{r.status}</span>
          </div>
          <pre style={{ margin: "8px 0" }}>{r.reason}</pre>
          <div className="muted">Reported {when(r.created_at)}</div>
          {r.status === "OPEN" && (
            <div className="row" style={{ marginTop: 8 }}>
              <button className="btn danger" disabled={!writable} onClick={() => setPending({ r, action: true })}>
                {DECISION_FOR[r.target_type]?.replace("_", " ").toLowerCase()}
              </button>
              <button className="btn" disabled={!writable} onClick={() => setPending({ r, action: false })}>
                Dismiss
              </button>
            </div>
          )}
          {r.decision && <div className="muted">Decision: {r.decision}</div>}
        </div>
      ))}
      {pending && (
        <ReasonDialog
          title={pending.action ? `Act on ${pending.r.target_type.toLowerCase()} report` : "Dismiss report"}
          danger={pending.action}
          onCancel={() => setPending(null)}
          onConfirm={async (note) => {
            await api(`/moderation/reports/${pending.r.id}`, {
              method: "PATCH",
              json: pending.action
                ? { status: "RESOLVED", decision: DECISION_FOR[pending.r.target_type], note }
                : { status: "DISMISSED", decision: "NO_ACTION", note },
            });
            setPending(null);
            q.reload();
          }}
        />
      )}
    </Section>
  );
}

/* ---------------- Audit ---------------- */

interface AuditRow {
  id: string;
  actor_id: string | null;
  actor_role: string | null;
  action: string;
  resource_type: string;
  resource_id: string | null;
  payload: Record<string, unknown>;
  created_at: string;
}

export function Audit({ prefix = "", title = "Audit log" }: { prefix?: string; title?: string }) {
  const [action, setAction] = useState("");
  const [page, setPage] = useState(0);
  const q = useLoad<AuditRow[]>(
    `/admin/audit-events?limit=100&skip=${page * 100}${prefix ? `&action_prefix=${encodeURIComponent(prefix)}` : ""}${action ? `&action=${encodeURIComponent(action)}` : ""}`,
  );
  return (
    <Section
      title={title}
      action={
        <input
          className="input"
          placeholder="Filter by exact action, e.g. admin.user.role"
          value={action}
          onChange={(e) => setAction(e.target.value)}
          aria-label="Filter by action"
        />
      }
    >
      <State loading={q.loading && !q.data} error={q.error} empty={q.data?.length === 0} retry={q.reload} />
      {!!q.data?.length && (
        <div className="card">
          <table>
            <thead>
              <tr>
                <th>When</th>
                <th>Actor</th>
                <th>Action</th>
                <th>Target</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {q.data.map((e) => (
                <tr key={e.id}>
                  <td className="muted">{when(e.created_at)}</td>
                  <td>
                    {e.actor_role ?? "system"}
                    <div className="muted" style={{ fontSize: 11 }}>
                      {e.actor_id}
                    </div>
                  </td>
                  <td>{e.action}</td>
                  <td>
                    {e.resource_type} <span className="muted">{e.resource_id}</span>
                  </td>
                  <td>
                    <pre>{JSON.stringify(e.payload)}</pre>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="row" style={{ marginTop: 8 }}>
            <button className="btn" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
              Newer
            </button>
            <button className="btn" disabled={(q.data?.length ?? 0) < 100} onClick={() => setPage((p) => p + 1)}>
              Older
            </button>
          </div>
        </div>
      )}
    </Section>
  );
}

/* ---------------- AI usage ---------------- */

export function AiUsage() {
  const q = useLoad<{
    total_calls: number;
    total_tokens: number;
    estimated_cost_usd: number;
    model_breakdown: Record<string, number>;
    feature_breakdown: Record<string, number>;
  }>("/admin/ai-usage");
  const d = q.data;
  return (
    <Section title="AI usage & allowances">
      <State loading={q.loading && !d} error={q.error} retry={q.reload} />
      {d && (
        <>
          <div className="grid">
            <div className="card metric">
              <span>Calls</span>
              <strong>{d.total_calls}</strong>
            </div>
            <div className="card metric">
              <span>Tokens</span>
              <strong>{d.total_tokens.toLocaleString()}</strong>
            </div>
            <div className="card metric">
              <span>List-price equivalent</span>
              <strong>${d.estimated_cost_usd.toFixed(2)}</strong>
            </div>
          </div>
          <p className="muted">
            Free-tier providers only; no paid fallback is configured. Per-user monthly allowances and a platform daily
            cap apply.
          </p>
          {(["model_breakdown", "feature_breakdown"] as const).map((k) => (
            <div className="card" key={k}>
              <h3 style={{ marginTop: 0 }}>{k === "model_breakdown" ? "By model" : "By feature"}</h3>
              <table>
                <tbody>
                  {Object.entries(d[k]).map(([name, n]) => (
                    <tr key={name}>
                      <td>{name}</td>
                      <td>{n}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </>
      )}
    </Section>
  );
}

/* ---------------- Flags ---------------- */

export function Flags() {
  const q = useLoad<{ flags: Record<string, boolean> }>("/admin/feature-flags");
  return (
    <Section title="Feature flags">
      <p className="muted">
        Read-only. Flags change through the deployment&apos;s secret manager (Infisical), never from the browser.
      </p>
      <State loading={q.loading && !q.data} error={q.error} retry={q.reload} />
      {q.data && (
        <div className="card">
          <table>
            <tbody>
              {Object.entries(q.data.flags).map(([name, on]) => (
                <tr key={name}>
                  <td>{name}</td>
                  <td>
                    <span className={`pill ${on ? "green" : ""}`}>{on ? "on" : "off"}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Section>
  );
}

/* ---------------- Job sources ---------------- */

export function JobSources() {
  const q = useLoad<
    {
      id: string;
      source: string;
      status: string;
      jobs_fetched: number;
      jobs_inserted: number;
      jobs_updated: number;
      error_message: string | null;
      duration_ms: number;
      created_at: string;
    }[]
  >("/admin/sync-logs");
  return (
    <Section title="Job sources">
      <State loading={q.loading && !q.data} error={q.error} empty={q.data?.length === 0} retry={q.reload} />
      {!!q.data?.length && (
        <div className="card">
          <table>
            <thead>
              <tr>
                <th>When</th>
                <th>Source</th>
                <th>Status</th>
                <th>Fetched / new / updated</th>
                <th>Duration</th>
                <th>Error</th>
              </tr>
            </thead>
            <tbody>
              {q.data.map((s) => (
                <tr key={s.id}>
                  <td className="muted">{when(s.created_at)}</td>
                  <td>{s.source}</td>
                  <td>
                    <span className={`pill ${s.status === "SUCCESS" ? "green" : "red"}`}>{s.status}</span>
                  </td>
                  <td>
                    {s.jobs_fetched} / {s.jobs_inserted} / {s.jobs_updated}
                  </td>
                  <td>{(s.duration_ms / 1000).toFixed(1)} s</td>
                  <td className="error">{s.error_message ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Section>
  );
}

/* ---------------- Integrations inventory ---------------- */

// What the platform depends on, who owns it and where the runbook is. No secrets here.
const INTEGRATIONS = [
  [
    "Supabase Auth + Postgres + Storage",
    "Identity, database, private files",
    "Owner",
    "handbook/03-deployment-and-infrastructure.md",
  ],
  [
    "Render (API)",
    "FastAPI service; free tier sleeps when idle",
    "Owner",
    "handbook/03-deployment-and-infrastructure.md",
  ],
  ["Cloudflare Workers", "Web app and this console", "Owner", "handbook/05-cicd-pipeline.md"],
  ["Hosted Redis", "Rate limits and cache (disposable)", "Owner", "handbook/03-deployment-and-infrastructure.md"],
  ["LiteLLM free-tier chain", "AI features, metered per user", "Owner", "handbook/01-technical-architecture.md"],
  ["Resend", "Transactional email outbox", "Owner", "handbook/04-secrets-and-credentials.md"],
  ["Jitsi Meet (meet.jit.si)", "External meeting rooms; no data stored by us", "Owner", "handbook/11-feature-list.md"],
  ["GitHub Actions", "CI, deploys, scheduled job sync, backups", "Owner", "handbook/05-cicd-pipeline.md"],
  ["Infisical", "Secrets source of truth", "Owner", "handbook/04-secrets-and-credentials.md"],
];

export function Integrations() {
  return (
    <Section title="Integrations">
      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Integration</th>
              <th>Purpose</th>
              <th>Owner</th>
              <th>Runbook (internal repo)</th>
            </tr>
          </thead>
          <tbody>
            {INTEGRATIONS.map(([name, purpose, owner, runbook]) => (
              <tr key={name}>
                <td>{name}</td>
                <td>{purpose}</td>
                <td>{owner}</td>
                <td className="muted">{runbook}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Section>
  );
}

/* ---------------- Job moderation ---------------- */

interface AdminJob {
  id: string;
  title: string;
  company_name: string;
  source?: string | null;
  is_active: boolean;
  posted_at?: string | null;
}

export function Jobs({ writable }: { writable: boolean }) {
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const q = useLoad<AdminJob[]>(
    `/admin/jobs?limit=50&skip=${page * 50}${query ? `&q=${encodeURIComponent(query)}` : ""}`,
  );
  const [pending, setPending] = useState<{ job: AdminJob; kind: "toggle" | "delete" } | null>(null);
  return (
    <Section title="Job listings">
      <form
        className="row"
        style={{ marginBottom: 10 }}
        onSubmit={(e) => {
          e.preventDefault();
          setPage(0);
          setQuery(search.trim());
        }}
      >
        <input
          className="input"
          placeholder="Title or company"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search jobs"
        />
        <button className="btn">Search</button>
      </form>
      <State loading={q.loading && !q.data} error={q.error} empty={q.data?.length === 0} retry={q.reload} />
      {!!q.data?.length && (
        <div className="card">
          <table>
            <thead>
              <tr>
                <th>Job</th>
                <th>Source</th>
                <th>Status</th>
                <th>Posted</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {q.data.map((j) => (
                <tr key={j.id}>
                  <td>
                    {j.title}
                    <div className="muted">{j.company_name}</div>
                  </td>
                  <td>{j.source ?? "—"}</td>
                  <td>
                    <span className={`pill ${j.is_active ? "green" : ""}`}>{j.is_active ? "Live" : "Hidden"}</span>
                  </td>
                  <td className="muted">{when(j.posted_at)}</td>
                  <td>
                    <div className="row">
                      <button
                        className="btn"
                        disabled={!writable}
                        onClick={() => setPending({ job: j, kind: "toggle" })}
                      >
                        {j.is_active ? "Hide" : "Restore"}
                      </button>
                      <button
                        className="btn danger"
                        disabled={!writable}
                        onClick={() => setPending({ job: j, kind: "delete" })}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="row" style={{ marginTop: 8 }}>
            <button className="btn" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
              Previous
            </button>
            <button className="btn" disabled={(q.data?.length ?? 0) < 50} onClick={() => setPage((p) => p + 1)}>
              Next
            </button>
          </div>
        </div>
      )}
      {pending && (
        <ReasonDialog
          title={
            pending.kind === "delete"
              ? `Delete “${pending.job.title}” permanently`
              : `${pending.job.is_active ? "Hide" : "Restore"} “${pending.job.title}”`
          }
          danger={pending.kind === "delete"}
          confirmWord={pending.kind === "delete" ? "DELETE" : undefined}
          onCancel={() => setPending(null)}
          onConfirm={async () => {
            if (pending.kind === "delete") await api(`/admin/jobs/${pending.job.id}`, { method: "DELETE" });
            else
              await api(`/admin/jobs/${pending.job.id}/status`, {
                method: "PATCH",
                json: { is_active: !pending.job.is_active },
              });
            setPending(null);
            q.reload();
          }}
        />
      )}
    </Section>
  );
}

/* ---------------- Verification queue ---------------- */

export function Verifications({ writable }: { writable: boolean }) {
  const q =
    useLoad<{ id: string; user_id: string; verification_type: string; status: string; created_at: string }[]>(
      "/trust/verifications",
    );
  const [pending, setPending] = useState<{ id: string; status: "VERIFIED" | "REJECTED" } | null>(null);
  return (
    <Section title="Identity verification">
      <State loading={q.loading && !q.data} error={q.error} empty={q.data?.length === 0} retry={q.reload} />
      {!!q.data?.length && (
        <div className="card">
          <table>
            <thead>
              <tr>
                <th>Type</th>
                <th>User</th>
                <th>Status</th>
                <th>Submitted</th>
                <th>Decision</th>
              </tr>
            </thead>
            <tbody>
              {q.data.map((v) => (
                <tr key={v.id}>
                  <td>{v.verification_type.replace(/_/g, " ").toLowerCase()}</td>
                  <td className="muted">{v.user_id}</td>
                  <td>
                    <span
                      className={`pill ${v.status === "VERIFIED" ? "green" : v.status === "REJECTED" ? "red" : "amber"}`}
                    >
                      {v.status}
                    </span>
                  </td>
                  <td className="muted">{when(v.created_at)}</td>
                  <td>
                    {v.status === "PENDING" && (
                      <div className="row">
                        <button
                          className="btn primary"
                          disabled={!writable}
                          onClick={() => setPending({ id: v.id, status: "VERIFIED" })}
                        >
                          Verify
                        </button>
                        <button
                          className="btn"
                          disabled={!writable}
                          onClick={() => setPending({ id: v.id, status: "REJECTED" })}
                        >
                          Reject
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {pending && (
        <ReasonDialog
          title={pending.status === "VERIFIED" ? "Verify credential" : "Reject credential"}
          onCancel={() => setPending(null)}
          onConfirm={async (note) => {
            await api(`/trust/verifications/${pending.id}/review`, {
              method: "PATCH",
              json: { status: pending.status, verifier_notes: note },
            });
            setPending(null);
            q.reload();
          }}
        />
      )}
    </Section>
  );
}

/* ---------------- Organisations directory ---------------- */

export function Organisations() {
  const q =
    useLoad<
      { id: string; name: string; industry?: string | null; location?: string | null; website?: string | null }[]
    >("/companies/public?limit=100");
  return (
    <Section title="Company directory">
      <State loading={q.loading && !q.data} error={q.error} empty={q.data?.length === 0} retry={q.reload} />
      {!!q.data?.length && (
        <div className="card">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Industry</th>
                <th>Location</th>
              </tr>
            </thead>
            <tbody>
              {q.data.map((c) => (
                <tr key={c.id}>
                  <td>{c.name}</td>
                  <td>{c.industry ?? "—"}</td>
                  <td>{c.location ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Section>
  );
}

/* ---------------- Marketplace: contracts ---------------- */

interface ContractRow {
  id: string;
  title: string;
  status: string;
  rate_type: string;
  rate_amount: number;
  currency: string;
  client: { name: string | null; email: string | null };
  worker: { name: string | null; email: string | null };
  created_at: string;
}

export function Contracts() {
  const [statusF, setStatusF] = useState("");
  const q = useLoad<ContractRow[]>(`/admin/contracts?limit=200${statusF ? `&status=${statusF}` : ""}`);
  return (
    <Section
      title="Contracts"
      action={
        <select
          className="input"
          aria-label="Filter contracts"
          value={statusF}
          onChange={(e) => setStatusF(e.target.value)}
        >
          <option value="">All</option>
          {["DRAFT", "PENDING", "SIGNED", "ACTIVE", "COMPLETED", "TERMINATED"].map((s) => (
            <option key={s} value={s}>
              {s.replace("_", " ").toLowerCase()}
            </option>
          ))}
        </select>
      }
    >
      <State loading={q.loading && !q.data} error={q.error} empty={q.data?.length === 0} retry={q.reload} />
      {!!q.data?.length && (
        <div className="card">
          <table>
            <thead>
              <tr>
                <th>Contract</th>
                <th>Client</th>
                <th>Professional</th>
                <th>Rate</th>
                <th>Status</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {q.data.map((c) => (
                <tr key={c.id}>
                  <td>{c.title}</td>
                  <td>{c.client.name || c.client.email || "—"}</td>
                  <td>{c.worker.name || c.worker.email || "—"}</td>
                  <td>
                    {c.rate_amount} {c.currency} {c.rate_type === "HOURLY" ? "/ h" : ""}
                  </td>
                  <td>
                    <span className="pill">{c.status}</span>
                  </td>
                  <td>{when(c.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Section>
  );
}

/* ---------------- AI & automation: assistant activity ---------------- */

export function AssistantActivity() {
  const [statusF, setStatusF] = useState("");
  const q = useLoad<
    { id: string; user_email: string; tool: string; summary: string; status: string; created_at: string }[]
  >(`/admin/assistant-actions?limit=200${statusF ? `&status=${statusF}` : ""}`);
  return (
    <Section
      title="Assistant activity"
      action={
        <select
          className="input"
          aria-label="Filter actions"
          value={statusF}
          onChange={(e) => setStatusF(e.target.value)}
        >
          <option value="">All</option>
          {["PENDING", "EXECUTED", "FAILED", "CANCELLED"].map((s) => (
            <option key={s} value={s}>
              {s.toLowerCase()}
            </option>
          ))}
        </select>
      }
    >
      <p className="muted">
        Actions the AI assistant proposed and members confirmed. Arguments are hidden: they can contain private content.
      </p>
      <State loading={q.loading && !q.data} error={q.error} empty={q.data?.length === 0} retry={q.reload} />
      {!!q.data?.length && (
        <div className="card">
          <table>
            <thead>
              <tr>
                <th>When</th>
                <th>Member</th>
                <th>Tool</th>
                <th>Summary</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {q.data.map((a) => (
                <tr key={a.id}>
                  <td>{when(a.created_at)}</td>
                  <td>{a.user_email}</td>
                  <td>
                    <code>{a.tool}</code>
                  </td>
                  <td>{a.summary}</td>
                  <td>
                    <span className="pill">{a.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Section>
  );
}

/* ---------------- Platform configuration: announcements ---------------- */

interface AnnouncementRow {
  id: string;
  title: string;
  body: string;
  severity: string;
  active: boolean;
  created_at: string;
}

export function Announcements({ writable }: { writable: boolean }) {
  const q = useLoad<AnnouncementRow[]>("/admin/announcements");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [severity, setSeverity] = useState("INFO");
  const [err, setErr] = useState("");
  const publish = async () => {
    setErr("");
    try {
      await api("/admin/announcements", { method: "POST", json: { title, body, severity } });
      setTitle("");
      setBody("");
      q.reload();
    } catch (e) {
      setErr(errText(e));
    }
  };
  const toggle = async (a: AnnouncementRow) => {
    try {
      await api(`/admin/announcements/${a.id}`, { method: "PATCH", json: { active: !a.active } });
      q.reload();
    } catch (e) {
      setErr(errText(e));
    }
  };
  return (
    <Section title="Announcements">
      <div className="card">
        <p className="muted" style={{ marginTop: 0 }}>
          Active announcements appear as a banner for every signed-in member.
        </p>
        <label>
          Title
          <input
            className="input"
            style={{ width: "100%" }}
            value={title}
            maxLength={160}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>
        <label style={{ display: "block", marginTop: 8 }}>
          Message
          <textarea
            className="input"
            style={{ width: "100%", minHeight: 70 }}
            value={body}
            maxLength={2000}
            onChange={(e) => setBody(e.target.value)}
          />
        </label>
        <div className="row" style={{ marginTop: 8 }}>
          <select
            className="input"
            aria-label="Severity"
            value={severity}
            onChange={(e) => setSeverity(e.target.value)}
          >
            <option value="INFO">Information</option>
            <option value="WARNING">Warning</option>
            <option value="CRITICAL">Critical</option>
          </select>
          <button className="btn primary" disabled={!writable || !title.trim() || !body.trim()} onClick={publish}>
            Publish
          </button>
        </div>
        {err && <p className="error">{err}</p>}
      </div>
      <State loading={q.loading && !q.data} error={q.error} empty={q.data?.length === 0} retry={q.reload} />
      {!!q.data?.length && (
        <div className="card">
          <table>
            <thead>
              <tr>
                <th>Title</th>
                <th>Severity</th>
                <th>Published</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {q.data.map((a) => (
                <tr key={a.id}>
                  <td>
                    <b>{a.title}</b>
                    <div className="muted">{a.body}</div>
                  </td>
                  <td>{a.severity}</td>
                  <td>{when(a.created_at)}</td>
                  <td>{a.active ? "Live" : "Off"}</td>
                  <td>
                    <button className="btn" disabled={!writable} onClick={() => toggle(a)}>
                      {a.active ? "Turn off" : "Turn on"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Section>
  );
}

/* ---------------- Platform configuration: system status ---------------- */

export function SystemStatus() {
  const health = useLoad<Health>("/admin/health/details");
  return (
    <Section
      title="System status"
      action={
        <button className="btn" onClick={health.reload}>
          Refresh
        </button>
      }
    >
      <State loading={health.loading && !health.data} error={health.error} retry={health.reload} />
      {health.data && (
        <div className="card">
          <p>
            Overall: <span className="pill">{health.data.overall_status}</span>
          </p>
          <table>
            <thead>
              <tr>
                <th>Service</th>
                <th>Status</th>
                <th>Latency</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {health.data.services.map((x) => (
                <tr key={x.service}>
                  <td>{x.service}</td>
                  <td>
                    <span className="pill">{x.status}</span>
                  </td>
                  <td>{x.latency_ms == null ? "—" : `${Math.round(x.latency_ms)} ms`}</td>
                  <td>{x.details ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Section>
  );
}

/* ---------------- Platform configuration: usage & limits ---------------- */

interface Usage {
  measured_at: string;
  limits: Record<string, number>;
  database_bytes: number | null;
  users_total: number;
  users_new_this_month: number;
  jobs_live: number;
  jobs_by_source: Record<string, number>;
  posts_total: number;
  emails_sent_today: number;
  emails_sent_this_month: number;
  ai_calls_this_month: number;
  last_import: { source: string; status: string; at: string; fetched: number; new: number; error: string | null }[];
  dashboards: Record<string, string>;
}

function Meter({ label, value, limit, unit = "" }: { label: string; value: number; limit: number; unit?: string }) {
  const pct = Math.min(100, Math.round((value / limit) * 100));
  const tone = pct >= 85 ? "var(--danger)" : pct >= 60 ? "#d97706" : "var(--brand)";
  return (
    <div className="card metric">
      <span>{label}</span>
      <strong>
        {value.toLocaleString()}
        {unit}{" "}
        <small className="muted">
          / {limit.toLocaleString()}
          {unit}
        </small>
      </strong>
      <div style={{ height: 8, background: "var(--chip)", borderRadius: 4, marginTop: 8 }}>
        <div style={{ width: `${pct}%`, height: 8, background: tone, borderRadius: 4 }} />
      </div>
      <span style={{ marginTop: 6 }}>{pct}% of the free limit</span>
    </div>
  );
}

export function UsageLimits() {
  const q = useLoad<Usage>("/admin/usage");
  const u = q.data;
  const mb = (b: number) => Math.round(b / 1024 / 1024);
  return (
    <Section
      title="Usage & limits"
      action={
        <button className="btn" onClick={q.reload}>
          Refresh
        </button>
      }
    >
      <p className="muted">
        Live counts from the platform against the free-tier limits. Numbers only the provider sees (web requests, server
        hours, Redis commands, sign-in emails) are on each provider&apos;s dashboard below.
      </p>
      <State loading={q.loading && !q.data} error={q.error} retry={q.reload} />
      {u && (
        <>
          <div className="grid">
            {u.database_bytes != null && (
              <Meter
                label="Database size (Supabase)"
                value={mb(u.database_bytes)}
                limit={mb(u.limits.database_bytes)}
                unit=" MB"
              />
            )}
            <Meter
              label="Registered users (Supabase auth)"
              value={u.users_total}
              limit={u.limits.monthly_active_users}
            />
            <Meter
              label="Notification emails today (Resend)"
              value={u.emails_sent_today}
              limit={u.limits.emails_per_day}
            />
            <Meter
              label="Notification emails this month"
              value={u.emails_sent_this_month}
              limit={u.limits.emails_per_month}
            />
          </div>
          <div className="grid">
            <div className="card metric">
              <span>Live jobs</span>
              <strong>{u.jobs_live.toLocaleString()}</strong>
            </div>
            <div className="card metric">
              <span>New users this month</span>
              <strong>{u.users_new_this_month.toLocaleString()}</strong>
            </div>
            <div className="card metric">
              <span>Feed posts</span>
              <strong>{u.posts_total.toLocaleString()}</strong>
            </div>
            <div className="card metric">
              <span>AI calls this month</span>
              <strong>{u.ai_calls_this_month.toLocaleString()}</strong>
            </div>
          </div>
          <div className="card">
            <h3 style={{ marginTop: 0 }}>Job import by source</h3>
            <table>
              <thead>
                <tr>
                  <th>Source</th>
                  <th>Live jobs</th>
                  <th>Last run</th>
                  <th>Status</th>
                  <th>Fetched / new</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(u.jobs_by_source).map(([src, n]) => {
                  const run = u.last_import.find((r) => r.source === src);
                  return (
                    <tr key={src}>
                      <td>{src}</td>
                      <td>{n.toLocaleString()}</td>
                      <td>{run ? when(run.at) : "—"}</td>
                      <td>
                        {run ? (
                          <span
                            className={`pill ${run.status === "SUCCESS" ? "green" : run.status === "FAILED" ? "red" : ""}`}
                          >
                            {run.status}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td>{run ? `${run.fetched} / ${run.new}` : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="card">
            <h3 style={{ marginTop: 0 }}>Provider dashboards</h3>
            <ul>
              {Object.entries(u.dashboards).map(([name, url]) => (
                <li key={name}>
                  <a href={url} target="_blank" rel="noopener noreferrer">
                    {name}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </Section>
  );
}
