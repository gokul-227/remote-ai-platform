"use client";

import { useState, type FormEvent } from "react";
import { api } from "@/lib/client";
import { ReasonDialog, Section, State, useLoad, when } from "./kit";

interface Incident {
  id: string; title: string; description: string; service: string;
  severity: string; status: string; assignee_id: string | null; version: number;
  created_at: string; resolved_at: string | null;
}
interface Activity {
  id: string; actor_id: string | null; action: string; created_at: string;
  payload: { reason?: string; body?: string; before?: unknown; after?: unknown };
}
const severities = ["SEV1", "SEV2", "SEV3", "SEV4"];
const transitions: Record<string, string[]> = {
  OPEN: ["ACKNOWLEDGED"], ACKNOWLEDGED: ["INVESTIGATING", "RESOLVED"],
  INVESTIGATING: ["MONITORING", "RESOLVED"], MONITORING: ["INVESTIGATING", "RESOLVED"],
  RESOLVED: ["OPEN"],
};
type Action = { title: string; run: (reason: string) => Promise<void> };

export function Incidents({ writable }: { writable: boolean }) {
  const [status, setStatus] = useState("");
  const [severity, setSeverity] = useState("");
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [dialog, setDialog] = useState<Action | null>(null);
  const list = useLoad<Incident[]>(`/admin/incidents?limit=25&offset=${offset}${status ? `&status=${status}` : ""}${severity ? `&severity=${severity}` : ""}`);
  const create = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fields = new FormData(e.currentTarget);
    const body = Object.fromEntries(fields);
    setDialog({ title: "Create incident", run: async (reason) => {
      const result = await api<Incident>("/admin/incidents", { method: "POST", json: { ...body, reason } });
      setCreating(false); setSelected(result.data.id); list.reload();
    } });
  };
  return <Section title="Incidents" action={<button className="btn" disabled={!writable} onClick={() => setCreating(!creating)}>New incident</button>}>
    {creating && <form className="card" onSubmit={create}>
      <label>Title<input className="input" name="title" required maxLength={160} /></label>
      <label>Service<input className="input" name="service" required maxLength={120} /></label>
      <label>Description<textarea className="input" name="description" required maxLength={10000} /></label>
      <label>Severity<select name="severity" defaultValue="SEV3">{severities.map(s => <option key={s}>{s}</option>)}</select></label>
      <button className="btn primary" disabled={!writable}>Create</button>
    </form>}
    <div className="row">
      <label>Status<select value={status} onChange={e => { setStatus(e.target.value); setOffset(0); }}><option value="">All statuses</option>{Object.keys(transitions).map(s => <option key={s}>{s}</option>)}</select></label>
      <label>Severity filter<select value={severity} onChange={e => { setSeverity(e.target.value); setOffset(0); }}><option value="">All severities</option>{severities.map(s => <option key={s}>{s}</option>)}</select></label>
      <button className="btn" onClick={list.reload}>Refresh incidents</button>
    </div>
    <State loading={list.loading} error={list.error} empty={list.data?.length === 0} retry={list.reload} />
    {list.data && <table><thead><tr><th>Incident</th><th>Service</th><th>Severity</th><th>Status</th><th>Created</th></tr></thead><tbody>{list.data.map(i => <tr key={i.id}>
      <td><button className="btn" onClick={() => setSelected(i.id)}>{i.title}</button></td><td>{i.service}</td><td>{i.severity}</td><td>{i.status}</td><td>{when(i.created_at)}</td>
    </tr>)}</tbody></table>}
    <div className="row"><button className="btn" disabled={!offset || list.loading} onClick={() => setOffset(offset - 25)}>Previous incidents</button><button className="btn" disabled={list.data?.length !== 25 || list.loading} onClick={() => setOffset(offset + 25)}>Next incidents</button></div>
    {selected && <IncidentDetail key={selected} id={selected} writable={writable} changed={list.reload} />}
    {dialog && <ReasonDialog title={dialog.title} onCancel={() => setDialog(null)} onConfirm={async reason => { await dialog.run(reason); setDialog(null); }} />}
  </Section>;
}

function IncidentDetail({ id, writable, changed }: { id: string; writable: boolean; changed: () => void }) {
  const detail = useLoad<Incident>(`/admin/incidents/${id}`);
  const [offset, setOffset] = useState(0);
  const activity = useLoad<Activity[]>(`/admin/incidents/${id}/activity?limit=25&offset=${offset}`);
  const [dialog, setDialog] = useState<Action | null>(null);
  const [note, setNote] = useState("");
  const item = detail.data;
  const mutate = (title: string, fields: Record<string, unknown>) => setDialog({ title, run: async reason => {
    await api(`/admin/incidents/${id}`, { method: "PATCH", json: { ...fields, version: item!.version, reason } });
    detail.reload(); activity.reload(); changed();
  } });
  return <div className="card">
    <State loading={detail.loading} error={detail.error} retry={detail.reload} />
    {item && <>
      <h3>{item.title}</h3><p>{item.description}</p><p>{item.service} · {item.severity} · {item.status} · version {item.version}</p>
      <p>Assignee: {item.assignee_id ?? "Unassigned"} · Resolved: {when(item.resolved_at)}</p>
      <button className="btn" onClick={() => { detail.reload(); activity.reload(); }}>Refresh detail</button>
      <div className="row">{transitions[item.status]?.map(status => <button className="btn" key={status} disabled={!writable || detail.loading} onClick={() => mutate(`Set status to ${status}`, { status })}>{status === "OPEN" ? "Reopen" : status}</button>)}</div>
      <form onSubmit={e => { e.preventDefault(); const f = new FormData(e.currentTarget); mutate("Update incident assignment and severity", { severity: f.get("severity"), assignee_id: f.get("assignee_id") || null }); }} key={item.version}>
        <label>Incident severity<select name="severity" defaultValue={item.severity}>{severities.map(s => <option key={s}>{s}</option>)}</select></label>
        <label>Assignee staff ID<input className="input" name="assignee_id" defaultValue={item.assignee_id ?? ""} placeholder="Active staff UUID; blank to unassign" pattern="[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}" /></label>
        <button className="btn" disabled={!writable || detail.loading}>Save assignment and severity</button>
      </form>
      <label>Incident note<textarea className="input" maxLength={4000} value={note} onChange={e => setNote(e.target.value)} /></label>
      <button className="btn" disabled={!writable || !note.trim()} onClick={() => setDialog({ title: "Add incident note", run: async reason => {
        await api(`/admin/incidents/${id}/notes`, { method: "POST", json: { body: note, reason } }); setNote(""); activity.reload();
      } })}>Add note</button>
    </>}
    <h3>Activity</h3><State loading={activity.loading} error={activity.error} empty={activity.data?.length === 0} retry={activity.reload} />
    {activity.data?.map(a => <article key={a.id}><strong>{a.action}</strong> · {when(a.created_at)} · {a.actor_id ?? "Deleted staff"}<p>{a.payload.reason}</p>{a.payload.body && <p>{a.payload.body}</p>}{a.payload.after !== undefined && <pre>{JSON.stringify({ before: a.payload.before, after: a.payload.after }, null, 2)}</pre>}</article>)}
    <button className="btn" disabled={!offset || activity.loading} onClick={() => setOffset(offset - 25)}>Previous activity</button><button className="btn" disabled={activity.data?.length !== 25 || activity.loading} onClick={() => setOffset(offset + 25)}>Next activity</button>
    {dialog && <ReasonDialog title={dialog.title} onCancel={() => setDialog(null)} onConfirm={async reason => { await dialog.run(reason); setDialog(null); }} />}
  </div>;
}
