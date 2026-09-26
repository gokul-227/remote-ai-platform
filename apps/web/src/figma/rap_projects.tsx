import { useState } from "react";
import api, { extractErrorMessage } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useApi, goRoute } from "./live";
import { Ic, Av, Btn, Card, Tag, Modal, Bar, cx, Field, inputCls } from "./rap_kit";

type Issue = { id: string; k: string; t: string; type: string; pri: string; as: string; asId: string | null; sp: number; st: string; raw: string; ep: string; d: string; updated: string; created: string; deadline?: string };
const COLS = [["todo", "TO DO"], ["prog", "IN PROGRESS"], ["rev", "IN REVIEW"], ["done", "DONE"]];
const COL_OF: Record<string, string> = { TODO: "todo", BLOCKED: "todo", IN_PROGRESS: "prog", REVIEW: "rev", COMPLETED: "done" };
const STATUS_OF: Record<string, string> = { todo: "TODO", prog: "IN_PROGRESS", rev: "REVIEW", done: "COMPLETED" };
const TC: Record<string, string> = { story: "#36B37E", bug: "#E5493A", task: "#4BADE8", epic: "#904EE2" };
const PC: Record<string, string> = { highest: "#CD1317", high: "#E5493A", medium: "#E97F33", low: "#2D8738" };
const PRI: Record<string, string> = { URGENT: "highest", CRITICAL: "highest", HIGH: "high", MEDIUM: "medium", LOW: "low" };
function TI({ t }: { t: string }) { return <span className="inline-flex h-4 w-4 items-center justify-center rounded-[3px] text-white" style={{ background: TC[t] || "#4BADE8" }}><Ic n={t === "bug" ? "bug" : t === "story" ? "bookmark" : "check"} s={11} /></span>; }
function PI({ p }: { p: string }) { return <span style={{ color: PC[p] }} className="inline-flex"><Ic n="down" s={14} c={p === "low" ? "" : "rotate-180"} /></span>; }
const days = (iso?: string) => (iso ? (Date.now() - new Date(iso).getTime()) / 86400000 : Infinity);

function Side({ page, setPage, projects, pid, setPid, risk, onRisk, busy }: any) {
  const items = [["summary", "Summary", "chart"], ["timeline", "Timeline", "timeline"], ["backlog", "Backlog", "list"], ["board", "Board", "columns"], ["issues", "All work", "layers"], ["reports", "Reports", "trend"]];
  const cur = projects.find((p: any) => p.id === pid);
  return (
    <aside className="hidden w-60 shrink-0 border-r border-slate-200 bg-[#F7F8F9] p-3 md:block">
      <div className="mb-4 flex items-center gap-2 px-2"><span className="flex h-8 w-8 items-center justify-center rounded bg-[#0552CC] text-white"><Ic n="bolt" s={16} /></span><div className="min-w-0"><p className="truncate text-sm font-semibold">{cur?.title || "No project"}</p><p className="text-xs text-slate-500">{(cur?.status || "").toLowerCase() || "Software project"}</p></div></div>
      {projects.length > 1 && <select aria-label="Project" value={pid || ""} onChange={(e) => setPid(e.target.value)} className="mb-3 h-8 w-full rounded border border-slate-300 bg-white px-2 text-sm">{projects.map((p: any) => <option key={p.id} value={p.id}>{p.title}</option>)}</select>}
      <p className="px-2 pb-1 text-[11px] font-bold uppercase text-slate-500">Planning</p>
      {items.map((i) => <button key={i[0]} onClick={() => setPage(i[0])} className={cx("mb-0.5 flex w-full items-center gap-2 rounded px-2 py-2 text-left text-sm font-medium", page === i[0] ? "bg-[#E9F2FF] text-[#0552CC]" : "text-slate-700 hover:bg-slate-200/60")}><Ic n={i[2]} s={16} />{i[1]}</button>)}
      {cur && <div className="mt-4 rounded-lg bg-[#F3F0FF] p-3 text-xs text-[#5B4BDB]"><p className="mb-1 flex items-center gap-1 font-bold"><Ic n="spark" s={14} />AI risk analysis</p>{risk ? <p className="whitespace-pre-line">{risk}</p> : <p>Ask AI to review delivery risk across tasks and milestones.</p>}<button onClick={onRisk} className="mt-2 font-bold underline">{busy ? "Analysing…" : risk ? "Refresh" : "Analyse risks"}</button></div>}
    </aside>
  );
}

export function Projects() {
  const { user } = useAuth();
  const company = user?.role === "COMPANY";
  const list = useApi<any[]>(user ? "/projects" : null);
  const projects = list.data ?? [];
  const [pidSel, setPid] = useState<string | null>(null);
  const pid = pidSel || projects[0]?.id || null;
  const dq = useApi<any>(pid ? `/projects/${pid}` : null);
  const [page, setPage] = useState("board");
  const [drag, setDrag] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [create, setCreate] = useState(false);
  const [newProject, setNewProject] = useState(false);
  const [nt, setNt] = useState({ title: "", desc: "", pri: "MEDIUM", ep: "" });
  const [np, setNp] = useState({ title: "", desc: "" });
  const [q, setQ] = useState("");
  const [comment, setComment] = useState("");
  const [risk, setRisk] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const d = dq.data;
  const people = d?.people ?? {};
  const name = (id?: string | null) => (id && people[id]?.full_name) || "Unassigned";
  const iss: Issue[] = (d?.tasks ?? []).map((t: any, i: number) => ({ id: t.id, k: `T-${i + 1}`, t: t.title, type: "task", pri: PRI[(t.priority || "MEDIUM").toUpperCase()] || "medium", as: name(t.assigned_user_id), asId: t.assigned_user_id, sp: t.estimated_hours || 0, st: COL_OF[t.status] || "todo", raw: t.status, ep: t.milestone || "—", d: t.description || "", updated: t.updated_at, created: t.created_at, deadline: t.deadline }));
  const shown = iss.filter((i) => (i.t + i.as + i.ep).toLowerCase().includes(q.toLowerCase()));
  const open = iss.find((i) => i.id === openId) || null;
  const done = iss.filter((i) => i.st === "done").length;
  const members: string[] = d?.member_ids ?? [];
  const act = async (fn: () => Promise<unknown>, ok?: string) => { try { await fn(); dq.reload(); if (ok) setNotice(ok); } catch (e) { setNotice(extractErrorMessage(e, "That didn't work. Please try again.")); } };
  const patch = (id: string, body: any, ok?: string) => act(() => api.patch(`/projects/tasks/${id}`, body), ok);
  const move = (id: string, col: string) => { const i = iss.find((x) => x.id === id); if (i && i.st !== col) patch(id, { status: STATUS_OF[col] }, "Task moved"); };
  const add = () => { if (!nt.title.trim() || !pid) return; act(async () => { await api.post("/projects/tasks", { project_id: pid, title: nt.title.trim(), description: nt.desc.trim() || undefined, priority: nt.pri, milestone: nt.ep.trim() || undefined }); setNt({ title: "", desc: "", pri: "MEDIUM", ep: "" }); setCreate(false); }, "Task created"); };
  const addProject = () => { if (!np.title.trim() || !np.desc.trim()) return; act(async () => { const r = await api.post("/projects", { title: np.title.trim(), description: np.desc.trim() }); list.reload(); setPid(r.data.id); setNewProject(false); setNp({ title: "", desc: "" }); }, "Project created"); };
  const analyse = async () => { if (!pid) return; setBusy(true); try { const r = await api.post(`/projects/${pid}/ai/risk-analysis`); const p = r.data?.payload || r.data; setRisk(p?.summary || (p?.risks || []).map((x: any) => `• ${x.description || x.title || x}`).join("\n") || "No significant risks found."); } catch (e) { setRisk(extractErrorMessage(e, "AI analysis is unavailable right now.")); } finally { setBusy(false); } };
  const share = async () => { try { await navigator.clipboard.writeText(`${window.location.origin}/#projects`); setNotice("Board link copied"); } catch { setNotice("Copy the page address to share this board"); } };

  if (!user) return <div className="p-10 text-center"><h2>Sign in to see your projects</h2><Btn c="mt-4" onClick={() => { goRoute("login"); }}>Sign in</Btn></div>;
  if (list.loading && !list.data) return <div className="p-10 text-center text-slate-500">Loading projects…</div>;
  if (!projects.length) return <div className="mx-auto max-w-xl p-10 text-center"><span className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-[#E8F0FC] text-[#0552CC]"><Ic n="board" s={26} /></span><h2>No projects yet</h2><p className="mt-2 text-slate-500">{company ? "Create a project to plan tasks and milestones with your team." : "Projects you’re added to, or whose tasks you accept, appear here."}</p>{company && <Btn c="mt-4" icon="plus" onClick={() => setNewProject(true)}>Create project</Btn>}<Modal open={newProject} onClose={() => setNewProject(false)} title="Create project"><div className="space-y-3"><Field label="Project name"><input value={np.title} onChange={(e) => setNp({ ...np, title: e.target.value })} className={inputCls} /></Field><Field label="Description"><textarea rows={3} value={np.desc} onChange={(e) => setNp({ ...np, desc: e.target.value })} className={cx(inputCls, "h-auto py-2")} /></Field></div><div className="mt-5 flex justify-end gap-2"><Btn v="gray" onClick={() => setNewProject(false)}>Cancel</Btn><Btn v="primary" onClick={addProject}>Create</Btn></div></Modal>{notice && <button onClick={() => setNotice("")} className="v2-toast">{notice} · Dismiss</button>}</div>;

  const epics = Array.from(new Set(iss.map((i) => i.ep).filter((e) => e && e !== "—")));
  const weeks = Array.from({ length: 8 }, (_, i) => { const s = new Date(); s.setDate(s.getDate() - (7 - i) * 7); return s; });
  const perWeek = weeks.map((w, i) => iss.filter((x) => x.st === "done" && new Date(x.updated) >= w && (i === 7 || new Date(x.updated) < weeks[i + 1])).length);
  return (
    <div className="flex flex-col min-h-[calc(100vh-130px)] bg-white md:flex-row">
      <div className="border-b border-slate-200 bg-white p-3 md:hidden"><select value={page} onChange={(e) => setPage(e.target.value)} className="h-9 w-full rounded-md border border-slate-300 px-2 text-sm">{[["summary", "Summary"], ["timeline", "Timeline"], ["backlog", "Backlog"], ["board", "Board"], ["issues", "All work"], ["reports", "Reports"]].map((i) => <option key={i[0]} value={i[0]}>{i[1]}</option>)}</select></div>
      <Side page={page} setPage={setPage} projects={projects} pid={pid} setPid={(v: string) => { setPid(v); setRisk(""); }} risk={risk} onRisk={analyse} busy={busy} />
      <div className="min-w-0 flex-1 p-6">
        <p className="text-xs text-slate-500">Projects / {d?.project?.title || "…"}</p>
        <div className="mt-1 flex flex-wrap items-center justify-between gap-3"><h1 className="text-2xl font-semibold capitalize">{page === "issues" ? "All work" : page}</h1><div className="flex items-center gap-2"><div className="flex -space-x-2">{members.slice(0, 5).map((m) => <Av key={m} name={name(m)} s={30} />)}</div><Btn v="gray" icon="share" onClick={share}>Share</Btn>{company && <Btn v="gray" onClick={() => setNewProject(true)}>New project</Btn>}<Btn v="primary" icon="plus" onClick={() => setCreate(true)} c="!bg-[#0552CC]">Create</Btn></div></div>
        {dq.loading && !d && <p className="mt-6 text-sm text-slate-500">Loading board…</p>}

        {page === "board" && d && (
          <>
            <div className="mt-4 flex flex-wrap items-center gap-2"><div className="flex h-8 items-center gap-2 rounded border border-slate-300 px-2"><Ic n="search" s={14} c="text-slate-500" /><input aria-label="Search board" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search board" className="w-36 text-sm outline-none" /></div><span className="ml-auto text-xs text-slate-500">{done}/{iss.length} done</span></div>
            <div className="mt-4 grid gap-3 grid-cols-1 md:grid-cols-4">
              {COLS.map((c) => {
                const col = shown.filter((i) => i.st === c[0]);
                return (
                  <div key={c[0]} onDragOver={(e) => { e.preventDefault(); setOver(c[0]); }} onDragLeave={() => setOver(null)} onDrop={() => { if (drag) move(drag, c[0]); setDrag(null); setOver(null); }} className={cx("rounded-lg bg-[#F1F2F4] p-2 transition", over === c[0] && "ring-2 ring-[#0552CC]")}>
                    <p className="px-2 py-2 text-xs font-bold text-slate-600">{c[1]} <span className="ml-1 font-normal">{col.length}</span></p>
                    {col.map((i) => (
                      <div key={i.id} draggable onDragStart={() => setDrag(i.id)} onClick={() => setOpenId(i.id)} className="mb-2 cursor-grab rounded bg-white p-3 shadow-sm hover:bg-slate-50">
                        <p className="text-sm text-slate-800">{i.t}</p>
                        {i.ep !== "—" && <span className="mt-2 inline-block rounded bg-[#F3F0FF] px-1.5 py-0.5 text-[11px] font-bold text-[#5E4DB2]">{i.ep}</span>}
                        {i.raw === "BLOCKED" && <span className="ml-1 mt-2 inline-block rounded bg-red-50 px-1.5 py-0.5 text-[11px] font-bold text-red-700">Blocked</span>}
                        <div className="mt-3 flex items-center justify-between"><div className="flex items-center gap-2"><TI t={i.type} /><span className={cx("text-xs font-semibold text-slate-500", i.st === "done" && "line-through")}>{i.k}</span></div><div className="flex items-center gap-2">{i.sp > 0 && <span className="rounded-full bg-slate-200 px-1.5 text-[11px] font-bold text-slate-600">{i.sp}h</span>}<PI p={i.pri} /><Av name={i.as} s={22} /></div></div>
                      </div>
                    ))}
                    <button onClick={() => setCreate(true)} className="flex w-full items-center gap-1 rounded px-2 py-2 text-sm text-slate-500 hover:bg-slate-200/70"><Ic n="plus" s={14} />Create task</button>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {page === "backlog" && d && (
          <div className="mt-4 space-y-4">
            {[["Open work", "", iss.filter((i) => i.st !== "done")], ["Completed", "", iss.filter((i) => i.st === "done")]].map((s) => (
              <div key={String(s[0])} className="rounded-lg border border-slate-200">
                <div className="flex items-center justify-between bg-[#F7F8F9] p-3"><p className="font-semibold">{s[0] as string} <span className="ml-2 text-xs font-normal text-slate-500">{(s[2] as Issue[]).length} tasks</span></p></div>
                {(s[2] as Issue[]).map((i) => <div key={i.id} onClick={() => setOpenId(i.id)} className="flex cursor-pointer items-center gap-3 border-t border-slate-100 px-3 py-2 text-sm hover:bg-slate-50"><TI t={i.type} /><span className="w-16 text-xs text-slate-500">{i.k}</span><span className="flex-1">{i.t}</span>{i.ep !== "—" && <span className="hidden rounded bg-[#F3F0FF] px-1.5 text-[11px] font-bold text-[#5E4DB2] md:inline">{i.ep}</span>}<Tag t="gray">{COLS.find((c) => c[0] === i.st)![1]}</Tag><PI p={i.pri} /><Av name={i.as} s={22} /></div>)}
              </div>
            ))}
          </div>
        )}

        {page === "timeline" && d && (() => { const ms = (d.milestones ?? []).filter((m: any) => m.due_date); const start = new Date(); start.setDate(start.getDate() - 14); const wk = Array.from({ length: 12 }, (_, i) => { const x = new Date(start); x.setDate(x.getDate() + i * 7); return x; }); return (
          <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200">
            <div className="grid min-w-[800px] grid-cols-[220px_repeat(12,1fr)] border-b bg-[#F7F8F9] text-xs font-semibold text-slate-500"><div className="p-3">Milestone</div>{wk.map((w) => <div key={w.toISOString()} className="border-l p-3">{w.toLocaleDateString("en-US", { month: "short", day: "2-digit" })}</div>)}</div>
            {ms.map((m: any, idx: number) => { const due = (new Date(m.due_date).getTime() - start.getTime()) / (7 * 86400000); const left = Math.max(0, Math.min(11, due - 2)); const color = ["#904EE2", "#E5493A", "#36B37E", "#4BADE8", "#E97F33", "#0552CC"][idx % 6]; const pct = ["COMPLETED", "DONE"].includes(m.status) ? 100 : m.status === "IN_REVIEW" ? 80 : m.status === "IN_PROGRESS" ? 40 : 0; return (
              <div key={m.id} className="grid min-w-[800px] grid-cols-[220px_1fr] border-b border-slate-100"><div className="flex items-center gap-2 p-3 text-sm font-medium"><span className="h-3 w-3 rounded-sm" style={{ background: color }} />{m.title}</div><div className="relative h-12"><div className="absolute top-3 flex h-6 items-center overflow-hidden rounded px-2 text-xs font-semibold text-white" style={{ left: (left / 12) * 100 + "%", width: (2.5 / 12) * 100 + "%", background: color }}>{pct}%</div></div></div>); })}
            {!ms.length && <p className="p-6 text-sm text-slate-500">Add milestones with due dates to see them on the timeline.</p>}
          </div>); })()}

        {page === "summary" && d && (
          <div className="mt-4 grid gap-4 grid-cols-1 md:grid-cols-4">
            {[["Completed", `${done} tasks`, "check"], ["Updated", `${iss.filter((i) => days(i.updated) <= 7).length} in the last 7 days`, "edit"], ["Created", `${iss.filter((i) => days(i.created) <= 7).length} in the last 7 days`, "plus"], ["Due soon", `${iss.filter((i) => i.deadline && i.st !== "done" && -days(i.deadline) <= 7 && -days(i.deadline) >= 0).length} next 7 days`, "clock"]].map((s) => <div key={s[0]} className="flex items-center gap-3 rounded-lg border border-slate-200 p-4"><span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#E9F2FF] text-[#0552CC]"><Ic n={s[2]} s={18} /></span><div><p className="font-semibold">{s[1]}</p><p className="text-xs text-slate-500">{s[0]}</p></div></div>)}
            <Card c="md:col-span-2 rounded-lg"><p className="mb-3 font-semibold">Status overview</p>{COLS.map((c) => <div key={c[0]} className="mb-2 flex items-center gap-3 text-sm"><span className="w-28 text-xs text-slate-500">{c[1]}</span><div className="flex-1"><Bar v={iss.length ? (iss.filter((i) => i.st === c[0]).length / iss.length) * 100 : 0} c="bg-[#0552CC]" /></div><b className="w-4">{iss.filter((i) => i.st === c[0]).length}</b></div>)}</Card>
            <Card c="md:col-span-2 rounded-lg"><p className="mb-3 font-semibold">Team workload</p>{Array.from(new Set(iss.map((i) => i.as))).map((n) => { const mine = iss.filter((i) => i.as === n && i.st !== "done").length; return <div key={n} className="mb-2 flex items-center gap-3 text-sm"><Av name={n} s={24} /><span className="w-32 truncate">{n}</span><div className="flex-1"><Bar v={iss.length ? (mine / iss.length) * 100 : 0} c="bg-[#904EE2]" /></div><b className="w-4">{mine}</b></div>; })}{!iss.length && <p className="text-sm text-slate-500">No tasks yet.</p>}</Card>
          </div>
        )}

        {page === "issues" && d && (
          <div className="mt-4 overflow-hidden rounded-lg border border-slate-200"><table className="w-full text-sm"><thead className="bg-[#F7F8F9] text-left text-xs uppercase text-slate-500"><tr>{["Type", "Key", "Summary", "Status", "Assignee", "Priority", "Estimate"].map((h) => <th key={h} className="px-3 py-2">{h}</th>)}</tr></thead><tbody>{shown.map((i) => <tr key={i.id} onClick={() => setOpenId(i.id)} className="cursor-pointer border-t border-slate-100 hover:bg-slate-50"><td className="px-3 py-2"><TI t={i.type} /></td><td className="px-3 py-2 text-[#0552CC]">{i.k}</td><td className="px-3 py-2">{i.t}</td><td className="px-3 py-2"><Tag t="gray">{COLS.find((c) => c[0] === i.st)![1]}</Tag></td><td className="px-3 py-2">{i.as}</td><td className="px-3 py-2"><PI p={i.pri} /></td><td className="px-3 py-2">{i.sp ? `${i.sp}h` : "—"}</td></tr>)}{!shown.length && <tr><td colSpan={7} className="px-3 py-6 text-center text-slate-500">No tasks.</td></tr>}</tbody></table></div>
        )}

        {page === "reports" && d && (
          <div className="mt-4 grid gap-4 grid-cols-1 md:grid-cols-2">
            <Card c="rounded-lg"><p className="font-semibold">Completed per week</p><div className="mt-4 flex h-40 items-end gap-3">{perWeek.map((v, i) => <div key={i} className="flex flex-1 flex-col items-center justify-end gap-1"><div className="w-full rounded-t bg-[#0552CC]" style={{ height: Math.max(2, (v / Math.max(1, ...perWeek)) * 140) }} /><span className="text-[10px] text-slate-500">{weeks[i].toLocaleDateString("en-US", { month: "short", day: "2-digit" })}</span></div>)}</div><p className="mt-2 text-xs text-slate-500">Tasks moved to done, by week</p></Card>
            <Card c="rounded-lg"><p className="font-semibold">Open work by status</p>{COLS.slice(0, 3).map((c) => <div key={c[0]} className="mt-3 flex items-center gap-3 text-sm"><span className="w-28 text-xs text-slate-500">{c[1]}</span><div className="flex-1"><Bar v={iss.length ? (iss.filter((i) => i.st === c[0]).length / iss.length) * 100 : 0} /></div><b className="w-4">{iss.filter((i) => i.st === c[0]).length}</b></div>)}<p className="mt-3 text-xs text-slate-500">{iss.filter((i) => i.raw === "BLOCKED").length} blocked · {epics.length} milestone group{epics.length === 1 ? "" : "s"}</p></Card>
          </div>
        )}
      </div>

      {open && (
        <div className="fixed inset-0 z-[90] flex items-start justify-center overflow-y-auto bg-black/50 p-6" onClick={() => setOpenId(null)}>
          <div className="w-full max-w-4xl rounded-lg bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-slate-200 p-4"><div className="flex items-center gap-2 text-sm text-slate-600">{open.ep !== "—" && <><span className="rounded bg-[#F3F0FF] px-1.5 text-xs font-bold text-[#5E4DB2]">{open.ep}</span>/</>}<TI t={open.type} /><b>{open.k}</b></div><button aria-label="Close" onClick={() => setOpenId(null)} className="rounded p-1.5 hover:bg-slate-100"><Ic n="x" /></button></div>
            <div className="grid gap-6 p-6 grid-cols-1 md:grid-cols-[1fr_280px]">
              <div><h2 className="text-2xl font-semibold">{open.t}</h2><p className="mt-5 font-semibold">Description</p><p className="mt-1 whitespace-pre-line text-sm leading-6 text-slate-700">{open.d || "No description."}</p><p className="mt-5 font-semibold">Activity</p><form className="mt-2 flex gap-3" onSubmit={(e) => { e.preventDefault(); if (!comment.trim()) return; act(async () => { await api.post(`/projects/tasks/${open.id}/comments`, { content: comment.trim() }); setComment(""); }); }}><Av name={user.full_name || "You"} s={32} /><input aria-label="Add a comment" value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Add a comment..." className="h-10 flex-1 rounded border border-slate-300 px-3 text-sm outline-none" /></form>{(d?.comments ?? []).filter((c: any) => c.task_id === open.id).slice().reverse().map((c: any) => <div key={c.id} className="mt-4 flex gap-3 text-sm"><Av name={name(c.author_id)} s={32} /><div><p><b>{name(c.author_id)}</b> <span className="text-xs text-slate-500">{new Date(c.created_at).toLocaleString()}</span></p><p className="whitespace-pre-line text-slate-700">{c.content}</p></div></div>)}</div>
              <div><select aria-label="Status" value={open.raw} onChange={(e) => patch(open.id, { status: e.target.value })} className="h-9 w-full rounded bg-[#E9F2FF] px-3 text-sm font-bold text-[#0552CC]">{[["TODO", "TO DO"], ["IN_PROGRESS", "IN PROGRESS"], ["BLOCKED", "BLOCKED"], ["REVIEW", "IN REVIEW"], ["COMPLETED", "DONE"]].map((c) => <option key={c[0]} value={c[0]}>{c[1]}</option>)}</select>
                <div className="mt-4 rounded-lg border border-slate-200 text-sm">
                  <div className="flex items-center justify-between border-b border-slate-100 p-3"><span className="text-slate-500">Assignee</span>{company ? <select aria-label="Assignee" value={open.asId || ""} onChange={(e) => patch(open.id, { assigned_user_id: e.target.value || null })} className="max-w-[150px] rounded border border-slate-200 px-1 text-sm"><option value="">Unassigned</option>{members.map((m) => <option key={m} value={m}>{name(m)}</option>)}</select> : <span className="font-medium">{open.as}</span>}</div>
                  <div className="flex items-center justify-between border-b border-slate-100 p-3"><span className="text-slate-500">Priority</span><select aria-label="Priority" value={Object.keys(PRI).find((k) => PRI[k] === open.pri && k !== "CRITICAL") || "MEDIUM"} onChange={(e) => patch(open.id, { priority: e.target.value })} className="rounded border border-slate-200 px-1 text-sm">{["LOW", "MEDIUM", "HIGH", "URGENT"].map((p) => <option key={p} value={p}>{p.charAt(0) + p.slice(1).toLowerCase()}</option>)}</select></div>
                  {[["Estimate", open.sp ? `${open.sp} hours` : "—"], ["Due", open.deadline ? new Date(open.deadline).toLocaleDateString() : "—"], ["Milestone", open.ep]].map((r) => <div key={r[0]} className="flex justify-between border-b border-slate-100 p-3 last:border-0"><span className="text-slate-500">{r[0]}</span><span className="font-medium">{r[1]}</span></div>)}
                </div></div>
            </div>
          </div>
        </div>
      )}
      <Modal open={create} onClose={() => setCreate(false)} title="Create task"><div className="space-y-3"><Field label="Summary"><input value={nt.title} onChange={(e) => setNt({ ...nt, title: e.target.value })} className={inputCls} placeholder="What needs to be done?" /></Field><Field label="Description"><textarea rows={3} value={nt.desc} onChange={(e) => setNt({ ...nt, desc: e.target.value })} className={cx(inputCls, "h-auto py-2")} /></Field><div className="grid grid-cols-2 gap-3"><Field label="Priority"><select value={nt.pri} onChange={(e) => setNt({ ...nt, pri: e.target.value })} className={inputCls}>{["LOW", "MEDIUM", "HIGH", "URGENT"].map((p) => <option key={p} value={p}>{p.charAt(0) + p.slice(1).toLowerCase()}</option>)}</select></Field><Field label="Milestone / epic"><input value={nt.ep} onChange={(e) => setNt({ ...nt, ep: e.target.value })} className={inputCls} list="rap-epics" /><datalist id="rap-epics">{epics.map((e) => <option key={e} value={e} />)}</datalist></Field></div></div><div className="mt-5 flex justify-end gap-2"><Btn v="gray" onClick={() => setCreate(false)}>Cancel</Btn><Btn v="primary" onClick={add}>Create</Btn></div></Modal>
      <Modal open={newProject} onClose={() => setNewProject(false)} title="Create project"><div className="space-y-3"><Field label="Project name"><input value={np.title} onChange={(e) => setNp({ ...np, title: e.target.value })} className={inputCls} /></Field><Field label="Description"><textarea rows={3} value={np.desc} onChange={(e) => setNp({ ...np, desc: e.target.value })} className={cx(inputCls, "h-auto py-2")} /></Field></div><div className="mt-5 flex justify-end gap-2"><Btn v="gray" onClick={() => setNewProject(false)}>Cancel</Btn><Btn v="primary" onClick={addProject}>Create</Btn></div></Modal>
      {notice && <button onClick={() => setNotice("")} className="v2-toast">{notice} · Dismiss</button>}
    </div>
  );
}
