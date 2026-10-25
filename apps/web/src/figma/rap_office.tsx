import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Btn, Card, Field, Ic, Notice, Tag, cx, inputCls } from "./rap_kit";
import api, { extractErrorMessage } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { timeAgo, useApi } from "./live";
import { colName, evaluateAll, type Cells } from "./sheet_formula";

/* Built-in Docs, Sheets and Slides. Content is saved to the API with the
   version it was edited from (a 409 means someone else saved first), every
   save is a restorable version, and files import/export as .docx/.xlsx/.pptx
   in the browser — nothing is converted on a server. */

type Kind = "DOC" | "SHEET" | "SLIDES";
interface DocSummary {
  id: string;
  kind: Kind;
  title: string;
  owner_id: string;
  version: number;
  updated_at: string;
  my_role: "OWNER" | "EDIT" | "COMMENT" | "VIEW";
}
interface DocFull extends DocSummary {
  content: any;
}

const KIND_LABEL: Record<Kind, string> = { DOC: "Document", SHEET: "Spreadsheet", SLIDES: "Presentation" };
const KIND_ICON: Record<Kind, string> = { DOC: "file", SHEET: "grid", SLIDES: "layers" };
const KIND_TONE: Record<Kind, string> = { DOC: "blue", SHEET: "green", SLIDES: "amber" };

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* ---------------- Library ---------------- */

export function Office({ initial }: { initial?: Kind }) {
  const { user } = useAuth();
  const [tab, setTab] = useState<Kind | "ALL">(initial ?? "ALL");
  const [q, setQ] = useState("");
  const list = useApi<DocSummary[]>(user ? "/documents" : null, {
    ...(tab !== "ALL" ? { kind: tab } : {}),
    ...(q ? { q } : {}),
  });
  const [open, setOpen] = useState<string | null>(() => {
    try {
      return sessionStorage.getItem("rap-doc-id");
    } catch {
      return null;
    }
  });
  const [msg, setMsg] = useState("");
  const openDoc = (id: string | null) => {
    setOpen(id);
    try {
      if (id) sessionStorage.setItem("rap-doc-id", id);
      else sessionStorage.removeItem("rap-doc-id");
    } catch {
      /* storage unavailable */
    }
  };
  const create = async (kind: Kind) => {
    try {
      const r = await api.post<DocFull>("/documents", { kind, title: `Untitled ${KIND_LABEL[kind].toLowerCase()}` });
      openDoc(r.data.id);
    } catch (e) {
      setMsg(extractErrorMessage(e, "Couldn’t create the file."));
    }
  };
  if (!user)
    return (
      <div className="v2-page">
        <Card c="text-center">Sign in to use Docs, Sheets and Slides.</Card>
      </div>
    );
  if (open)
    return (
      <EditorShell
        id={open}
        onClose={() => {
          openDoc(null);
          list.reload();
        }}
      />
    );
  const rows = list.data ?? [];
  return (
    <div className="v2-page">
      <header className="v2-page-head">
        <div>
          <h1>Docs, Sheets &amp; Slides</h1>
          <p>Write, calculate and present together without leaving the platform.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {(["DOC", "SHEET", "SLIDES"] as Kind[]).map((k) => (
            <Btn key={k} icon="plus" v={k === "DOC" ? "primary" : "line"} onClick={() => create(k)}>
              New {KIND_LABEL[k].toLowerCase()}
            </Btn>
          ))}
        </div>
      </header>
      {msg && <Notice text={msg} onDismiss={() => setMsg("")} />}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {(["ALL", "DOC", "SHEET", "SLIDES"] as const).map((k) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={cx(
              "rounded-full px-3 py-1 text-sm font-semibold",
              tab === k ? "bg-[#E8F0FC] text-[#0552CC]" : "text-slate-600 hover:bg-slate-100",
            )}
          >
            {k === "ALL" ? "All files" : `${KIND_LABEL[k]}s`}
          </button>
        ))}
        <label className="sr-only" htmlFor="doc-search">
          Search files
        </label>
        <input
          id="doc-search"
          className={cx(inputCls, "ml-auto max-w-xs")}
          placeholder="Search by title"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>
      <Card p={false}>
        {!!list.error && !list.data ? (
          <p className="p-4 text-sm text-red-600">Couldn’t load your files.</p>
        ) : list.loading && !list.data ? (
          <p className="p-4 text-sm text-slate-500">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="p-6 text-center text-sm text-slate-500">No files yet. Create one above.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="p-3">Name</th>
                <th className="p-3">Type</th>
                <th className="p-3">Access</th>
                <th className="p-3">Updated</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((d) => (
                <tr
                  key={d.id}
                  className="cursor-pointer border-b border-slate-100 hover:bg-slate-50"
                  onClick={() => openDoc(d.id)}
                >
                  <td className="p-3 font-semibold">
                    <span className="inline-flex items-center gap-2">
                      <Ic n={KIND_ICON[d.kind]} s={16} /> {d.title}
                    </span>
                  </td>
                  <td className="p-3">
                    <Tag t={KIND_TONE[d.kind]}>{KIND_LABEL[d.kind]}</Tag>
                  </td>
                  <td className="p-3 text-slate-600">{d.my_role === "OWNER" ? "Owner" : d.my_role.toLowerCase()}</td>
                  <td className="p-3 text-slate-500">{timeAgo(d.updated_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}

/* ---------------- Shared editor shell: title, save, versions, sharing, comments ---------------- */

function EditorShell({ id, onClose }: { id: string; onClose: () => void }) {
  const q = useApi<DocFull>(`/documents/${id}`);
  if (!!q.error && !q.data)
    return (
      <div className="v2-page">
        <Card>
          <p className="text-sm text-red-600">This file isn’t available.</p>
          <Btn c="mt-3" v="line" onClick={onClose}>
            Back to files
          </Btn>
        </Card>
      </div>
    );
  if (!q.data) return <p className="p-8 text-slate-500">Opening…</p>;
  return <LoadedEditor key={q.data.id} initial={q.data} onClose={onClose} />;
}

function LoadedEditor({ initial, onClose }: { initial: DocFull; onClose: () => void }) {
  const [doc, setDoc] = useState<DocFull>(initial);
  const [dirty, setDirty] = useState(false);
  const [status, setStatus] = useState("");
  const [panel, setPanel] = useState<"" | "versions" | "share" | "comments">("");
  const latest = useRef<{ title: string; content: any }>({ title: initial.title, content: initial.content });
  const canEdit = ["OWNER", "EDIT"].includes(doc.my_role);
  const save = useCallback(async () => {
    if (!canEdit) return;
    setStatus("Saving…");
    try {
      const r = await api.put<DocFull>(`/documents/${doc.id}`, { expected_version: doc.version, ...latest.current });
      setDoc(r.data);
      setDirty(false);
      setStatus("All changes saved");
    } catch (e) {
      setStatus(extractErrorMessage(e, "Not saved. Try again."));
    }
  }, [doc.id, doc.version, canEdit]);
  // Autosave 2 s after the last change.
  useEffect(() => {
    if (!dirty) return;
    const t = window.setTimeout(save, 2000);
    return () => window.clearTimeout(t);
  }, [dirty, save, doc?.version]);
  const change = (patch: Partial<{ title: string; content: any }>) => {
    latest.current = { ...latest.current, ...patch };
    setDirty(true);
    setStatus("Unsaved changes");
  };
  return (
    <div className="v2-page">
      <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-2">
        <Btn sm v="ghost" onClick={onClose}>
          Files
        </Btn>
        <Ic n={KIND_ICON[doc.kind]} s={18} />
        <label className="sr-only" htmlFor="doc-title">
          Title
        </label>
        <input
          id="doc-title"
          className="min-w-0 flex-1 rounded px-2 py-1 text-lg font-bold hover:bg-slate-50 focus:bg-white"
          defaultValue={doc.title}
          readOnly={!canEdit}
          maxLength={255}
          onChange={(e) => change({ title: e.target.value || "Untitled" })}
        />
        <span className="text-xs text-slate-500" aria-live="polite">
          {status || `Version ${doc.version}`}
        </span>
        {canEdit && (
          <Btn sm onClick={save}>
            Save
          </Btn>
        )}
        <Btn
          sm
          v={panel === "comments" ? "outline" : "ghost"}
          onClick={() => setPanel(panel === "comments" ? "" : "comments")}
        >
          Comments
        </Btn>
        <Btn
          sm
          v={panel === "versions" ? "outline" : "ghost"}
          onClick={() => setPanel(panel === "versions" ? "" : "versions")}
        >
          History
        </Btn>
        {doc.my_role === "OWNER" && (
          <Btn
            sm
            v={panel === "share" ? "outline" : "ghost"}
            onClick={() => setPanel(panel === "share" ? "" : "share")}
          >
            Share
          </Btn>
        )}
      </div>
      {!canEdit && (
        <p className="mb-2 rounded-lg bg-amber-50 p-2 text-sm text-amber-800">
          You have {doc.my_role.toLowerCase()} access. Changes can’t be saved.
        </p>
      )}
      <div className={cx("grid gap-3", panel && "lg:grid-cols-[1fr_320px]")}>
        <div className="min-w-0">
          {doc.kind === "DOC" && <DocEditor doc={doc} editable={canEdit} onChange={(content) => change({ content })} />}
          {doc.kind === "SHEET" && (
            <SheetEditor doc={doc} editable={canEdit} onChange={(content) => change({ content })} />
          )}
          {doc.kind === "SLIDES" && (
            <SlidesEditor doc={doc} editable={canEdit} onChange={(content) => change({ content })} />
          )}
        </div>
        {panel === "versions" && (
          <VersionsPanel
            id={doc.id}
            canRestore={canEdit}
            onRestored={(d) => {
              setDoc(d);
              latest.current = { title: d.title, content: d.content };
            }}
          />
        )}
        {panel === "share" && <SharePanel id={doc.id} />}
        {panel === "comments" && <CommentsPanel id={doc.id} canComment={doc.my_role !== "VIEW"} />}
      </div>
    </div>
  );
}

function Side({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card c="h-fit">
      <h3 className="mb-2 font-bold">{title}</h3>
      {children}
    </Card>
  );
}

function VersionsPanel({
  id,
  canRestore,
  onRestored,
}: {
  id: string;
  canRestore: boolean;
  onRestored: (d: DocFull) => void;
}) {
  const q = useApi<{ version: number; author: string | null; created_at: string }[]>(`/documents/${id}/versions`);
  return (
    <Side title="Version history">
      <ul className="grid max-h-[60vh] gap-1 overflow-y-auto text-sm">
        {(q.data ?? []).map((v, i) => (
          <li key={v.version} className="flex items-center justify-between rounded p-1 hover:bg-slate-50">
            <span>
              v{v.version} · {v.author || "Someone"}
              <span className="block text-xs text-slate-500">{timeAgo(v.created_at)}</span>
            </span>
            {canRestore && i > 0 && (
              <button
                className="text-xs text-[#0552CC] underline"
                onClick={async () => {
                  const r = await api.post<DocFull>(`/documents/${id}/versions/${v.version}/restore`);
                  onRestored(r.data);
                  q.reload();
                }}
              >
                Restore
              </button>
            )}
          </li>
        ))}
      </ul>
    </Side>
  );
}

function SharePanel({ id }: { id: string }) {
  const { user } = useAuth();
  const shares = useApi<{ user_id: string; full_name: string | null; role: string }[]>(`/documents/${id}/shares`);
  const conns = useApi<any[]>("/connections", { status: "ACCEPTED", limit: 200 });
  const [who, setWho] = useState("");
  const [role, setRole] = useState("EDIT");
  const [err, setErr] = useState("");
  const people = (conns.data ?? []).map((c) => (c.sender_id === user?.id ? c.receiver : c.sender)).filter(Boolean);
  return (
    <Side title="Share">
      <div className="grid gap-2">
        <Field label="Person">
          <select className={inputCls} value={who} onChange={(e) => setWho(e.target.value)}>
            <option value="">Choose a connection…</option>
            {people.map((p: any) => (
              <option key={p.id} value={p.id}>
                {p.full_name || "Member"}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Access">
          <select className={inputCls} value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="EDIT">Can edit</option>
            <option value="COMMENT">Can comment</option>
            <option value="VIEW">Can view</option>
          </select>
        </Field>
        <Btn
          sm
          onClick={async () => {
            if (!who) return;
            try {
              await api.post(`/documents/${id}/shares`, { user_id: who, role });
              setErr("");
              shares.reload();
            } catch (e) {
              setErr(extractErrorMessage(e, "Couldn’t share."));
            }
          }}
        >
          Share
        </Btn>
        {err && <p className="text-xs text-red-600">{err}</p>}
        <ul className="mt-2 grid gap-1 text-sm">
          {(shares.data ?? []).map((s) => (
            <li key={s.user_id} className="flex items-center justify-between">
              <span>
                {s.full_name || "Member"} <span className="text-xs text-slate-500">({s.role.toLowerCase()})</span>
              </span>
              <button
                className="text-xs text-red-600 underline"
                onClick={async () => {
                  await api.delete(`/documents/${id}/shares/${s.user_id}`);
                  shares.reload();
                }}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      </div>
    </Side>
  );
}

function CommentsPanel({ id, canComment }: { id: string; canComment: boolean }) {
  const q = useApi<
    { id: string; author: string | null; anchor: string | null; body: string; resolved: boolean; created_at: string }[]
  >(`/documents/${id}/comments`);
  const [body, setBody] = useState("");
  const [anchor, setAnchor] = useState("");
  return (
    <Side title="Comments">
      <ul className="grid max-h-[45vh] gap-2 overflow-y-auto text-sm">
        {(q.data ?? []).map((c) => (
          <li key={c.id} className={cx("rounded-lg p-2", c.resolved ? "bg-slate-50 text-slate-400" : "bg-[#E8F0FC]")}>
            <p className="text-xs text-slate-500">
              {c.author || "Someone"} · {timeAgo(c.created_at)} {c.anchor && <>· on “{c.anchor}”</>}
            </p>
            <p className="whitespace-pre-line">{c.body}</p>
            {!c.resolved && canComment && (
              <button
                className="text-xs text-[#0552CC] underline"
                onClick={async () => {
                  await api.post(`/documents/${id}/comments/${c.id}/resolve`);
                  q.reload();
                }}
              >
                Resolve
              </button>
            )}
          </li>
        ))}
        {q.data?.length === 0 && <li className="text-slate-500">No comments yet.</li>}
      </ul>
      {canComment && (
        <form
          className="mt-2 grid gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!body.trim()) return;
            await api.post(`/documents/${id}/comments`, { body, anchor: anchor || null });
            setBody("");
            setAnchor("");
            q.reload();
          }}
        >
          <label className="sr-only" htmlFor="c-anchor">
            About (optional)
          </label>
          <input
            id="c-anchor"
            className={inputCls}
            placeholder="About: e.g. B4, slide 2, a phrase"
            value={anchor}
            onChange={(e) => setAnchor(e.target.value)}
          />
          <label className="sr-only" htmlFor="c-body">
            Comment
          </label>
          <textarea
            id="c-body"
            className={cx(inputCls, "h-20 py-2")}
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
          <Btn sm>Comment</Btn>
        </form>
      )}
    </Side>
  );
}

/* ---------------- Docs ---------------- */

function ToolButton({
  label,
  icon,
  on,
  active,
  editable,
}: {
  label: string;
  icon?: string;
  on: () => void;
  active?: boolean;
  editable: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={!!active}
      disabled={!editable}
      onClick={on}
      className={cx(
        "rounded px-2 py-1 text-sm font-semibold hover:bg-slate-100 disabled:opacity-40",
        active && "bg-[#E8F0FC] text-[#0552CC]",
      )}
    >
      {icon ? <Ic n={icon} s={14} /> : label}
    </button>
  );
}

function DocEditor({ doc, editable, onChange }: { doc: DocFull; editable: boolean; onChange: (c: any) => void }) {
  const editor = useEditor({
    extensions: [StarterKit],
    content: doc.content,
    editable,
    immediatelyRender: false,
    onUpdate: ({ editor }) => onChange(editor.getJSON()),
    editorProps: { attributes: { class: "rap-doc min-h-[60vh] p-8 outline-none", "aria-label": "Document body" } },
  });
  const fileRef = useRef<HTMLInputElement>(null);
  const importDocx = async (file: File) => {
    const mammoth = await import("mammoth");
    const { value } = await mammoth.convertToHtml({ arrayBuffer: await file.arrayBuffer() });
    editor?.commands.setContent(value);
    onChange(editor?.getJSON());
  };
  const exportDocx = async () => {
    if (!editor) return;
    const d = await import("docx");
    const paras: InstanceType<typeof d.Paragraph>[] = [];
    const runs = (node: any) =>
      (node.content ?? []).map(
        (t: any) =>
          new d.TextRun({
            text: t.text ?? "",
            bold: t.marks?.some((m: any) => m.type === "bold"),
            italics: t.marks?.some((m: any) => m.type === "italic"),
            strike: t.marks?.some((m: any) => m.type === "strike"),
          }),
      );
    const walk = (node: any, bullet?: "bullet" | "number") => {
      if (node.type === "heading")
        paras.push(
          new d.Paragraph({
            children: runs(node),
            heading: [d.HeadingLevel.HEADING_1, d.HeadingLevel.HEADING_2, d.HeadingLevel.HEADING_3][
              Math.min((node.attrs?.level ?? 1) - 1, 2)
            ],
          }),
        );
      else if (node.type === "paragraph")
        paras.push(new d.Paragraph({ children: runs(node), ...(bullet === "bullet" ? { bullet: { level: 0 } } : {}) }));
      else if (node.type === "bulletList" || node.type === "orderedList")
        node.content?.forEach((li: any) =>
          li.content?.forEach((c: any) => walk(c, node.type === "bulletList" ? "bullet" : "number")),
        );
      else if (node.type === "codeBlock" || node.type === "blockquote")
        node.content?.forEach((c: any) => (c.type ? walk(c) : null)) ?? null;
      else node.content?.forEach((c: any) => walk(c, bullet));
      if (node.type === "codeBlock")
        paras.push(
          new d.Paragraph({
            children: [
              new d.TextRun({ text: (node.content ?? []).map((t: any) => t.text).join(""), font: "Courier New" }),
            ],
          }),
        );
    };
    walk(editor.getJSON());
    download(await d.Packer.toBlob(new d.Document({ sections: [{ children: paras }] })), `${doc.title}.docx`);
  };
  if (!editor) return <p className="p-4 text-slate-500">Loading editor…</p>;
  return (
    <Card p={false}>
      <div
        className="sticky top-0 z-10 flex flex-wrap items-center gap-1 border-b border-slate-200 bg-white p-2"
        role="toolbar"
        aria-label="Formatting"
      >
        <ToolButton editable={editable} label="Undo" on={() => editor.chain().focus().undo().run()} />
        <ToolButton editable={editable} label="Redo" on={() => editor.chain().focus().redo().run()} />
        <span className="mx-1 h-5 w-px bg-slate-200" />
        <ToolButton
          editable={editable}
          label="H1"
          on={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
          active={editor.isActive("heading", { level: 1 })}
        />
        <ToolButton
          editable={editable}
          label="H2"
          on={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          active={editor.isActive("heading", { level: 2 })}
        />
        <ToolButton
          editable={editable}
          label="H3"
          on={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          active={editor.isActive("heading", { level: 3 })}
        />
        <span className="mx-1 h-5 w-px bg-slate-200" />
        <ToolButton
          editable={editable}
          label="B"
          on={() => editor.chain().focus().toggleBold().run()}
          active={editor.isActive("bold")}
        />
        <ToolButton
          editable={editable}
          label="I"
          on={() => editor.chain().focus().toggleItalic().run()}
          active={editor.isActive("italic")}
        />
        <ToolButton
          editable={editable}
          label="S"
          on={() => editor.chain().focus().toggleStrike().run()}
          active={editor.isActive("strike")}
        />
        <ToolButton
          editable={editable}
          label="Code"
          on={() => editor.chain().focus().toggleCode().run()}
          active={editor.isActive("code")}
        />
        <span className="mx-1 h-5 w-px bg-slate-200" />
        <ToolButton
          editable={editable}
          label="• List"
          on={() => editor.chain().focus().toggleBulletList().run()}
          active={editor.isActive("bulletList")}
        />
        <ToolButton
          editable={editable}
          label="1. List"
          on={() => editor.chain().focus().toggleOrderedList().run()}
          active={editor.isActive("orderedList")}
        />
        <ToolButton
          editable={editable}
          label="Quote"
          on={() => editor.chain().focus().toggleBlockquote().run()}
          active={editor.isActive("blockquote")}
        />
        <ToolButton
          editable={editable}
          label="Code block"
          on={() => editor.chain().focus().toggleCodeBlock().run()}
          active={editor.isActive("codeBlock")}
        />
        <ToolButton editable={editable} label="Divider" on={() => editor.chain().focus().setHorizontalRule().run()} />
        <span className="ml-auto flex gap-1">
          <Btn sm v="ghost" onClick={() => fileRef.current?.click()}>
            Import .docx
          </Btn>
          <Btn sm v="ghost" onClick={exportDocx}>
            Export .docx
          </Btn>
        </span>
        <input
          ref={fileRef}
          type="file"
          accept=".docx"
          className="hidden"
          aria-label="Import a Word document"
          onChange={(e) => e.target.files?.[0] && importDocx(e.target.files[0])}
        />
      </div>
      <div className="mx-auto max-w-4xl bg-white">
        <EditorContent editor={editor} />
      </div>
    </Card>
  );
}

/* ---------------- Sheets ---------------- */

const ROWS_SHOWN = 60;

function SheetEditor({ doc, editable, onChange }: { doc: DocFull; editable: boolean; onChange: (c: any) => void }) {
  const [cells, setCells] = useState<Cells>(() => ({ ...(doc.content?.cells ?? {}) }));
  const cols = Math.min(Number(doc.content?.cols ?? 26), 52);
  const [rows, setRows] = useState(Math.max(ROWS_SHOWN, Number(doc.content?.rows ?? 100)));
  const [sel, setSel] = useState("A1");
  const values = useMemo(() => evaluateAll(cells), [cells]);
  const fileRef = useRef<HTMLInputElement>(null);
  const set = (ref: string, raw: string) => {
    const next = { ...cells };
    if (raw === "") delete next[ref];
    else next[ref] = raw;
    setCells(next);
    onChange({ cells: next, cols, rows });
  };
  const move = (dc: number, dr: number) => {
    const m = /^([A-Z]+)(\d+)$/.exec(sel)!;
    const c = Math.max(0, Math.min(cols - 1, m[1].charCodeAt(0) - 65 + dc));
    const r = Math.max(1, Math.min(rows, Number(m[2]) + dr));
    setSel(`${colName(c)}${r}`);
  };
  const exportXlsx = async () => {
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Sheet1");
    for (const [ref, raw] of Object.entries(cells)) {
      const cell = ws.getCell(ref);
      if (raw.startsWith("="))
        cell.value = { formula: raw.slice(1), result: Number(values[ref]) || values[ref] } as any;
      else cell.value = raw !== "" && !Number.isNaN(Number(raw)) ? Number(raw) : raw;
    }
    download(new Blob([await wb.xlsx.writeBuffer()]), `${doc.title}.xlsx`);
  };
  const importXlsx = async (file: File) => {
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await file.arrayBuffer());
    const ws = wb.worksheets[0];
    const next: Cells = {};
    ws?.eachRow((row, r) =>
      row.eachCell((cell, c) => {
        if (c > cols || r > 5000) return;
        const v: any = cell.value;
        next[`${colName(c - 1)}${r}`] =
          v && typeof v === "object" && "formula" in v ? `=${v.formula}` : String(v?.text ?? v?.result ?? v ?? "");
      }),
    );
    setCells(next);
    setRows((n) => Math.max(n, ws?.rowCount ?? n));
    onChange({ cells: next, cols, rows: Math.max(rows, ws?.rowCount ?? rows) });
  };
  return (
    <Card p={false}>
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 p-2">
        <span className="w-14 rounded border border-slate-300 px-2 py-1 text-center font-mono text-sm">{sel}</span>
        <label className="sr-only" htmlFor="formula-bar">
          Cell contents
        </label>
        <input
          id="formula-bar"
          className={cx(inputCls, "flex-1 font-mono")}
          placeholder="Value or =SUM(A1:A5)"
          value={cells[sel] ?? ""}
          readOnly={!editable}
          onChange={(e) => set(sel, e.target.value)}
        />
        <Btn sm v="ghost" onClick={() => fileRef.current?.click()}>
          Import .xlsx
        </Btn>
        <Btn sm v="ghost" onClick={exportXlsx}>
          Export .xlsx
        </Btn>
        <input
          ref={fileRef}
          type="file"
          accept=".xlsx"
          className="hidden"
          aria-label="Import an Excel workbook"
          onChange={(e) => e.target.files?.[0] && importXlsx(e.target.files[0])}
        />
      </div>
      <div className="max-h-[65vh] overflow-auto" role="grid" aria-label="Spreadsheet">
        <table className="border-collapse text-sm">
          <thead className="sticky top-0 z-10 bg-slate-50">
            <tr>
              <th className="w-10 border border-slate-200" />
              {Array.from({ length: cols }, (_, c) => (
                <th key={c} className="min-w-[90px] border border-slate-200 px-1 text-xs font-semibold text-slate-500">
                  {colName(c)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: rows }, (_, r) => (
              <tr key={r}>
                <th className="sticky left-0 border border-slate-200 bg-slate-50 px-1 text-xs font-semibold text-slate-500">
                  {r + 1}
                </th>
                {Array.from({ length: cols }, (_, c) => {
                  const ref = `${colName(c)}${r + 1}`;
                  const v = values[ref] ?? "";
                  const isErr = v.startsWith("#");
                  return (
                    <td
                      key={ref}
                      role="gridcell"
                      aria-selected={sel === ref}
                      tabIndex={sel === ref ? 0 : -1}
                      onClick={() => setSel(ref)}
                      onKeyDown={(e) => {
                        if (e.key === "ArrowRight" || e.key === "Tab") (e.preventDefault(), move(1, 0));
                        else if (e.key === "ArrowLeft") (e.preventDefault(), move(-1, 0));
                        else if (e.key === "ArrowDown" || e.key === "Enter") (e.preventDefault(), move(0, 1));
                        else if (e.key === "ArrowUp") (e.preventDefault(), move(0, -1));
                        else if (e.key === "Delete" || e.key === "Backspace") editable && set(ref, "");
                      }}
                      className={cx(
                        "h-7 max-w-[220px] truncate border border-slate-200 px-1",
                        sel === ref && "outline outline-2 outline-[#0552CC]",
                        !Number.isNaN(Number(v)) && v !== "" ? "text-right" : "",
                        isErr && "text-red-600",
                      )}
                    >
                      {v}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between border-t border-slate-200 p-2 text-xs text-slate-500">
        <span>
          Functions: SUM, AVERAGE, MIN, MAX, COUNT, COUNTA, ROUND, ABS, IF, AND, OR, NOT, CONCAT, LEN, UPPER, LOWER
        </span>
        {editable && (
          <button className="text-[#0552CC] underline" onClick={() => setRows((n) => Math.min(n + 50, 5000))}>
            Add 50 rows
          </button>
        )}
      </div>
    </Card>
  );
}

/* ---------------- Slides ---------------- */

interface Slide {
  title: string;
  body: string;
  layout?: "title" | "bullets";
}

function SlidesEditor({ doc, editable, onChange }: { doc: DocFull; editable: boolean; onChange: (c: any) => void }) {
  const [slides, setSlides] = useState<Slide[]>(() =>
    doc.content?.slides?.length ? doc.content.slides : [{ title: "Title", body: "" }],
  );
  const [i, setI] = useState(0);
  const [presenting, setPresenting] = useState(false);
  const update = (next: Slide[]) => {
    setSlides(next);
    onChange({ slides: next });
  };
  const s = slides[Math.min(i, slides.length - 1)];
  const exportPptx = async () => {
    const PptxGen = (await import("pptxgenjs")).default;
    const pptx = new PptxGen();
    pptx.layout = "LAYOUT_WIDE";
    for (const sl of slides) {
      const page = pptx.addSlide();
      page.background = { color: "FFFFFF" };
      page.addShape("rect", { x: 0, y: 0, w: 13.33, h: 0.18, fill: { color: "0552CC" } });
      page.addText(sl.title || " ", { x: 0.6, y: 0.5, w: 12, h: 1, fontSize: 32, bold: true, color: "0B1220" });
      const lines = sl.body.split("\n").filter(Boolean);
      if (lines.length)
        page.addText(
          lines.map((t) => ({ text: t, options: { bullet: sl.layout !== "title" } })),
          { x: 0.8, y: 1.7, w: 11.6, h: 5, fontSize: 20, color: "334155", valign: "top" },
        );
    }
    await pptx.writeFile({ fileName: `${doc.title}.pptx` });
  };
  if (presenting) return <Presenter slides={slides} start={i} onExit={() => setPresenting(false)} />;
  return (
    <div className="grid gap-3 md:grid-cols-[200px_1fr]">
      <Card p="p-2" c="h-fit">
        <ol className="grid gap-2">
          {slides.map((sl, k) => (
            <li key={k}>
              <button
                onClick={() => setI(k)}
                className={cx(
                  "w-full rounded-lg border p-2 text-left text-xs",
                  k === i ? "border-[#0552CC] bg-[#E8F0FC]" : "border-slate-200",
                )}
              >
                <span className="text-slate-400">{k + 1}</span>{" "}
                <b className="block truncate">{sl.title || "Untitled"}</b>
              </button>
            </li>
          ))}
        </ol>
        {editable && (
          <div className="mt-2 grid gap-1">
            <Btn
              sm
              v="line"
              icon="plus"
              onClick={() => (
                update([...slides, { title: "New slide", body: "", layout: "bullets" }]),
                setI(slides.length)
              )}
            >
              Add slide
            </Btn>
            <Btn
              sm
              v="ghost"
              onClick={() =>
                i > 0 &&
                (update(slides.map((x, k) => (k === i - 1 ? slides[i] : k === i ? slides[i - 1] : x))), setI(i - 1))
              }
            >
              Move up
            </Btn>
            <Btn
              sm
              v="ghost"
              onClick={() => slides.length > 1 && (update(slides.filter((_, k) => k !== i)), setI(Math.max(0, i - 1)))}
            >
              Delete slide
            </Btn>
          </div>
        )}
      </Card>
      <div className="grid gap-2">
        <div className="flex flex-wrap gap-2">
          <Btn sm icon="play" onClick={() => setPresenting(true)}>
            Present
          </Btn>
          <Btn sm v="ghost" onClick={exportPptx}>
            Export .pptx
          </Btn>
          {editable && (
            <select
              aria-label="Slide layout"
              className="rounded border border-slate-300 px-2 text-sm"
              value={s.layout ?? "bullets"}
              onChange={(e) =>
                update(slides.map((x, k) => (k === i ? { ...x, layout: e.target.value as Slide["layout"] } : x)))
              }
            >
              <option value="bullets">Title and bullets</option>
              <option value="title">Title and text</option>
            </select>
          )}
        </div>
        <Card c="aspect-video overflow-hidden" p={false}>
          <div className="h-2 bg-[#0552CC]" />
          <div className="p-8">
            <label className="sr-only" htmlFor="slide-title">
              Slide title
            </label>
            <input
              id="slide-title"
              className="w-full text-3xl font-bold outline-none"
              value={s.title}
              readOnly={!editable}
              onChange={(e) => update(slides.map((x, k) => (k === i ? { ...x, title: e.target.value } : x)))}
            />
            <label className="sr-only" htmlFor="slide-body">
              Slide text, one point per line
            </label>
            <textarea
              id="slide-body"
              className="mt-4 h-64 w-full resize-none text-lg text-slate-700 outline-none"
              placeholder="One point per line"
              value={s.body}
              readOnly={!editable}
              onChange={(e) => update(slides.map((x, k) => (k === i ? { ...x, body: e.target.value } : x)))}
            />
          </div>
        </Card>
      </div>
    </div>
  );
}

function Presenter({ slides, start, onExit }: { slides: Slide[]; start: number; onExit: () => void }) {
  const [i, setI] = useState(start);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    box.current?.focus();
    box.current?.requestFullscreen?.().catch(() => undefined);
    return () => {
      if (document.fullscreenElement) document.exitFullscreen().catch(() => undefined);
    };
  }, []);
  const s = slides[i];
  return (
    <div
      ref={box}
      tabIndex={-1}
      role="dialog"
      aria-label="Presentation"
      className="fixed inset-0 z-[200] flex flex-col bg-white outline-none"
      onKeyDown={(e) => {
        if (["ArrowRight", " ", "PageDown"].includes(e.key)) setI((k) => Math.min(k + 1, slides.length - 1));
        if (["ArrowLeft", "PageUp"].includes(e.key)) setI((k) => Math.max(k - 1, 0));
        if (e.key === "Escape") onExit();
      }}
      onClick={() => setI((k) => Math.min(k + 1, slides.length - 1))}
    >
      <div className="h-3 bg-[#0552CC]" />
      <div className="flex-1 p-16">
        <h1 className="text-5xl font-bold">{s.title}</h1>
        {s.layout === "title" ? (
          <p className="mt-8 whitespace-pre-line text-2xl text-slate-700">{s.body}</p>
        ) : (
          <ul className="mt-8 list-disc space-y-3 pl-8 text-2xl text-slate-700">
            {s.body
              .split("\n")
              .filter(Boolean)
              .map((l, k) => (
                <li key={k}>{l}</li>
              ))}
          </ul>
        )}
      </div>
      <div className="flex items-center justify-between p-4 text-sm text-slate-500">
        <span>
          {i + 1} / {slides.length}
        </span>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onExit();
          }}
          className="underline"
        >
          Exit (Esc)
        </button>
      </div>
    </div>
  );
}
