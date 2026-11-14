import { useRef, useState } from "react";
import api, { extractErrorMessage } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { timeAgo, useApi } from "./live";
import { Office } from "./rap_office";
import { Btn, Card, Ic, Modal, Notice, Tag, cx, inputCls } from "./rap_kit";

/*
 * Files: one place for every file the member can reach.
 * Live: /files (views, folders, upload, versions, shares, trash) and the native
 * Docs/Sheets/Slides editors (rap_office) under "Office".
 * Bytes are only ever fetched through short-lived signed URLs from the API.
 */

type Node = {
  id: string;
  parent_id: string | null;
  owner_id: string;
  project_id: string | null;
  company_id: string | null;
  kind: "folder" | "file";
  name: string;
  mime: string | null;
  size: number;
  current_version: number;
  trashed_at: string | null;
  updated_at: string;
  starred: boolean;
  role: string | null;
};
type Version = { version: number; size: number; mime: string; created_at: string };
type Share = {
  id: string;
  principal_type: string;
  principal_id: string | null;
  role: string;
  token: string | null;
  expires_at: string | null;
};
type Crumb = { id: string; name: string };

const VIEWS: { key: string; label: string; icon: string }[] = [
  { key: "mine", label: "My files", icon: "inbox" },
  { key: "shared", label: "Shared with me", icon: "users" },
  { key: "recent", label: "Recent", icon: "clock" },
  { key: "starred", label: "Starred", icon: "star" },
];
const TYPE_VIEWS: { key: string; label: string; icon: string }[] = [
  { key: "type:documents", label: "Documents", icon: "file" },
  { key: "type:spreadsheets", label: "Spreadsheets", icon: "grid" },
  { key: "type:presentations", label: "Presentations", icon: "layers" },
  { key: "type:images", label: "Images", icon: "image" },
  { key: "type:videos", label: "Videos", icon: "video" },
];
const OFFICE_VIEWS: { key: string; label: string; initial: "DOC" | "SHEET" | "SLIDES" }[] = [
  { key: "office:DOC", label: "Word documents", initial: "DOC" },
  { key: "office:SHEET", label: "Excel spreadsheets", initial: "SHEET" },
  { key: "office:SLIDES", label: "PowerPoint presentations", initial: "SLIDES" },
];

const fmtSize = (n: number) =>
  n < 1024 ? `${n} B` : n < 1024 ** 2 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1024 ** 2).toFixed(1)} MB`;
const iconFor = (n: Node) =>
  n.kind === "folder"
    ? "inbox"
    : n.mime?.startsWith("image/")
      ? "image"
      : n.mime?.startsWith("video/")
        ? "video"
        : n.mime?.includes("sheet") || n.mime === "text/csv"
          ? "grid"
          : n.mime?.includes("presentation")
            ? "layers"
            : "file";
const canEdit = (role: string | null) => role === "owner" || role === "editor";

function NavButton({
  k,
  label,
  icon,
  view,
  go,
}: {
  k: string;
  label: string;
  icon: string;
  view: string;
  go: (k: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => go(k)}
      aria-current={view === k ? "page" : undefined}
      className={cx(
        "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm",
        view === k ? "bg-[#E8F0FC] font-semibold text-[#0552CC]" : "text-slate-700 hover:bg-slate-100",
      )}
    >
      <Ic n={icon} s={16} />
      <span className="truncate">{label}</span>
    </button>
  );
}

export function Files() {
  const { user } = useAuth();
  const [view, setView] = useState(() => {
    const v = new URLSearchParams(window.location.hash.split("?")[1] || "").get("view");
    return v || "mine";
  });
  const [folder, setFolder] = useState<Crumb[]>([]);
  const [sort, setSort] = useState("name");
  const [q, setQ] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<Node | null>(null);
  const [details, setDetails] = useState<Node | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const office = OFFICE_VIEWS.find((o) => o.key === view);
  const current = folder[folder.length - 1] ?? null;
  const spaceView = view.startsWith("project:") || view.startsWith("organisation:");
  const listQ = useApi<Node[]>(
    user && !office ? "/files" : null,
    current ? { parent_id: current.id, sort } : { view, sort },
  );
  const quota = useApi<{ used_bytes: number; limit_bytes: number; max_upload_bytes: number }>(
    user ? "/files/quota" : null,
  );
  const projects = useApi<{ id: string; title: string }[]>(user ? "/projects" : null);
  const orgs = useApi<{ role: string; status: string; organisation: { id: string; name: string } }[]>(
    user ? "/organisations/memberships/me" : null,
  );

  if (!user)
    return (
      <div className="v2-page">
        <Card c="text-center">Sign in to use Files.</Card>
      </div>
    );

  const go = (v: string) => {
    setView(v);
    setFolder([]);
    setMsg("");
  };
  const reload = () => {
    listQ.reload();
    quota.reload();
  };
  const run = async (fn: () => Promise<unknown>, ok?: string) => {
    setBusy(true);
    setMsg("");
    try {
      await fn();
      if (ok) setMsg(ok);
      reload();
    } catch (e) {
      setMsg(extractErrorMessage(e, "That didn’t work. Please try again."));
    } finally {
      setBusy(false);
    }
  };
  // New items go into the open folder, else into the project/organisation space being viewed.
  const destination = (): Record<string, string> => {
    if (current) return { parent_id: current.id };
    if (view.startsWith("project:")) return { project_id: view.split(":")[1] };
    if (view.startsWith("organisation:")) return { company_id: view.split(":")[1] };
    return {};
  };
  const canCreateHere = view === "mine" || spaceView || !!current;

  const newFolder = () => {
    const name = window.prompt("Folder name");
    if (!name?.trim()) return;
    void run(() => api.post("/files/folders", { name: name.trim(), ...destination() }), "Folder created.");
  };
  const upload = (list: FileList | null) => {
    if (!list?.length) return;
    void run(
      async () => {
        for (const f of Array.from(list)) {
          const form = new FormData();
          form.append("file", f);
          Object.entries(destination()).forEach(([k, v]) => form.append(k, v));
          await api.post("/files/upload", form, {
            headers: { "Content-Type": "multipart/form-data" },
            timeout: 120_000,
          });
        }
      },
      `${list.length} file${list.length === 1 ? "" : "s"} uploaded.`,
    );
    if (fileInput.current) fileInput.current.value = "";
  };
  const download = (n: Node) =>
    run(async () => {
      const r = await api.get<{ url: string }>(`/files/${n.id}/download`);
      window.open(r.data.url, "_blank", "noopener,noreferrer");
    });
  const open = (n: Node) => {
    if (n.kind === "folder") {
      setFolder((f) => [...f, { id: n.id, name: n.name }]);
      return;
    }
    setPreview(n);
  };
  const rename = (n: Node) => {
    const name = window.prompt("New name", n.name);
    if (!name?.trim() || name.trim() === n.name) return;
    void run(() => api.patch(`/files/${n.id}`, { name: name.trim() }), "Renamed.");
  };

  const rows = (listQ.data ?? []).filter((n) => !q.trim() || n.name.toLowerCase().includes(q.trim().toLowerCase()));
  const title = office
    ? office.label
    : current
      ? current.name
      : ([...VIEWS, ...TYPE_VIEWS].find((v) => v.key === view)?.label ??
        (view === "trash"
          ? "Trash"
          : view.startsWith("project:")
            ? (projects.data ?? []).find((p) => `project:${p.id}` === view)?.title || "Project files"
            : (orgs.data ?? []).find((o) => `organisation:${o.organisation.id}` === view)?.organisation.name ||
              "Organisation files"));

  return (
    <div className="v2-page">
      <div className="grid gap-5 md:grid-cols-[230px_1fr]">
        <nav aria-label="Files navigation" className="space-y-4">
          <div className="space-y-1">
            {VIEWS.map((v) => (
              <NavButton view={view} go={go} key={v.key} k={v.key} label={v.label} icon={v.icon} />
            ))}
          </div>
          <div>
            <p className="px-3 text-xs font-semibold uppercase text-slate-500">Office</p>
            {OFFICE_VIEWS.map((v) => (
              <NavButton
                view={view}
                go={go}
                key={v.key}
                k={v.key}
                label={v.label}
                icon={v.initial === "DOC" ? "file" : v.initial === "SHEET" ? "grid" : "layers"}
              />
            ))}
          </div>
          <div>
            <p className="px-3 text-xs font-semibold uppercase text-slate-500">By type</p>
            {TYPE_VIEWS.map((v) => (
              <NavButton view={view} go={go} key={v.key} k={v.key} label={v.label} icon={v.icon} />
            ))}
          </div>
          {!!projects.data?.length && (
            <div>
              <p className="px-3 text-xs font-semibold uppercase text-slate-500">Project files</p>
              {projects.data.slice(0, 12).map((p) => (
                <NavButton view={view} go={go} key={p.id} k={`project:${p.id}`} label={p.title} icon="board" />
              ))}
            </div>
          )}
          {!!orgs.data?.filter((o) => o.status === "active").length && (
            <div>
              <p className="px-3 text-xs font-semibold uppercase text-slate-500">Organisation files</p>
              {orgs.data
                .filter((o) => o.status === "active")
                .map((o) => (
                  <NavButton
                    view={view}
                    go={go}
                    key={o.organisation.id}
                    k={`organisation:${o.organisation.id}`}
                    label={o.organisation.name}
                    icon="building"
                  />
                ))}
            </div>
          )}
          <NavButton view={view} go={go} k="trash" label="Trash" icon="trash" />
          {quota.data && (
            <div className="px-3 text-xs text-slate-500">
              <div className="mb-1 h-1.5 rounded bg-slate-200">
                <div
                  className="h-1.5 rounded bg-[#0552CC]"
                  style={{ width: `${Math.min(100, (quota.data.used_bytes / quota.data.limit_bytes) * 100)}%` }}
                />
              </div>
              {fmtSize(quota.data.used_bytes)} of {fmtSize(quota.data.limit_bytes)} used
            </div>
          )}
        </nav>

        <section aria-label={title}>
          {office ? (
            <Office key={office.initial} initial={office.initial} />
          ) : (
            <>
              <header className="mb-3 flex flex-wrap items-center gap-2">
                <nav
                  aria-label="Folder path"
                  className="flex flex-1 flex-wrap items-center gap-1 text-lg font-semibold"
                >
                  <button type="button" className={cx(folder.length && "text-[#0552CC]")} onClick={() => setFolder([])}>
                    {folder.length ? ([...VIEWS, ...TYPE_VIEWS].find((v) => v.key === view)?.label ?? "Files") : title}
                  </button>
                  {folder.map((c, i) => (
                    <span key={c.id} className="flex items-center gap-1">
                      <span className="text-slate-400">/</span>
                      <button
                        type="button"
                        className={cx(i < folder.length - 1 && "text-[#0552CC]")}
                        onClick={() => setFolder(folder.slice(0, i + 1))}
                      >
                        {c.name}
                      </button>
                    </span>
                  ))}
                </nav>
                {canCreateHere && view !== "trash" && (
                  <>
                    <Btn v="line" icon="plus" onClick={newFolder} disabled={busy}>
                      New folder
                    </Btn>
                    <Btn v="primary" icon="upload" onClick={() => fileInput.current?.click()} disabled={busy}>
                      Upload
                    </Btn>
                    <input
                      ref={fileInput}
                      type="file"
                      multiple
                      className="hidden"
                      aria-label="Upload files"
                      onChange={(e) => upload(e.target.files)}
                    />
                  </>
                )}
              </header>
              {msg && <Notice text={msg} onDismiss={() => setMsg("")} />}
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <label className="sr-only" htmlFor="files-search">
                  Filter by name
                </label>
                <input
                  id="files-search"
                  className={cx(inputCls, "max-w-xs")}
                  placeholder="Filter by name"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                />
                <label className="ml-auto flex items-center gap-2 text-sm text-slate-600">
                  Sort
                  <select
                    className="rounded border border-slate-300 px-2 py-1"
                    value={sort}
                    onChange={(e) => setSort(e.target.value)}
                  >
                    <option value="name">Name</option>
                    <option value="updated">Last modified</option>
                    <option value="size">Size</option>
                  </select>
                </label>
              </div>
              <Card p={false}>
                {!!listQ.error && !listQ.data ? (
                  <p role="alert" className="p-4 text-sm text-red-600">
                    Couldn’t load these files.{" "}
                    <button className="underline" onClick={listQ.reload}>
                      Retry
                    </button>
                  </p>
                ) : listQ.loading && !listQ.data ? (
                  <p className="p-4 text-sm text-slate-500">Loading…</p>
                ) : rows.length === 0 ? (
                  <p className="p-6 text-center text-sm text-slate-500">
                    {view === "trash"
                      ? "Trash is empty. Items stay here for 30 days."
                      : q
                        ? "Nothing matches that name."
                        : canCreateHere
                          ? "No files here yet. Upload a file or create a folder."
                          : "Nothing here yet."}
                  </p>
                ) : (
                  <ul className="divide-y divide-slate-100">
                    {rows.map((n) => (
                      <li key={n.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                        <button
                          type="button"
                          className="flex min-w-0 flex-1 items-center gap-3 text-left"
                          onClick={() => (view === "trash" ? undefined : open(n))}
                        >
                          <Ic n={iconFor(n)} s={20} c={n.kind === "folder" ? "text-amber-600" : "text-slate-500"} />
                          <span className="truncate font-medium">{n.name}</span>
                          {n.starred && <Ic n="star" s={14} c="text-amber-500" />}
                        </button>
                        <span className="w-24 text-right text-xs text-slate-500">
                          {n.kind === "file" ? fmtSize(n.size) : ""}
                        </span>
                        <span className="w-28 text-right text-xs text-slate-500">{timeAgo(n.updated_at)}</span>
                        <span className="flex gap-1">
                          {view === "trash" ? (
                            <>
                              <Btn
                                v="line"
                                onClick={() => run(() => api.post(`/files/${n.id}/restore`), "Restored.")}
                                disabled={busy}
                              >
                                Restore
                              </Btn>
                              <Btn
                                v="line"
                                onClick={() => {
                                  if (window.confirm(`Delete “${n.name}” for good? This cannot be undone.`))
                                    void run(() => api.delete(`/files/${n.id}/permanent`), "Deleted permanently.");
                                }}
                                disabled={busy}
                              >
                                Delete forever
                              </Btn>
                            </>
                          ) : (
                            <>
                              {n.kind === "file" && (
                                <button
                                  type="button"
                                  aria-label={`Download ${n.name}`}
                                  className="rounded p-1.5 hover:bg-slate-100"
                                  onClick={() => download(n)}
                                >
                                  <Ic n="download" s={16} />
                                </button>
                              )}
                              <button
                                type="button"
                                aria-label={n.starred ? `Unstar ${n.name}` : `Star ${n.name}`}
                                className="rounded p-1.5 hover:bg-slate-100"
                                onClick={() =>
                                  run(() =>
                                    n.starred ? api.delete(`/files/${n.id}/star`) : api.put(`/files/${n.id}/star`),
                                  )
                                }
                              >
                                <Ic n="star" s={16} c={n.starred ? "text-amber-500" : ""} />
                              </button>
                              {canEdit(n.role ?? (view === "mine" ? "owner" : null)) && (
                                <>
                                  <button
                                    type="button"
                                    aria-label={`Rename ${n.name}`}
                                    className="rounded p-1.5 hover:bg-slate-100"
                                    onClick={() => rename(n)}
                                  >
                                    <Ic n="edit" s={16} />
                                  </button>
                                  <button
                                    type="button"
                                    aria-label={`Move ${n.name} to trash`}
                                    className="rounded p-1.5 hover:bg-slate-100"
                                    onClick={() =>
                                      run(
                                        () => api.delete(`/files/${n.id}`),
                                        "Moved to trash. Restore it from Trash within 30 days.",
                                      )
                                    }
                                  >
                                    <Ic n="trash" s={16} />
                                  </button>
                                </>
                              )}
                              <button
                                type="button"
                                aria-label={`Details for ${n.name}`}
                                className="rounded p-1.5 hover:bg-slate-100"
                                onClick={() => setDetails(n)}
                              >
                                <Ic n="more" s={16} />
                              </button>
                            </>
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
              <p className="mt-2 text-xs text-slate-500">
                Files are private unless you share them. Uploads up to{" "}
                {quota.data ? fmtSize(quota.data.max_upload_bytes) : "25 MB"}; executables and macro-enabled Office
                files are not accepted.
              </p>
            </>
          )}
        </section>
      </div>
      {preview && <Preview node={preview} onClose={() => setPreview(null)} onDownload={() => download(preview)} />}
      {details && <Details node={details} onClose={() => setDetails(null)} onChanged={reload} />}
    </div>
  );
}

function Preview({ node, onClose, onDownload }: { node: Node; onClose: () => void; onDownload: () => void }) {
  const q = useApi<{
    kind: "url" | "text" | "none";
    mime: string;
    url?: string;
    text?: string;
    truncated?: boolean;
    reason?: string;
  }>(`/files/${node.id}/preview`);
  const d = q.data;
  return (
    <Modal open onClose={onClose} title={node.name}>
      {q.error ? (
        <p role="alert" className="text-sm text-red-600">
          Couldn’t load the preview.
        </p>
      ) : !d ? (
        <p className="text-sm text-slate-500">Loading preview…</p>
      ) : d.kind === "text" ? (
        <>
          <pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap rounded bg-slate-50 p-3 text-xs">{d.text}</pre>
          {d.truncated && (
            <p className="mt-1 text-xs text-slate-500">Showing the first 200 KB. Download for the full file.</p>
          )}
        </>
      ) : d.kind === "url" && d.url ? (
        d.mime.startsWith("image/") ? (
          <img src={d.url} alt={node.name} className="max-h-[65vh] w-full object-contain" />
        ) : d.mime.startsWith("video/") ? (
          <video src={d.url} controls className="max-h-[65vh] w-full" />
        ) : (
          <iframe title={`Preview of ${node.name}`} src={d.url} sandbox="" className="h-[65vh] w-full rounded border" />
        )
      ) : (
        <p className="text-sm text-slate-600">{d.reason ?? "Preview is not available for this file type."}</p>
      )}
      <div className="mt-4 flex justify-end gap-2">
        <Btn v="line" onClick={onClose}>
          Close
        </Btn>
        <Btn v="primary" icon="download" onClick={onDownload}>
          Download
        </Btn>
      </div>
    </Modal>
  );
}

function Details({ node, onClose, onChanged }: { node: Node; onClose: () => void; onChanged: () => void }) {
  const versions = useApi<Version[]>(node.kind === "file" ? `/files/${node.id}/versions` : null);
  const editable = canEdit(node.role ?? "owner");
  const shares = useApi<Share[]>(editable ? `/files/${node.id}/shares` : null);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("viewer");
  const [msg, setMsg] = useState("");
  const newVersion = useRef<HTMLInputElement>(null);
  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setMsg("");
    try {
      await fn();
      setMsg(ok);
      versions.reload();
      shares.reload();
      onChanged();
    } catch (e) {
      setMsg(extractErrorMessage(e, "That didn’t work."));
    }
  };
  const linkUrl = (token: string) => `${window.location.origin}/#sharedfile/${token}`;
  return (
    <Modal open onClose={onClose} title={node.name}>
      <p className="text-sm text-slate-600">
        {node.kind === "file" ? `${fmtSize(node.size)} · version ${node.current_version}` : "Folder"} · your access:{" "}
        <Tag>{node.role ?? "owner"}</Tag>
      </p>
      {node.kind === "file" && (
        <section className="mt-4">
          <h3 className="font-semibold">Version history</h3>
          <ul className="mt-1 max-h-40 divide-y divide-slate-100 overflow-auto text-sm">
            {(versions.data ?? []).map((v) => (
              <li key={v.version} className="flex items-center justify-between py-1.5">
                <span>
                  v{v.version} · {fmtSize(v.size)} · {timeAgo(v.created_at)}
                </span>
                {editable && v.version !== node.current_version && (
                  <button
                    type="button"
                    className="text-[#0552CC]"
                    onClick={() =>
                      run(
                        () => api.post(`/files/${node.id}/versions/${v.version}/restore`),
                        `Restored version ${v.version} as a new version.`,
                      )
                    }
                  >
                    Restore
                  </button>
                )}
              </li>
            ))}
          </ul>
          {editable && (
            <>
              <Btn v="line" icon="upload" c="mt-2" onClick={() => newVersion.current?.click()}>
                Upload new version
              </Btn>
              <input
                ref={newVersion}
                type="file"
                className="hidden"
                aria-label="Upload a new version"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  const form = new FormData();
                  form.append("file", f);
                  void run(
                    () =>
                      api.post(`/files/${node.id}/content`, form, {
                        headers: { "Content-Type": "multipart/form-data" },
                        timeout: 120_000,
                      }),
                    "New version uploaded.",
                  );
                }}
              />
            </>
          )}
        </section>
      )}
      {editable && (
        <section className="mt-5">
          <h3 className="font-semibold">Sharing</h3>
          <p className="text-xs text-slate-500">Access given to a folder applies to everything inside it.</p>
          <ul className="mt-2 divide-y divide-slate-100 text-sm">
            {(shares.data ?? []).map((s) => (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
                <span>
                  {s.principal_type === "link" ? (
                    <>
                      Anyone with the link · <Tag>viewer</Tag>{" "}
                      <button
                        type="button"
                        className="text-[#0552CC]"
                        onClick={() => void navigator.clipboard?.writeText(linkUrl(s.token!))}
                      >
                        Copy link
                      </button>
                    </>
                  ) : (
                    <>
                      {s.principal_type} · <Tag>{s.role}</Tag>
                    </>
                  )}
                  {s.expires_at && (
                    <span className="ml-2 text-xs text-slate-500">
                      expires {new Date(s.expires_at).toLocaleDateString()}
                    </span>
                  )}
                </span>
                <button
                  type="button"
                  className="text-red-600"
                  onClick={() => run(() => api.delete(`/files/${node.id}/shares/${s.id}`), "Access removed.")}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
          <div className="mt-2 flex flex-wrap gap-2">
            <input
              className={cx(inputCls, "min-w-0 flex-1")}
              placeholder="Email of an existing member"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-label="Share with email"
            />
            <select
              className="rounded border border-slate-300 px-2"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              aria-label="Access level"
            >
              <option value="viewer">Viewer</option>
              <option value="commenter">Commenter</option>
              <option value="editor">Editor</option>
            </select>
            <Btn
              v="primary"
              disabled={!email.trim()}
              onClick={() =>
                run(async () => {
                  await api.post(`/files/${node.id}/shares`, { principal_type: "user", email: email.trim(), role });
                  setEmail("");
                }, "Shared.")
              }
            >
              Share
            </Btn>
          </div>
          {node.kind === "file" && (
            <Btn
              v="line"
              c="mt-2"
              onClick={() =>
                run(
                  () =>
                    api.post(`/files/${node.id}/shares`, {
                      principal_type: "link",
                      role: "viewer",
                      expires_in_days: 30,
                    }),
                  "View-only link created (expires in 30 days).",
                )
              }
            >
              Create view-only link
            </Btn>
          )}
        </section>
      )}
      {msg && (
        <p role="status" className="mt-3 text-sm">
          {msg}
        </p>
      )}
    </Modal>
  );
}

/** Opened from a share link: shows the file and a download button without signing in. */
export function SharedFile({ token }: { token: string | null }) {
  const q = useApi<{ name: string; kind: string; mime: string | null; size: number; download_url: string | null }>(
    token ? `/files/shared/${encodeURIComponent(token)}` : null,
  );
  return (
    <div className="v2-page">
      <Card c="mx-auto max-w-lg text-center">
        {!token || q.error ? (
          <p role="alert">This link is invalid or has expired.</p>
        ) : !q.data ? (
          <p className="text-slate-500">Loading…</p>
        ) : (
          <>
            <h1 className="text-lg font-semibold">{q.data.name}</h1>
            <p className="text-sm text-slate-500">{fmtSize(q.data.size)}</p>
            {q.data.download_url && (
              <a
                className="mt-4 inline-block rounded-lg bg-[#0552CC] px-4 py-2 font-semibold text-white"
                href={q.data.download_url}
                rel="noopener noreferrer"
              >
                Download
              </a>
            )}
            <p className="mt-3 text-xs text-slate-500">
              The download link expires in a few minutes; reopen this page for a fresh one.
            </p>
          </>
        )}
      </Card>
    </div>
  );
}
