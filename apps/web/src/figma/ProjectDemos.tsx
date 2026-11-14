"use client";

import { useState } from "react";
import api, { extractErrorMessage } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { demoUrl } from "@/lib/demoUrl";
import { useApi } from "./live";

interface Contract {
  id: string;
  project_id: string | null;
  title: string;
  status: string;
  client_id: string;
  worker_id: string;
  client_signed_at: string | null;
  worker_signed_at: string | null;
  milestones: { id: string; title: string; status: string }[];
}
interface Demo {
  id: string;
  contract_id: string;
  milestone_id: string;
  title: string;
  version: number;
  status: string;
  environment: string | null;
  review_note: string | null;
}
const field = "rounded border border-slate-300 bg-white p-2 text-sm";
const button = "rounded border border-slate-300 px-3 py-2 text-sm disabled:opacity-50";

/** Can be mounted as a route or inside a project workspace. */
export function ProjectDemos({ projectId }: { projectId?: string }) {
  const { user } = useAuth();
  const q = useApi<Contract[]>("/contracts/me", { limit: 200 });
  const [selected, setSelected] = useState("");
  const contracts = (q.data ?? []).filter((c) => c.project_id && (!projectId || c.project_id === projectId));
  const current = contracts.find((c) => c.id === selected) ?? contracts[0];
  return (
    <section className="space-y-4 p-5" aria-label="Project demos">
      <h1 className="text-xl font-semibold">Project demos</h1>
      <p className="text-sm text-slate-600">Share a project preview, request changes, and accept the finished demo.</p>
      {q.loading && <p role="status">Loading engagements…</p>}
      {q.error != null ? (
        <p role="alert">{extractErrorMessage(q.error, "Could not load engagements.")}</p>
      ) : (
        <>
          {!q.loading && !contracts.length && (
            <p>No project engagements yet. Link a contract to a project to share demos.</p>
          )}
          {!!contracts.length && (
            <label className="flex flex-col gap-1">
              Engagement
              <select className={field} value={current?.id ?? ""} onChange={(e) => setSelected(e.target.value)}>
                {contracts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title} · {c.status}
                  </option>
                ))}
              </select>
            </label>
          )}
          {current && user && (
            <EngagementDemos key={`${user.id}:${current.id}`} contract={current} userId={user.id} reload={q.reload} />
          )}
        </>
      )}
    </section>
  );
}

function EngagementDemos({ contract, userId, reload }: { contract: Contract; userId: string; reload: () => void }) {
  const [offset, setOffset] = useState(0);
  const path = `/projects/${contract.project_id}/demos`;
  const q = useApi<Demo[]>(path, { limit: 50, offset });
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState<Demo | null>(null);
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [environment, setEnvironment] = useState("staging");
  const openMilestones = contract.milestones.filter((m) => ["PENDING", "IN_PROGRESS", "DELIVERED"].includes(m.status));
  const [milestone, setMilestone] = useState("");
  const worker = userId === contract.worker_id;
  const client = userId === contract.client_id;
  const active = contract.status === "ACTIVE";
  const act = async (action: () => Promise<unknown>, success: string) => {
    setBusy(true);
    setMessage("");
    try {
      await action();
      q.reload();
      reload();
      setMessage(success);
    } catch (error) {
      setMessage(extractErrorMessage(error, "The action could not be completed."));
    } finally {
      setBusy(false);
    }
  };
  const signable =
    ["DRAFT", "OFFERED", "SIGNED"].includes(contract.status) &&
    !(worker ? contract.worker_signed_at : contract.client_signed_at);
  return (
    <div className="space-y-4">
      <p>Contract: {contract.status}</p>
      {signable && (
        <button
          className={button}
          disabled={busy}
          onClick={() =>
            void act(
              () => api.post(`/contracts/${contract.id}/sign`),
              "Signature recorded. Both signatures activate the project workspace.",
            )
          }
        >
          Sign contract
        </button>
      )}
      {client && active && (
        <button
          className={button}
          disabled={busy}
          onClick={() =>
            void act(
              () => api.post(`/contracts/${contract.id}/complete`),
              "Contract completed. Payment status is unchanged.",
            )
          }
        >
          Complete engagement
        </button>
      )}
      {message && <p role="status">{message}</p>}
      {worker && active && openMilestones.length > 0 && (
        <form
          className="grid gap-3 rounded border p-4"
          onSubmit={(event) => {
            event.preventDefault();
            void act(async () => {
              await api.post(path, {
                contract_id: contract.id,
                milestone_id: revision?.milestone_id ?? (milestone || openMilestones[0].id),
                title: title.trim(),
                demo_url: url.trim(),
                environment: environment.trim(),
                supersedes_id: revision?.id ?? null,
              });
              setTitle("");
              setUrl("");
              setRevision(null);
            }, "Demo submitted for review.");
          }}
        >
          <h2 className="font-semibold">{revision ? `Revise ${revision.title}` : "Register demo"}</h2>
          {!revision && (
            <label className="grid gap-1">
              Milestone
              <select
                className={field}
                value={milestone || openMilestones[0].id}
                onChange={(e) => setMilestone(e.target.value)}
              >
                {openMilestones.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.title}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="grid gap-1">
            Demo title
            <input
              className={field}
              required
              maxLength={255}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>
          <label className="grid gap-1">
            HTTPS demo URL
            <input className={field} type="url" required value={url} onChange={(e) => setUrl(e.target.value)} />
          </label>
          <label className="grid gap-1">
            Environment
            <input
              className={field}
              maxLength={50}
              value={environment}
              onChange={(e) => setEnvironment(e.target.value)}
            />
          </label>
          <button className={button} disabled={busy || !title.trim() || !demoUrl(url)} type="submit">
            Submit demo
          </button>
          {revision && (
            <button className={button} type="button" onClick={() => setRevision(null)}>
              Cancel revision
            </button>
          )}
        </form>
      )}
      {q.loading && <p role="status">Loading demos…</p>}
      {q.error != null ? (
        <p role="alert">{extractErrorMessage(q.error, "Could not load demos.")}</p>
      ) : (
        <>
          {q.data?.length === 0 && <p>No demos on this page.</p>}
          {(q.data ?? [])
            .filter((d) => d.contract_id === contract.id)
            .map((demo) => (
              <DemoCard
                key={demo.id}
                demo={demo}
                path={path}
                worker={worker}
                client={client}
                active={active}
                busy={busy}
                act={act}
                revise={() => {
                  setRevision(demo);
                  setTitle(demo.title);
                  setUrl("");
                }}
              />
            ))}
          <div className="flex gap-2">
            <button
              className={button}
              disabled={offset === 0 || q.loading}
              onClick={() => setOffset(Math.max(0, offset - 50))}
            >
              Previous demos
            </button>
            <button
              className={button}
              disabled={q.data?.length !== 50 || q.loading}
              onClick={() => setOffset(offset + 50)}
            >
              Next demos
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function DemoCard({
  demo,
  path,
  worker,
  client,
  active,
  busy,
  act,
  revise,
}: {
  demo: Demo;
  path: string;
  worker: boolean;
  client: boolean;
  active: boolean;
  busy: boolean;
  act: (action: () => Promise<unknown>, success: string) => Promise<void>;
  revise: () => void;
}) {
  const [note, setNote] = useState("");
  const [link, setLink] = useState<string>();
  return (
    <article className="space-y-2 rounded border border-slate-200 p-4">
      <h2 className="font-semibold">
        {demo.title} · v{demo.version}
      </h2>
      <p>
        {demo.status}
        {demo.environment ? ` · ${demo.environment}` : ""}
      </p>
      {demo.review_note && <p>Review: {demo.review_note}</p>}
      {demo.status !== "WITHDRAWN" && (
        <button
          className={button}
          disabled={busy}
          onClick={() =>
            void act(async () => {
              setLink(undefined);
              const result = await api.get<{ url: string }>(`${path}/${demo.id}/view`);
              const safe = demoUrl(result.data.url);
              if (!safe) throw new Error("This demo URL cannot be opened safely.");
              setLink(safe);
            }, "Demo link authorized.")
          }
        >
          Prepare demo link
        </button>
      )}
      {link && demo.status !== "WITHDRAWN" && (
        <a className="block text-blue-700 underline" href={link} target="_blank" rel="noopener noreferrer">
          Open demo in new tab
        </a>
      )}
      {client && active && demo.status === "SUBMITTED" && (
        <div className="grid gap-2">
          <label className="grid gap-1">
            Review note
            <textarea className={field} maxLength={10000} value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
          <button
            className={button}
            disabled={busy}
            onClick={() =>
              void act(() => api.post(`${path}/${demo.id}/review`, { decision: "ACCEPTED", note }), "Demo accepted.")
            }
          >
            Accept demo
          </button>
          <button
            className={button}
            disabled={busy || !note.trim()}
            onClick={() =>
              void act(
                () => api.post(`${path}/${demo.id}/review`, { decision: "CHANGES_REQUESTED", note }),
                "Changes requested.",
              )
            }
          >
            Request changes
          </button>
        </div>
      )}
      {worker && active && demo.status === "CHANGES_REQUESTED" && (
        <button className={button} disabled={busy} onClick={revise}>
          Submit revision
        </button>
      )}
      {worker && active && demo.status === "SUBMITTED" && (
        <button
          className={button}
          disabled={busy}
          onClick={() => void act(() => api.post(`${path}/${demo.id}/withdraw`), "Demo withdrawn.")}
        >
          Withdraw demo
        </button>
      )}
    </article>
  );
}
