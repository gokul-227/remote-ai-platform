import { useState } from "react";
import api, { extractErrorMessage } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { goRoute, useApi } from "./live";
import { ChannelView, Deliverables } from "./rap_collab";
import { Av, Btn, Card, Tabs, Tag } from "./rap_kit";

const WORKSPACE_TABS = ["Overview", "Members", "Resources", "Activity", "Settings"];
const PROJECT_STATUSES = ["CREATED", "PLANNING", "ACTIVE", "REVIEW", "COMPLETED", "CANCELLED"];
type Detail = {
  project: { id: string; title: string; description: string; status: string; created_at: string; company_id: string };
  milestones: { id: string; title: string; status: string; due_date?: string | null }[];
  tasks: { id: string; status: string; assignee_id?: string | null }[];
  member_ids: string[];
  people: Record<string, { full_name?: string; headline?: string | null }>;
};
type Activity = {
  id: string;
  actor_id: string | null;
  action: string;
  payload: Record<string, unknown>;
  created_at: string;
};

type Workspace = {
  contracts: {
    id: string;
    title: string;
    status: string;
    client_id: string;
    worker_id: string;
    milestones: { id: string; title: string; status: string }[];
  }[];
  documents: { id: string; title: string; kind: string }[];
  channels: Parameters<typeof ChannelView>[0]["channel"][];
  meetings: { id: string; title: string; starts_at: string; status: string }[];
  limits: Record<string, number>;
};

export function ProjectWorkspace({ projectId }: { projectId: string }) {
  const { user } = useAuth();
  const q = useApi<Workspace>(`/projects/${projectId}/workspace`);
  const detail = useApi<Detail>(`/projects/${projectId}`);
  const [tab, setTab] = useState(() => {
    const t = new URLSearchParams(window.location.hash.split("?")[1] || "").get("tab");
    return t && WORKSPACE_TABS.includes(t) ? t : "Overview";
  });
  const activity = useApi<Activity[]>(tab === "Activity" ? `/projects/${projectId}/activity` : null, { limit: 50 });
  const [statusBusy, setStatusBusy] = useState(false);
  const [statusMsg, setStatusMsg] = useState("");
  const changeStatus = async (status: string) => {
    setStatusBusy(true);
    setStatusMsg("");
    try {
      await api.patch(`/projects/${projectId}/status`, { status });
      detail.reload();
      setStatusMsg(`Project marked ${status.toLowerCase()}.`);
    } catch (error) {
      setStatusMsg(extractErrorMessage(error, "Could not change the project status."));
    } finally {
      setStatusBusy(false);
    }
  };
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [channelId, setChannelId] = useState<string | null>(null);
  const [contractId, setContractId] = useState<string | null>(null);
  const openDocument = (id: string) => {
    try {
      sessionStorage.setItem("rap-doc-id", id);
      goRoute("files");
    } catch {
      setMessage("Browser storage is unavailable. Open the document from Files.");
    }
  };
  const create = async (kind: "DOC" | "SHEET" | "SLIDE" | "CHANNEL") => {
    setBusy(true);
    setMessage("");
    try {
      if (kind === "CHANNEL") {
        const result = await api.post("/channels", {
          kind: "PROJECT",
          project_id: projectId,
          name: "Project discussion",
        });
        setChannelId(result.data.id);
        q.reload();
      } else {
        const result = await api.post("/documents", {
          kind,
          project_id: projectId,
          title: "Untitled project document",
        });
        openDocument(result.data.id);
      }
    } catch (error) {
      setMessage(extractErrorMessage(error, "Could not create the project resource."));
    } finally {
      setBusy(false);
    }
  };
  if (q.error)
    return (
      <div role="alert" className="mt-6">
        Could not load the workspace. <Btn onClick={q.reload}>Retry</Btn>
      </div>
    );
  if (!q.data)
    return (
      <p role="status" className="mt-6">
        Loading workspace…
      </p>
    );
  const data = q.data;
  const channel = data.channels.find((c) => c.id === channelId);
  const contract = data.contracts.find((c) => c.id === contractId);
  const dd = detail.data;
  const counts = (dd?.tasks ?? []).reduce<Record<string, number>>(
    (acc, t) => ({ ...acc, [t.status]: (acc[t.status] ?? 0) + 1 }),
    {},
  );
  const who = (id?: string | null) => (id && dd?.people[id]?.full_name) || "Someone";
  return (
    <div className="mt-6 space-y-5">
      <Tabs items={WORKSPACE_TABS} v={tab} set={setTab} />
      {tab === "Overview" && dd && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <h2 className="font-semibold">{dd.project.title}</h2>
            <p className="mt-1 text-sm text-slate-600 whitespace-pre-line">{dd.project.description}</p>
            <p className="mt-3 text-sm">
              <Tag>{dd.project.status}</Tag>{" "}
              <span className="text-slate-500">created {new Date(dd.project.created_at).toLocaleDateString()}</span>
            </p>
          </Card>
          <Card>
            <h2 className="font-semibold">Work</h2>
            <ul className="mt-2 text-sm text-slate-700">
              {["TODO", "IN_PROGRESS", "BLOCKED", "REVIEW", "COMPLETED"].map((s) => (
                <li key={s} className="flex justify-between py-1">
                  <span>{s.replace("_", " ").toLowerCase()}</span>
                  <b>{counts[s] ?? 0}</b>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-sm">
              {dd.member_ids.length} member{dd.member_ids.length === 1 ? "" : "s"} · {data.documents.length} documents ·{" "}
              {data.channels.length} discussions · {data.meetings.length} meetings
            </p>
          </Card>
          <Card>
            <h2 className="font-semibold">Milestones</h2>
            {!dd.milestones.length && <p className="text-sm text-slate-500">No milestones yet.</p>}
            {dd.milestones.map((m) => (
              <p key={m.id} className="flex justify-between py-1 text-sm">
                <span>{m.title}</span>
                <Tag>{m.status}</Tag>
              </p>
            ))}
          </Card>
        </div>
      )}
      {tab === "Members" && dd && (
        <Card>
          <h2 className="font-semibold">Members</h2>
          <p className="text-sm text-slate-500">
            People with access to this project. Membership is managed from the board’s Create menu and task assignment
            offers.
          </p>
          <ul className="mt-3 divide-y divide-slate-100">
            {dd.member_ids.map((id) => (
              <li key={id} className="flex items-center gap-3 py-2">
                <Av name={who(id)} s={32} />
                <span>
                  <b>{who(id)}</b>
                  {dd.people[id]?.headline && (
                    <span className="ml-2 text-sm text-slate-500">{dd.people[id].headline}</span>
                  )}
                </span>
                {id === user?.id && <Tag>you</Tag>}
              </li>
            ))}
          </ul>
        </Card>
      )}
      {tab === "Activity" && (
        <Card>
          <h2 className="font-semibold">Activity</h2>
          {activity.loading && !activity.data && <p className="text-sm text-slate-500">Loading…</p>}
          {activity.data?.length === 0 && <p className="text-sm text-slate-500">Nothing recorded yet.</p>}
          <ul className="mt-2 divide-y divide-slate-100 text-sm">
            {(activity.data ?? []).map((a) => (
              <li key={a.id} className="py-2">
                <span className="text-slate-500">{new Date(a.created_at).toLocaleString()}</span> ·{" "}
                <b>{who(a.actor_id)}</b> · {a.action.replace(/_/g, " ").toLowerCase()}
                {"status" in a.payload && (
                  <>
                    {" "}
                    → <Tag>{String(a.payload.status)}</Tag>
                  </>
                )}
                {"title" in a.payload && <> · {String(a.payload.title)}</>}
              </li>
            ))}
          </ul>
        </Card>
      )}
      {tab === "Settings" && dd && (
        <Card>
          <h2 className="font-semibold">Project settings</h2>
          <label className="mt-3 block text-sm font-semibold text-slate-700">
            Status
            <select
              className="mt-1 block rounded border border-slate-300 px-2 py-1 font-normal"
              value={dd.project.status}
              disabled={statusBusy}
              onChange={(e) => changeStatus(e.target.value)}
            >
              {PROJECT_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s.toLowerCase()}
                </option>
              ))}
            </select>
          </label>
          {statusMsg && (
            <p role="status" className="mt-2 text-sm">
              {statusMsg}
            </p>
          )}
          <p className="mt-3 text-xs text-slate-500">
            Status changes are recorded in Activity. Cancelling a project does not end its contracts.
          </p>
        </Card>
      )}
      {tab === "Resources" && (
        <>
          <p className="text-sm text-slate-500">
            Project documents, discussions and engagements. Only resources you can access are shown.
          </p>
          {message && <p role="alert">{message}</p>}
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <h2 className="font-semibold">Files and documents</h2>
              <div className="my-3 flex flex-wrap gap-2">
                <Btn disabled={busy} onClick={() => create("DOC")}>
                  New document
                </Btn>
                <Btn disabled={busy} onClick={() => create("SHEET")}>
                  New sheet
                </Btn>
                <Btn disabled={busy} onClick={() => create("SLIDE")}>
                  New slides
                </Btn>
              </div>
              {!data.documents.length && <p>No project documents yet.</p>}
              {data.documents.map((doc) => (
                <button className="block py-2 text-blue-700" key={doc.id} onClick={() => openDocument(doc.id)}>
                  {doc.title} · {doc.kind}
                </button>
              ))}
            </Card>
            <Card>
              <h2 className="font-semibold">Discussions</h2>
              <Btn disabled={busy} onClick={() => create("CHANNEL")}>
                New discussion
              </Btn>
              {!data.channels.length && <p>No project discussions yet.</p>}
              {data.channels.map((c) => (
                <button className="block py-2 text-blue-700" key={c.id} onClick={() => setChannelId(c.id)}>
                  # {c.name}
                </button>
              ))}
            </Card>
            <Card>
              <h2 className="font-semibold">Contracts and deliverables</h2>
              {!data.contracts.length && <p>No linked contracts visible to you.</p>}
              {data.contracts.map((c) => (
                <div key={c.id} className="py-2">
                  <button className="text-blue-700" onClick={() => setContractId(c.id)}>
                    {c.title} · {c.status}
                  </button>
                  <button className="ml-3 underline" onClick={() => goRoute(`contractsign/${c.id}`)}>
                    View contract
                  </button>
                </div>
              ))}
            </Card>
            <Card>
              <h2 className="font-semibold">Meetings</h2>
              {!data.meetings.length && <p>No linked meetings visible to you.</p>}
              {data.meetings.map((m) => (
                <p key={m.id} className="py-2">
                  {m.title} · {new Date(m.starts_at).toLocaleString()} · {m.status}
                </p>
              ))}
              <Btn onClick={() => goRoute("meetings")}>Manage meetings</Btn>
            </Card>
          </div>
          {channel && <ChannelView key={channel.id} channel={channel} onRead={q.reload} />}
          {contract && (
            <section aria-label={`Deliverables for ${contract.title}`}>
              <h2 className="font-semibold">{contract.title} — deliverables and reviews</h2>
              <Deliverables
                key={contract.id}
                contractId={contract.id}
                active={contract.status === "ACTIVE"}
                party={user?.id === contract.client_id ? "client" : user?.id === contract.worker_id ? "worker" : null}
                milestones={contract.milestones}
              />
            </section>
          )}
          <p className="text-xs text-slate-500">
            Showing up to {data.limits.documents} documents and {data.limits.contracts} contracts, discussions and
            meetings. Use the individual apps for older resources.
          </p>
        </>
      )}
    </div>
  );
}
