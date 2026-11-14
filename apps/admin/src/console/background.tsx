"use client";

import { useState } from "react";
import { api } from "@/lib/client";
import { ReasonDialog, Section, State, errText, useLoad, when } from "./kit";

/* Background processing: workers, scheduler, task runs, dead letters and import
   sources. Every number is read from PostgreSQL task history; nothing is
   estimated. Writes need a reason and are audited by the API. */

interface Overview {
  runs_by_status: Record<string, number>;
  dead_letters_open: number;
  undispatched_outbox: number;
  liveness: Record<string, { count: number; fresh: number; newest_age_seconds: number | null }>;
  dispatch_disabled: boolean;
}

interface Source {
  name: string;
  enabled: boolean;
  cron: string;
  max_per_run: number;
  rate_limit_per_minute: number;
  permission_confirmed: boolean;
  last_enqueued_at: string | null;
  last_success_at: string | null;
  last_error: string | null;
  consecutive_failures: number;
}

interface Run {
  id: string;
  task_name: string;
  status: string;
  attempts: number;
  max_attempts: number;
  args: Record<string, unknown>;
  started_at: string | null;
  finished_at: string | null;
  next_retry_at: string | null;
  worker_id: string | null;
  error: string | null;
  created_at: string;
}

interface DeadLetter {
  id: string;
  task_name: string;
  args: Record<string, unknown>;
  error: string | null;
  created_at: string;
}

const pillFor = (status: string) =>
  status === "SUCCEEDED" || status === "HEALTHY"
    ? "green"
    : status === "DEAD" || status === "FAILED" || status === "DOWN"
      ? "red"
      : status === "RETRYING" || status === "DEGRADED"
        ? "amber"
        : "";

export function Background({ writable }: { writable: boolean }) {
  const overview = useLoad<Overview>("/admin/background/overview");
  const sources = useLoad<Source[]>("/admin/background/sources");
  const [status, setStatus] = useState("");
  const runs = useLoad<Run[]>(`/admin/background/runs?limit=50${status ? `&status=${status}` : ""}`);
  const dead = useLoad<DeadLetter[]>("/admin/background/dead-letters");
  const [dialog, setDialog] = useState<null | { title: string; run: (reason: string) => Promise<void> }>(null);
  const [err, setErr] = useState("");

  const act = (title: string, run: (reason: string) => Promise<void>) =>
    setDialog({
      title,
      run: async (reason) => {
        setErr("");
        try {
          await run(reason);
          overview.reload();
          sources.reload();
          runs.reload();
          dead.reload();
        } catch (e) {
          setErr(errText(e));
          throw e;
        }
      },
    });

  const live = (kind: string) => {
    const l = overview.data?.liveness[kind];
    if (!l) return <span className="pill">no heartbeat yet</span>;
    const s = l.fresh > 0 ? "HEALTHY" : "DEGRADED";
    return (
      <span className={`pill ${pillFor(s)}`}>
        {s} · {l.fresh}/{l.count} fresh · newest {l.newest_age_seconds ?? "—"}s ago
      </span>
    );
  };

  return (
    <Section title="Background processing">
      <State loading={overview.loading && !overview.data} error={overview.error} retry={overview.reload} />
      {overview.data && (
        <>
          {overview.data.dispatch_disabled && (
            <p role="alert" className="card">
              Dispatch is disabled on this API (TASKS_DISPATCH_DISABLED): runs are recorded but never sent to the
              broker.
            </p>
          )}
          <div className="grid">
            <div className="card metric">
              <span>Workers</span>
              <strong>{live("worker")}</strong>
            </div>
            <div className="card metric">
              <span>Scheduler</span>
              <strong>{live("scheduler")}</strong>
            </div>
            <div className="card metric">
              <span>Dead letters awaiting retry</span>
              <strong>{overview.data.dead_letters_open}</strong>
            </div>
            <div className="card metric">
              <span>Outbox events not yet dispatched</span>
              <strong>{overview.data.undispatched_outbox}</strong>
            </div>
            {Object.entries(overview.data.runs_by_status).map(([k, v]) => (
              <div className="card metric" key={k}>
                <span>Runs {k.toLowerCase()}</span>
                <strong>{v}</strong>
              </div>
            ))}
          </div>
        </>
      )}
      {err && <p role="alert">{err}</p>}

      <h3>Import sources</h3>
      <State loading={sources.loading && !sources.data} error={sources.error} retry={sources.reload} />
      {!!sources.data?.length && (
        <div className="card">
          <table>
            <thead>
              <tr>
                <th>Source</th>
                <th>Enabled</th>
                <th>Permission</th>
                <th>Schedule (cron, UTC)</th>
                <th>Cap / run</th>
                <th>Last success</th>
                <th>Failures</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {sources.data.map((s) => (
                <tr key={s.name}>
                  <td>{s.name}</td>
                  <td>
                    <span className={`pill ${s.enabled ? "green" : ""}`}>{s.enabled ? "on" : "off"}</span>
                  </td>
                  <td>
                    <span className={`pill ${s.permission_confirmed ? "green" : "red"}`}>
                      {s.permission_confirmed ? "confirmed" : "blocked"}
                    </span>
                  </td>
                  <td>
                    <code>{s.cron}</code>
                  </td>
                  <td>{s.max_per_run}</td>
                  <td className="muted">
                    {when(s.last_success_at)}
                    {s.last_error && <div className="muted">{s.last_error}</div>}
                  </td>
                  <td>{s.consecutive_failures}</td>
                  <td className="row">
                    <button
                      className="btn"
                      disabled={!writable}
                      onClick={() =>
                        act(`${s.enabled ? "Disable" : "Enable"} ${s.name}`, async (reason) => {
                          await api(`/admin/background/sources/${s.name}`, {
                            method: "PATCH",
                            json: { reason, enabled: !s.enabled },
                          });
                        })
                      }
                    >
                      {s.enabled ? "Disable" : "Enable"}
                    </button>
                    <button
                      className="btn"
                      disabled={!writable}
                      onClick={() => {
                        const cron = window.prompt(`Cron schedule for ${s.name} (UTC)`, s.cron);
                        if (!cron || cron === s.cron) return;
                        act(`Change schedule for ${s.name} to ${cron}`, async (reason) => {
                          await api(`/admin/background/sources/${s.name}`, { method: "PATCH", json: { reason, cron } });
                        });
                      }}
                    >
                      Schedule
                    </button>
                    <button
                      className="btn"
                      disabled={!writable}
                      onClick={() =>
                        act(
                          `${s.permission_confirmed ? "Withdraw" : "Confirm"} permission for ${s.name}`,
                          async (reason) => {
                            await api(`/admin/background/sources/${s.name}`, {
                              method: "PATCH",
                              json: { reason, permission_confirmed: !s.permission_confirmed },
                            });
                          },
                        )
                      }
                    >
                      {s.permission_confirmed ? "Withdraw permission" : "Confirm permission"}
                    </button>
                    <button
                      className="btn primary"
                      disabled={!writable || !s.permission_confirmed}
                      onClick={() =>
                        act(`Import ${s.name} now`, async (reason) => {
                          await api(`/admin/background/sources/${s.name}/run`, { method: "POST", json: { reason } });
                        })
                      }
                    >
                      Import now
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h3>Dead letters</h3>
      <State
        loading={dead.loading && !dead.data}
        error={dead.error}
        empty={dead.data?.length === 0}
        retry={dead.reload}
      />
      {!!dead.data?.length && (
        <div className="card">
          <table>
            <thead>
              <tr>
                <th>When</th>
                <th>Task</th>
                <th>Arguments</th>
                <th>Error</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {dead.data.map((d) => (
                <tr key={d.id}>
                  <td className="muted">{when(d.created_at)}</td>
                  <td>{d.task_name}</td>
                  <td>
                    <code>{JSON.stringify(d.args)}</code>
                  </td>
                  <td className="muted">{d.error}</td>
                  <td>
                    <button
                      className="btn"
                      disabled={!writable}
                      onClick={() =>
                        act(`Retry ${d.task_name}`, async (reason) => {
                          await api(`/admin/background/dead-letters/${d.id}/retry`, {
                            method: "POST",
                            json: { reason },
                          });
                        })
                      }
                    >
                      Retry
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h3>Recent runs</h3>
      <div className="row" style={{ marginBottom: 12 }}>
        <label>
          Status{" "}
          <select aria-label="Run status" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">all</option>
            {["QUEUED", "STARTED", "RETRYING", "SUCCEEDED", "FAILED", "DEAD"].map((s) => (
              <option key={s} value={s}>
                {s.toLowerCase()}
              </option>
            ))}
          </select>
        </label>
        <button className="btn" onClick={runs.reload}>
          Refresh
        </button>
      </div>
      <State
        loading={runs.loading && !runs.data}
        error={runs.error}
        empty={runs.data?.length === 0}
        retry={runs.reload}
      />
      {!!runs.data?.length && (
        <div className="card">
          <table>
            <thead>
              <tr>
                <th>Created</th>
                <th>Task</th>
                <th>Status</th>
                <th>Attempts</th>
                <th>Arguments</th>
                <th>Worker</th>
                <th>Finished</th>
                <th>Error</th>
              </tr>
            </thead>
            <tbody>
              {runs.data.map((r) => (
                <tr key={r.id}>
                  <td className="muted">{when(r.created_at)}</td>
                  <td>{r.task_name}</td>
                  <td>
                    <span className={`pill ${pillFor(r.status)}`}>{r.status}</span>
                    {r.next_retry_at && <div className="muted">retry {when(r.next_retry_at)}</div>}
                  </td>
                  <td>
                    {r.attempts}/{r.max_attempts}
                  </td>
                  <td>
                    <code>{JSON.stringify(r.args)}</code>
                  </td>
                  <td className="muted">{r.worker_id ?? "—"}</td>
                  <td className="muted">{when(r.finished_at)}</td>
                  <td className="muted">{r.error}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {dialog && (
        <ReasonDialog
          title={dialog.title}
          onCancel={() => setDialog(null)}
          onConfirm={async (r) => {
            await dialog.run(r);
            setDialog(null);
          }}
        />
      )}
    </Section>
  );
}
