"use client";

import { Section, State, useLoad, when } from "./kit";

/* Service catalogue and backup evidence. Read-only: statuses come from live
   probes and from runs the backup scripts report; nothing here is assumed. */

type Component = {
  id: string;
  name: string;
  kind: string;
  host: string;
  owner: string;
  depends_on: string[];
  runbook: string;
  status: string;
};
type Backup = {
  status: string;
  last_backup_at: string | null;
  last_backup_archive: string | null;
  last_restore_verified_at: string | null;
  last_restore_target: string | null;
};
type Run = {
  id: string;
  kind: string;
  environment: string;
  status: string;
  archive_name: string | null;
  size_bytes: number | null;
  tables: number | null;
  objects: number | null;
  error: string | null;
  finished_at: string;
};

const GOOD = new Set(["HEALTHY", "CONFIGURED", "ok", "success"]);
const BACKUP_TEXT: Record<string, string> = {
  ok: "Backup and restore evidence is current",
  no_evidence: "No backup has been reported yet",
  backup_stale: "The last backup is older than 26 hours",
  restore_unverified: "No verified restore in the last 35 days",
};

const pill = (s: string) => <span className={`pill ${GOOD.has(s) ? "green" : ""}`}>{s.replace("_", " ")}</span>;

export function BackupSummary({ b }: { b: Backup }) {
  return (
    <div className="card">
      <p>
        {pill(b.status)} {BACKUP_TEXT[b.status] ?? b.status}
      </p>
      <p className="muted">
        Last backup: {when(b.last_backup_at)} {b.last_backup_archive && `(${b.last_backup_archive})`}
        <br />
        Last verified restore: {when(b.last_restore_verified_at)}{" "}
        {b.last_restore_target && `into ${b.last_restore_target}`}
      </p>
    </div>
  );
}

export function ServiceCatalogue() {
  const q = useLoad<{ measured_at: string; components: Component[]; backup: Backup }>("/admin/catalogue");
  return (
    <Section
      title="Service catalogue"
      action={
        <button className="btn" onClick={q.reload}>
          Refresh
        </button>
      }
    >
      <State loading={q.loading && !q.data} error={q.error} retry={q.reload} />
      {q.data && (
        <>
          <p className="muted">
            Measured {when(q.data.measured_at)}. NOT PROBED means the API has no live check for it.
          </p>
          <div className="card">
            <table>
              <thead>
                <tr>
                  <th>Component</th>
                  <th>Status</th>
                  <th>Runs on</th>
                  <th>Depends on</th>
                  <th>Runbook</th>
                </tr>
              </thead>
              <tbody>
                {q.data.components.map((c) => (
                  <tr key={c.id}>
                    <td>
                      {c.name}
                      <div className="muted">
                        {c.kind} · {c.owner}
                      </div>
                    </td>
                    <td>{pill(c.status)}</td>
                    <td className="muted">{c.host}</td>
                    <td className="muted">{c.depends_on.join(", ") || "—"}</td>
                    <td>
                      <code>{c.runbook}</code>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <h3>Backups</h3>
          <BackupSummary b={q.data.backup} />
        </>
      )}
    </Section>
  );
}

export function Backups() {
  const q = useLoad<{ summary: Backup; runs: Run[] }>("/admin/backups");
  return (
    <Section title="Backups & restores">
      <State loading={q.loading && !q.data} error={q.error} empty={q.data?.runs.length === 0} retry={q.reload} />
      {q.data && <BackupSummary b={q.data.summary} />}
      {!!q.data?.runs.length && (
        <div className="card">
          <table>
            <thead>
              <tr>
                <th>Finished</th>
                <th>Run</th>
                <th>Result</th>
                <th>Archive</th>
                <th>Tables / objects</th>
              </tr>
            </thead>
            <tbody>
              {q.data.runs.map((r) => (
                <tr key={r.id}>
                  <td>{when(r.finished_at)}</td>
                  <td>
                    {r.kind === "backup" ? "Backup" : "Restore check"} <span className="muted">{r.environment}</span>
                  </td>
                  <td>
                    {pill(r.status)}
                    {r.error && <div className="muted">{r.error}</div>}
                  </td>
                  <td className="muted">
                    {r.archive_name ?? "—"}
                    {r.size_bytes != null && ` · ${(r.size_bytes / 1048576).toFixed(1)} MB`}
                  </td>
                  <td className="muted">
                    {r.tables ?? "—"} / {r.objects ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="muted">
        Runs appear when the backup scripts are given the report URL and token (ops/backup/README.md).
      </p>
    </Section>
  );
}
