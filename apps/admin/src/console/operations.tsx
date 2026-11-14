"use client";

import { useState } from "react";
import { api } from "@/lib/client";
import { ReasonDialog, Section, State, useLoad, when } from "./kit";

interface Operations {
  measured_at: string;
  projects_by_status: Record<string, number>;
  documents_by_kind: Record<string, number>;
  open_tasks: number;
  overdue_tasks: number;
  upcoming_meetings: number;
  support_active: number;
  email_pending: number;
  email_dead: number;
}

export function PlatformOperations() {
  const q = useLoad<Operations>("/admin/operations/summary");
  const metric = (label: string, value: number | undefined) => (
    <div className="card metric" key={label}>
      <span>{label}</span>
      <strong>{value ?? "—"}</strong>
    </div>
  );
  return (
    <Section
      title="Platform operations"
      action={
        <button className="btn" onClick={q.reload}>
          Refresh
        </button>
      }
    >
      <p className="muted">Delivery, collaboration and service queues across the platform.</p>
      <State loading={q.loading && !q.data} error={q.error} retry={q.reload} />
      <h3>Delivery workload</h3>
      <div className="grid">
        {metric("Open work items", q.data?.open_tasks)}
        {metric("Overdue work items", q.data?.overdue_tasks)}
        {metric("Upcoming meetings", q.data?.upcoming_meetings)}
      </div>
      <div className="row" style={{ gap: 24, flexWrap: "wrap", alignItems: "stretch", marginTop: 16 }}>
        <div className="card" style={{ flex: 1, minWidth: 220 }}>
          <h3>Project portfolio</h3>
          {q.data && Object.entries(q.data.projects_by_status).length === 0 && (
            <p className="muted">No projects yet.</p>
          )}
          {q.data &&
            Object.entries(q.data.projects_by_status).map(([status, count]) => (
              <p key={status}>
                <span className="pill">{status}</span> {count}
              </p>
            ))}
          <a className="btn" href="#portfolio">
            Manage projects
          </a>
        </div>
        <div className="card" style={{ flex: 1, minWidth: 220 }}>
          <h3>Workspace documents</h3>
          {q.data && Object.entries(q.data.documents_by_kind).length === 0 && (
            <p className="muted">No documents yet.</p>
          )}
          {q.data &&
            Object.entries(q.data.documents_by_kind).map(([kind, count]) => (
              <p key={kind}>
                {{ DOC: "Documents", SHEET: "Spreadsheets", SLIDES: "Presentations" }[kind] ?? kind}:{" "}
                <strong>{count}</strong>
              </p>
            ))}
        </div>
      </div>
      <h3>Service queues</h3>
      <div className="grid">
        {metric("Active support tickets", q.data?.support_active)}
        {metric("Emails awaiting delivery", q.data?.email_pending)}
        {metric("Email delivery failures", q.data?.email_dead)}
      </div>
      <div className="row" style={{ gap: 8, marginTop: 16, flexWrap: "wrap" }}>
        <a className="btn" href="#tickets">
          Open support queue
        </a>
        <a className="btn" href="#integrations">
          Review integrations
        </a>
        <a className="btn" href="#status">
          Service health
        </a>
        <a className="btn" href="#sources">
          Job source activity
        </a>
        <a className="btn" href="#audit">
          Audit history
        </a>
      </div>
      {q.data && <p className="muted">Measured {when(q.data.measured_at)}</p>}
    </Section>
  );
}

interface Project {
  id: string;
  title: string;
  organisation: string;
  status: string;
  contract_id: string | null;
  task_count: number;
  created_at: string;
}
const STATUSES = ["CREATED", "PLANNING", "ACTIVE", "REVIEW", "COMPLETED", "CANCELLED"];

export function ProjectPortfolio({ writable }: { writable: boolean }) {
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [skip, setSkip] = useState(0);
  const [change, setChange] = useState<{ project: Project; status: string } | null>(null);
  const params = new URLSearchParams({ query, skip: String(skip), limit: "30" });
  if (status) params.set("project_status", status);
  const q = useLoad<Project[]>(`/admin/operations/projects?${params}`);
  return (
    <Section
      title="Project portfolio"
      action={
        <button className="btn" onClick={q.reload}>
          Refresh
        </button>
      }
    >
      <p className="muted">
        Delivery across all organisations. Changes require an audit reason and the current project state.
      </p>
      <form
        className="row"
        style={{ gap: 8, flexWrap: "wrap", marginBottom: 16 }}
        onSubmit={(event) => {
          event.preventDefault();
          setQuery(search.trim());
          setSkip(0);
        }}
      >
        <input
          className="input"
          aria-label="Search projects"
          placeholder="Project title"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <select
          className="input"
          aria-label="Project status filter"
          value={status}
          onChange={(event) => {
            setStatus(event.target.value);
            setSkip(0);
          }}
        >
          <option value="">All statuses</option>
          {STATUSES.map((value) => (
            <option key={value}>{value}</option>
          ))}
        </select>
        <button className="btn">Search</button>
      </form>
      <State loading={q.loading && !q.data} error={q.error} empty={q.data?.length === 0} retry={q.reload} />
      {!!q.data?.length && (
        <div className="card" style={{ overflowX: "auto" }}>
          <table aria-label="Project portfolio">
            <thead>
              <tr>
                <th>Project</th>
                <th>Organisation</th>
                <th>Status</th>
                <th>Work items</th>
                <th>Created</th>
                <th>Manage</th>
              </tr>
            </thead>
            <tbody>
              {q.data.map((project) => (
                <tr key={project.id}>
                  <td>
                    {project.title}
                    {project.contract_id && <p className="muted">Linked contract</p>}
                  </td>
                  <td>{project.organisation}</td>
                  <td>
                    <span className="pill">{project.status}</span>
                  </td>
                  <td>{project.task_count}</td>
                  <td>{when(project.created_at)}</td>
                  <td>
                    <select
                      aria-label={`Change status for ${project.title}`}
                      className="input"
                      disabled={!writable || q.loading}
                      value={project.status}
                      onChange={(event) => setChange({ project, status: event.target.value })}
                    >
                      {STATUSES.map((value) => (
                        <option key={value}>{value}</option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="row" style={{ gap: 12, marginTop: 16 }}>
        <button className="btn" disabled={skip === 0 || q.loading} onClick={() => setSkip(Math.max(0, skip - 30))}>
          Previous
        </button>
        <span>{q.total ?? "—"} projects</span>
        <button className="btn" disabled={q.loading || skip + 30 >= (q.total ?? 0)} onClick={() => setSkip(skip + 30)}>
          Next
        </button>
      </div>
      {change && (
        <ReasonDialog
          title={`Change ${change.project.title} to ${change.status}`}
          confirmWord={change.status === "CANCELLED" ? change.project.title : undefined}
          danger={change.status === "CANCELLED"}
          onCancel={() => setChange(null)}
          onConfirm={async (reason) => {
            await api(`/admin/operations/projects/${change.project.id}/status`, {
              method: "PATCH",
              json: { status: change.status, expected_status: change.project.status, reason },
            });
            setChange(null);
            q.reload();
          }}
        />
      )}
    </Section>
  );
}
