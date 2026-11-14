"use client";

import { Section, State, useLoad, when } from "./kit";

interface Inventory {
  measured_at: string;
  services: { id: string; route_count: number; status: string }[];
  read_views: { name: string; path: string; screen: string }[];
  backup: {
    status: string;
    last_backup_at: string | null;
    last_restore_verified_at: string | null;
    reason: string;
    runbook: string;
    includes: string[];
    excludes: string[];
    required_evidence: string[];
  };
}

export function OperationsInventory() {
  const q = useLoad<Inventory>("/admin/operations/inventory");
  return (
    <Section title="Operations inventory" action={<button className="btn" onClick={q.reload}>Refresh</button>}>
      <p className="muted">Read-only catalogue of routes mounted in this API process. Route availability does not establish provider health or deployment status.</p>
      <State loading={q.loading && !q.data} error={q.error} retry={q.reload} />
      {q.data && <>
        <h3>Backup evidence unavailable</h3>
        <p>{q.data.backup.reason}</p>
        <p>Last evidenced backup: {when(q.data.backup.last_backup_at)}. Last verified restore: {when(q.data.backup.last_restore_verified_at)}.</p>
        <p>Runbook: <code>{q.data.backup.runbook}</code></p>
        <p>Backup scope: {q.data.backup.includes.join("; ")}.</p>
        <p>Excluded: {q.data.backup.excludes.join("; ")}.</p>
        <ul>{q.data.backup.required_evidence.map((item) => <li key={item}>{item}</li>)}</ul>
        <h3>Operational views</h3>
        <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>{q.data.read_views.map((view) => <a className="btn" key={view.path} href={`#${view.screen}`}>{view.name}</a>)}</div>
        <h3>Mounted API domains</h3>
        <table aria-label="Mounted API domains"><thead><tr><th>Domain</th><th>Routes</th><th>Evidence</th></tr></thead>
          <tbody>{q.data.services.map((service) => <tr key={service.id}><td>{service.id}</td><td>{service.route_count}</td><td>{service.status}</td></tr>)}</tbody>
        </table>
        <p className="muted">Observed {when(q.data.measured_at)}</p>
      </>}
    </Section>
  );
}
