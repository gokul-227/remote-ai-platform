// @ts-nocheck -- Figma Make export, kept verbatim (never type-checked upstream).
import { useState } from "react";
import { Ic, Av, Btn, Card, Tag, Tabs, Modal, Bar, cx, Field, inputCls } from "./rap_kit";

const B = "#0552CC";
type Issue = { k: string; t: string; type: string; pri: string; as: string; sp: number; st: string; ep: string; d: string };
const COLS = [["todo", "TO DO"], ["prog", "IN PROGRESS"], ["rev", "IN REVIEW"], ["done", "DONE"]];
const I0: Issue[] = [
  { k: "RAP-142", t: "Add hybrid retrieval with reranker to matching service", type: "story", pri: "high", as: "Priya Raman", sp: 5, st: "prog", ep: "Matching v2", d: "Combine BM25 and vector search, rerank with a cross-encoder, expose scores in the explanation payload." },
  { k: "RAP-143", t: "Escrow release webhook fails on retry", type: "bug", pri: "highest", as: "Mateo Silva", sp: 3, st: "todo", ep: "Payments", d: "Duplicate release events are created when the payment provider retries the webhook within 30s." },
  { k: "RAP-144", t: "Milestone approval flow: request changes state", type: "story", pri: "medium", as: "Elena Petrova", sp: 5, st: "rev", ep: "Contracts", d: "Client can request changes with a note; freelancer sees a diff of deliverables." },
  { k: "RAP-145", t: "Terraform module for regional read replicas", type: "task", pri: "medium", as: "Kenji Watanabe", sp: 2, st: "done", ep: "Platform", d: "Provision read replicas in eu-west and ap-south with failover." },
  { k: "RAP-146", t: "Proposal cover-letter assistant (AI)", type: "story", pri: "high", as: "Gokul Raj", sp: 8, st: "prog", ep: "Matching v2", d: "Generate a draft from profile and job description with tone control." },
  { k: "RAP-147", t: "Notification digest email template", type: "task", pri: "low", as: "Daniel Okafor", sp: 1, st: "todo", ep: "Growth", d: "Weekly digest with matched jobs and unread messages." },
  { k: "RAP-148", t: "Admin: bulk suspend flagged accounts", type: "story", pri: "medium", as: "Aisha Rahman", sp: 3, st: "rev", ep: "Trust", d: "Multi-select in the moderation queue with audit reason." },
  { k: "RAP-149", t: "Rate limiter drops valid websocket reconnects", type: "bug", pri: "high", as: "Priya Raman", sp: 2, st: "done", ep: "Platform", d: "Token bucket shared across connections per user." },
];
const TC: Record<string, string> = { story: "#36B37E", bug: "#E5493A", task: "#4BADE8", epic: "#904EE2" };
const PC: Record<string, string> = { highest: "#CD1317", high: "#E5493A", medium: "#E97F33", low: "#2D8738" };
function TI({ t }: { t: string }) { return <span className="inline-flex h-4 w-4 items-center justify-center rounded-[3px] text-white" style={{ background: TC[t] || "#4BADE8" }}><Ic n={t === "bug" ? "bug" : t === "story" ? "bookmark" : "check"} s={11} /></span>; }
function PI({ p }: { p: string }) { return <span style={{ color: PC[p] }} className="inline-flex"><Ic n={p === "low" ? "down" : "down"} s={14} c={p === "low" ? "" : "rotate-180"} /></span>; }

function Side({ page, setPage }: { page: string; setPage: (p: string) => void }) {
  const items = [["summary", "Summary", "chart"], ["timeline", "Timeline", "timeline"], ["backlog", "Backlog", "list"], ["board", "Board", "columns"], ["issues", "All work", "layers"], ["reports", "Reports", "trend"]];
  return (
    <aside className="hidden w-60 shrink-0 border-r border-slate-200 bg-[#F7F8F9] p-3 md:block">
      <div className="mb-4 flex items-center gap-2 px-2"><span className="flex h-8 w-8 items-center justify-center rounded bg-[#0552CC] text-white"><Ic n="bolt" s={16} /></span><div><p className="text-sm font-semibold">Remote-AI Core</p><p className="text-xs text-slate-500">Software project</p></div></div>
      <p className="px-2 pb-1 text-[11px] font-bold uppercase text-slate-500">Planning</p>
      {items.map((i) => <button key={i[0]} onClick={() => setPage(i[0])} className={cx("mb-0.5 flex w-full items-center gap-2 rounded px-2 py-2 text-left text-sm font-medium", page === i[0] ? "bg-[#E9F2FF] text-[#0552CC]" : "text-slate-700 hover:bg-slate-200/60")}><Ic n={i[2]} s={16} />{i[1]}</button>)}
      <p className="px-2 pb-1 pt-4 text-[11px] font-bold uppercase text-slate-500">Development</p>
      {[["Code", "code"], ["Releases", "gift"], ["Deployments", "zap"]].map((i) => <button key={i[0]} className="mb-0.5 flex w-full items-center gap-2 rounded px-2 py-2 text-left text-sm text-slate-700 hover:bg-slate-200/60"><Ic n={i[1]} s={16} />{i[0]}</button>)}
      <div className="mt-4 rounded-lg bg-[#F3F0FF] p-3 text-xs text-[#5B4BDB]"><p className="mb-1 flex items-center gap-1 font-bold"><Ic n="spark" s={14} />AI suggestion</p>Sprint 24 is at risk: 2 stories in review have no reviewer assigned.</div>
    </aside>
  );
}

export function Projects() {
  const [page, setPage] = useState("board");
  const [iss, setIss] = useState<Issue[]>(I0);
  const [drag, setDrag] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [open, setOpen] = useState<Issue | null>(null);
  const [create, setCreate] = useState(false);
  const [nt, setNt] = useState("");
  const move = (k: string, st: string) => setIss(iss.map((i) => (i.k === k ? { ...i, st } : i)));
  const add = () => { if (!nt.trim()) return; setIss([{ k: "RAP-" + (150 + iss.length), t: nt, type: "story", pri: "medium", as: "Gokul Raj", sp: 3, st: "todo", ep: "Matching v2", d: "" }, ...iss]); setNt(""); setCreate(false); };
  const done = iss.filter((i) => i.st === "done").length;
  return (
    <div className="flex flex-col min-h-[calc(100vh-130px)] bg-white md:flex-row">
      <div className="border-b border-slate-200 bg-white p-3 md:hidden"><select value={page} onChange={(e) => setPage(e.target.value)} className="h-9 w-full rounded-md border border-slate-300 px-2 text-sm">{[["summary","Summary"],["timeline","Timeline"],["backlog","Backlog"],["board","Board"],["issues","All work"],["reports","Reports"]].map((i) => <option key={i[0]} value={i[0]}>{i[1]}</option>)}</select></div>
      <Side page={page} setPage={setPage} />
      <div className="min-w-0 flex-1 p-6">
        <p className="text-xs text-slate-500">Projects / Remote-AI Core</p>
        <div className="mt-1 flex flex-wrap items-center justify-between gap-3"><h1 className="text-2xl font-semibold capitalize">{page === "issues" ? "All work" : page}</h1><div className="flex items-center gap-2"><div className="flex -space-x-2">{["Priya Raman", "Mateo Silva", "Elena Petrova", "Kenji Watanabe"].map((n) => <Av key={n} name={n} s={30} />)}</div><Btn v="gray" icon="share">Share</Btn><Btn v="primary" icon="plus" onClick={() => setCreate(true)} c="!bg-[#0552CC]">Create</Btn></div></div>

        {page === "board" && (
          <>
            <div className="mt-4 flex flex-wrap items-center gap-2"><div className="flex h-8 items-center gap-2 rounded border border-slate-300 px-2"><Ic n="search" s={14} c="text-slate-500" /><input placeholder="Search board" className="w-36 text-sm outline-none" /></div><Btn v="gray" sm>Epic</Btn><Btn v="gray" sm>Assignee</Btn><Btn v="gray" sm>Type</Btn><span className="ml-auto text-xs text-slate-500">Sprint 24 - 6 days left - {done}/{iss.length} done</span></div>
            <div className="mt-4 grid gap-3 grid-cols-1 md:grid-cols-4">
              {COLS.map((c) => {
                const list = iss.filter((i) => i.st === c[0]);
                return (
                  <div key={c[0]} onDragOver={(e) => { e.preventDefault(); setOver(c[0]); }} onDragLeave={() => setOver(null)} onDrop={() => { if (drag) move(drag, c[0]); setDrag(null); setOver(null); }} className={cx("rounded-lg bg-[#F1F2F4] p-2 transition", over === c[0] && "ring-2 ring-[#0552CC]")}>
                    <p className="px-2 py-2 text-xs font-bold text-slate-600">{c[1]} <span className="ml-1 font-normal">{list.length}</span></p>
                    {list.map((i) => (
                      <div key={i.k} draggable onDragStart={() => setDrag(i.k)} onClick={() => setOpen(i)} className="mb-2 cursor-grab rounded bg-white p-3 shadow-sm hover:bg-slate-50">
                        <p className="text-sm text-slate-800">{i.t}</p>
                        <span className="mt-2 inline-block rounded bg-[#F3F0FF] px-1.5 py-0.5 text-[11px] font-bold text-[#5E4DB2]">{i.ep}</span>
                        <div className="mt-3 flex items-center justify-between"><div className="flex items-center gap-2"><TI t={i.type} /><span className={cx("text-xs font-semibold text-slate-500", i.st === "done" && "line-through")}>{i.k}</span></div><div className="flex items-center gap-2"><span className="rounded-full bg-slate-200 px-1.5 text-[11px] font-bold text-slate-600">{i.sp}</span><PI p={i.pri} /><Av name={i.as} s={22} /></div></div>
                      </div>
                    ))}
                    <button onClick={() => setCreate(true)} className="flex w-full items-center gap-1 rounded px-2 py-2 text-sm text-slate-500 hover:bg-slate-200/70"><Ic n="plus" s={14} />Create issue</button>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {page === "backlog" && (
          <div className="mt-4 space-y-4">
            {[["Sprint 24", "Aug 26 - Sep 30", iss.filter((i) => i.st !== "done")], ["Backlog", "", iss.filter((i) => i.st === "done")]].map((s) => (
              <div key={String(s[0])} className="rounded-lg border border-slate-200">
                <div className="flex items-center justify-between bg-[#F7F8F9] p-3"><p className="font-semibold">{s[0]} <span className="ml-2 text-xs font-normal text-slate-500">{s[1]} - {(s[2] as Issue[]).length} issues</span></p>{s[0] === "Sprint 24" && <Btn v="gray" sm>Complete sprint</Btn>}</div>
                {(s[2] as Issue[]).map((i) => <div key={i.k} onClick={() => setOpen(i)} className="flex cursor-pointer items-center gap-3 border-t border-slate-100 px-3 py-2 text-sm hover:bg-slate-50"><TI t={i.type} /><span className="w-16 text-xs text-slate-500">{i.k}</span><span className="flex-1">{i.t}</span><span className="hidden rounded bg-[#F3F0FF] px-1.5 text-[11px] font-bold text-[#5E4DB2] md:inline">{i.ep}</span><Tag t="gray">{COLS.find((c) => c[0] === i.st)![1]}</Tag><span className="w-6 text-center text-xs">{i.sp}</span><PI p={i.pri} /><Av name={i.as} s={22} /></div>)}
              </div>
            ))}
          </div>
        )}

        {page === "timeline" && (
          <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200">
            <div className="grid min-w-[800px] grid-cols-[220px_repeat(12,1fr)] border-b bg-[#F7F8F9] text-xs font-semibold text-slate-500"><div className="p-3">Epic</div>{["Aug 19", "Aug 26", "Sep 02", "Sep 09", "Sep 16", "Sep 23", "Sep 30", "Oct 07", "Oct 14", "Oct 21", "Oct 28", "Nov 04"].map((w) => <div key={w} className="border-l p-3">{w}</div>)}</div>
            {[["Matching v2", 1, 6, "#904EE2", 72], ["Payments", 3, 5, "#E5493A", 40], ["Contracts", 2, 6, "#36B37E", 58], ["Platform", 0, 4, "#4BADE8", 100], ["Trust", 5, 5, "#E97F33", 20], ["Growth", 8, 4, "#0552CC", 0]].map((r) => (
              <div key={String(r[0])} className="grid min-w-[800px] grid-cols-[220px_1fr] border-b border-slate-100"><div className="flex items-center gap-2 p-3 text-sm font-medium"><span className="h-3 w-3 rounded-sm" style={{ background: String(r[3]) }} />{r[0]}</div><div className="relative h-12"><div className="absolute top-3 flex h-6 items-center overflow-hidden rounded px-2 text-xs font-semibold text-white" style={{ left: (Number(r[1]) / 12) * 100 + "%", width: (Number(r[2]) / 12) * 100 + "%", background: String(r[3]) }}>{r[4]}%</div></div></div>
            ))}
          </div>
        )}

        {page === "summary" && (
          <div className="mt-4 grid gap-4 grid-cols-1 md:grid-cols-4">
            {[["Completed", done + " work items", "check"], ["Updated", "12 in the last 7 days", "edit"], ["Created", "9 in the last 7 days", "plus"], ["Due soon", "3 next 7 days", "clock"]].map((s) => <div key={s[0]} className="flex items-center gap-3 rounded-lg border border-slate-200 p-4"><span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#E9F2FF] text-[#0552CC]"><Ic n={s[2]} s={18} /></span><div><p className="font-semibold">{s[1].split(" ")[0]} {s[1].split(" ").slice(1).join(" ")}</p><p className="text-xs text-slate-500">{s[0]}</p></div></div>)}
            <Card c="md:col-span-2 rounded-lg"><p className="mb-3 font-semibold">Status overview</p>{COLS.map((c) => <div key={c[0]} className="mb-2 flex items-center gap-3 text-sm"><span className="w-28 text-xs text-slate-500">{c[1]}</span><div className="flex-1"><Bar v={(iss.filter((i) => i.st === c[0]).length / iss.length) * 100} c="bg-[#0552CC]" /></div><b className="w-4">{iss.filter((i) => i.st === c[0]).length}</b></div>)}</Card>
            <Card c="md:col-span-2 rounded-lg"><p className="mb-3 font-semibold">Team workload</p>{["Priya Raman", "Mateo Silva", "Elena Petrova", "Kenji Watanabe", "Gokul Raj"].map((n) => <div key={n} className="mb-2 flex items-center gap-3 text-sm"><Av name={n} s={24} /><span className="w-32">{n}</span><div className="flex-1"><Bar v={(iss.filter((i) => i.as === n).length / 3) * 100} c="bg-[#904EE2]" /></div></div>)}</Card>
          </div>
        )}

        {page === "issues" && (
          <div className="mt-4 overflow-hidden rounded-lg border border-slate-200"><table className="w-full text-sm"><thead className="bg-[#F7F8F9] text-left text-xs uppercase text-slate-500"><tr>{["Type", "Key", "Summary", "Status", "Assignee", "Priority", "Points"].map((h) => <th key={h} className="px-3 py-2">{h}</th>)}</tr></thead><tbody>{iss.map((i) => <tr key={i.k} onClick={() => setOpen(i)} className="cursor-pointer border-t border-slate-100 hover:bg-slate-50"><td className="px-3 py-2"><TI t={i.type} /></td><td className="px-3 py-2 text-[#0552CC]">{i.k}</td><td className="px-3 py-2">{i.t}</td><td className="px-3 py-2"><Tag t="gray">{COLS.find((c) => c[0] === i.st)![1]}</Tag></td><td className="px-3 py-2">{i.as}</td><td className="px-3 py-2"><PI p={i.pri} /></td><td className="px-3 py-2">{i.sp}</td></tr>)}</tbody></table></div>
        )}

        {page === "reports" && (
          <div className="mt-4 grid gap-4 grid-cols-1 md:grid-cols-2">
            <Card c="rounded-lg"><p className="font-semibold">Burndown chart - Sprint 24</p><svg viewBox="0 0 400 180" className="mt-3 w-full"><line x1="20" y1="20" x2="380" y2="160" stroke="#C1C7D0" strokeDasharray="4" /><polyline fill="none" stroke="#0552CC" strokeWidth="3" points="20,20 70,34 120,44 170,70 220,78 270,104 320,112" />{[20, 70, 120, 170, 220, 270, 320].map((x, i) => <circle key={i} cx={x} cy={[20, 34, 44, 70, 78, 104, 112][i]} r="4" fill="#0552CC" />)}</svg><p className="text-xs text-slate-500">Guideline vs remaining story points</p></Card>
            <Card c="rounded-lg"><p className="font-semibold">Velocity</p><div className="mt-4 flex h-40 items-end gap-4">{[[28, 24], [32, 30], [30, 31], [35, 29], [34, 22]].map((v, i) => <div key={i} className="flex flex-1 items-end justify-center gap-1"><div className="w-4 rounded-t bg-slate-300" style={{ height: v[0] * 4 }} /><div className="w-4 rounded-t bg-[#0552CC]" style={{ height: v[1] * 4 }} /></div>)}</div><p className="mt-2 text-xs text-slate-500">Committed (grey) vs completed (blue) - Sprints 20 to 24</p></Card>
          </div>
        )}
      </div>

      {open && (
        <div className="fixed inset-0 z-[90] flex items-start justify-center overflow-y-auto bg-black/50 p-6" onClick={() => setOpen(null)}>
          <div className="w-full max-w-4xl rounded-lg bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-slate-200 p-4"><div className="flex items-center gap-2 text-sm text-slate-600"><span className="rounded bg-[#F3F0FF] px-1.5 text-xs font-bold text-[#5E4DB2]">{open.ep}</span>/<TI t={open.type} /><b>{open.k}</b></div><button onClick={() => setOpen(null)} className="rounded p-1.5 hover:bg-slate-100"><Ic n="x" /></button></div>
            <div className="grid gap-6 p-6 grid-cols-1 md:grid-cols-[1fr_280px]">
              <div><h2 className="text-2xl font-semibold">{open.t}</h2><div className="mt-3 flex gap-2"><Btn v="gray" sm icon="paperclip">Attach</Btn><Btn v="gray" sm icon="link">Link issue</Btn><Btn v="gray" sm icon="spark">Summarize with AI</Btn></div><p className="mt-5 font-semibold">Description</p><p className="mt-1 text-sm leading-6 text-slate-700">{open.d || "Add a description..."}</p><p className="mt-5 font-semibold">Activity</p><div className="mt-2 flex gap-3"><Av name="Gokul Raj" s={32} /><input placeholder="Add a comment..." className="h-10 flex-1 rounded border border-slate-300 px-3 text-sm outline-none" /></div><div className="mt-4 flex gap-3 text-sm"><Av name={open.as} s={32} /><div><p><b>{open.as}</b> <span className="text-xs text-slate-500">2 hours ago</span></p><p className="text-slate-700">Picked this up. Will open a PR once the reranker eval passes the threshold.</p></div></div></div>
              <div><select value={open.st} onChange={(e) => { move(open.k, e.target.value); setOpen({ ...open, st: e.target.value }); }} className="h-9 w-full rounded bg-[#E9F2FF] px-3 text-sm font-bold text-[#0552CC]">{COLS.map((c) => <option key={c[0]} value={c[0]}>{c[1]}</option>)}</select>
                <div className="mt-4 rounded-lg border border-slate-200 text-sm">{[["Assignee", open.as], ["Reporter", "Gokul Raj"], ["Priority", open.pri], ["Story points", String(open.sp)], ["Sprint", "Sprint 24"], ["Epic", open.ep]].map((r) => <div key={r[0]} className="flex justify-between border-b border-slate-100 p-3 last:border-0"><span className="text-slate-500">{r[0]}</span><span className="font-medium capitalize">{r[1]}</span></div>)}</div></div>
            </div>
          </div>
        </div>
      )}
      <Modal open={create} onClose={() => setCreate(false)} title="Create issue"><div className="space-y-3"><Field label="Issue type"><select className={inputCls}><option>Story</option><option>Bug</option><option>Task</option><option>Epic</option></select></Field><Field label="Summary"><input value={nt} onChange={(e) => setNt(e.target.value)} className={inputCls} placeholder="What needs to be done?" /></Field></div><div className="mt-5 flex justify-end gap-2"><Btn v="gray" onClick={() => setCreate(false)}>Cancel</Btn><Btn v="primary" onClick={add}>Create</Btn></div></Modal>
    </div>
  );
}
