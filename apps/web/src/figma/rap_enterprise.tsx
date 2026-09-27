import { useState, useEffect, type ReactNode } from "react";
import { Ic, Btn, Modal, TableScroll } from "./rap_kit";
import api, { extractErrorMessage } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useApi, goRoute } from "./live";
const go = (r: string) => {
  goRoute(r);
};
function Page({
  title,
  sub,
  action,
  children,
}: {
  title: string;
  sub: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="v2-page">
      <header className="v2-page-head">
        <div>
          <h1>{title}</h1>
          <p>{sub}</p>
        </div>
        {action}
      </header>
      {children}
    </div>
  );
}
function Metrics({ items }: { items: [string, string][] }) {
  return (
    <div className="v2-metrics">
      {items.map(([l, v]) => (
        <div className="v2-metric" key={l}>
          <span>{l}</span>
          <strong>{v}</strong>
        </div>
      ))}
    </div>
  );
}
function Empty() {
  return (
    <div className="v2-empty">
      <Ic n="search" s={28} c="mx-auto" />
      <h3>No results found</h3>
      <p>Try a different search or clear your filters.</p>
    </div>
  );
}
export function WorkLedger() {
  /* Live: your work-ledger entries across the projects you have tasks in; log time to a task. */ const { user } =
    useAuth();
  const tasksQ = useApi<any[]>(user ? "/projects/my-tasks" : null);
  const [rows, setRows] = useState<any[] | null>(null);
  const [tick, setTick] = useState(0);
  const [open, setOpen] = useState(false);
  const [task, setTask] = useState("");
  const [hours, setHours] = useState("1");
  const [note, setNote] = useState("");
  const [err, setErr] = useState("");
  const tasks = tasksQ.data ?? [];
  const title = (id: string) => tasks.find((t: any) => t.task.id === id)?.task.title || "Task";
  useEffect(() => {
    const pids = Array.from(new Set(tasks.map((t: any) => t.project_id)));
    if (!tasksQ.data) {
      return;
    }
    Promise.all(
      pids.map((p) =>
        api
          .get(`/projects/${p}/ledger`)
          .then((r) => r.data)
          .catch(() => []),
      ),
    ).then((all) =>
      setRows(
        all
          .flat()
          .filter((e: any) => e.worker_id === user?.id)
          .sort((a: any, b: any) => +new Date(b.created_at) - +new Date(a.created_at)),
      ),
    );
  }, [tasksQ.data, tick]); // eslint-disable-line react-hooks/exhaustive-deps
  const live = (rows ?? []).filter((r: any) => r.status !== "VOID");
  const total = live.reduce((a: number, r: any) => a + r.duration_minutes, 0) / 60;
  const submit = async (e: any) => {
    e.preventDefault();
    const h = Number(hours);
    if (!task || h <= 0 || h > 24) {
      setErr("Choose a task and enter between 0 and 24 hours.");
      return;
    }
    try {
      await api.post(`/projects/tasks/${task}/ledger`, {
        duration_minutes: Math.round(h * 60),
        description: note.trim() || "Logged from the work log",
      });
      setOpen(false);
      setNote("");
      setErr("");
      setTick(tick + 1);
    } catch (x) {
      setErr(extractErrorMessage(x, "Couldn't log that time."));
    }
  };
  return (
    <Page
      title="Work log"
      sub="A transparent record of time and delivery against your assigned tasks."
      action={
        <Btn icon="plus" onClick={() => setOpen(true)}>
          Log time
        </Btn>
      }
    >
      <Metrics
        items={[
          ["Logged hours", total.toFixed(1)],
          ["Entries", String(live.length)],
          ["Projects", String(new Set(live.map((r: any) => r.project_id)).size)],
        ]}
      />
      <div className="v2-table-wrap">
        <TableScroll label="Work log">
          <table className="v2-table">
            <thead>
              <tr>
                {["Date", "Task", "Notes", "Hours"].map((x) => (
                  <th key={x}>{x}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(rows ?? []).map((r: any) => (
                <tr key={r.id} className={r.status === "VOID" ? "opacity-50 line-through" : ""}>
                  <td>{new Date(r.created_at).toLocaleDateString()}</td>
                  <td>{title(r.task_id)}</td>
                  <td>
                    {r.description}
                    {r.status === "VOID" && r.void_reason ? ` (voided: ${r.void_reason})` : ""}
                  </td>
                  <td>{(r.duration_minutes / 60).toFixed(1)}</td>
                </tr>
              ))}
              {rows && !rows.length && (
                <tr>
                  <td colSpan={4}>No time logged yet.</td>
                </tr>
              )}
              {!rows && (
                <tr>
                  <td colSpan={4}>Loading…</td>
                </tr>
              )}
            </tbody>
          </table>
        </TableScroll>
      </div>
      <Modal open={open} onClose={() => setOpen(false)} title="Log work">
        <form onSubmit={submit}>
          <label className="v2-field">
            Task
            <select required value={task} onChange={(e) => setTask(e.target.value)}>
              <option value="">Choose a task…</option>
              {tasks.map((t: any) => (
                <option key={t.task.id} value={t.task.id}>
                  {t.task.title} — {t.project_title}
                </option>
              ))}
            </select>
          </label>
          <label className="v2-field">
            Hours
            <input
              type="number"
              min="0.25"
              max="24"
              step="0.25"
              required
              value={hours}
              onChange={(e) => setHours(e.target.value)}
            />
          </label>
          <label className="v2-field">
            What did you work on?
            <textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
          {err && (
            <p role="alert" className="text-sm text-red-600">
              {err}
            </p>
          )}
          <button className="auth-submit w-full" type="submit">
            Log time
          </button>
        </form>
      </Modal>
    </Page>
  );
}

export function HelpCenter() {
  const [q, setQ] = useState("");
  const articles = [
    [
      "How do I sign in?",
      "Enter your email and use the complete sign-in code. You can also continue with Google, Microsoft or GitHub.",
    ],
    [
      "What determines my match score?",
      "Skills contribute 40%, experience 25%, role 15%, timezone 8%, availability 7%, rate 3% and remote preference 2%. Review the explanation alongside your own judgment.",
    ],
    [
      "How do contracts work?",
      "Review the scope and milestones, then sign. Once either party signs, the terms can no longer be edited. The professional delivers each milestone and the company approves it. Payments are not processed through Remote AI Platform yet, so approving work does not move money.",
    ],
    [
      "Can I withdraw an application?",
      "You can withdraw an active application before it is accepted or rejected. Review the current status in Applications.",
    ],
    [
      "How do I import a resume?",
      "Choose AI Resume Import during onboarding. Supported resumes are PDF or DOCX up to 10 MB. Review extracted information and correct it before completing your profile.",
    ],
    [
      "How do I manage a company?",
      "Choose the hiring role at registration, complete the organization profile, then use Hiring to post jobs and review candidates.",
    ],
    [
      "Where do I report a problem?",
      "Use the report action on the relevant job, profile or community content. Administrators review reports in the moderation queue.",
    ],
    [
      "How do I contact support?",
      "Email contact@remoteaiplatform.com. Use the same address for privacy requests, such as a copy of your data or deleting your account.",
    ],
    [
      "How do I report abuse or a security issue?",
      "Use Report on the post, profile or job, or email contact@remoteaiplatform.com with details. Please don’t include passwords or codes.",
    ],
    ["Are there paid plans?", "Remote AI Platform is free to use today and has no paid subscription plans."],
  ];
  const results = articles.filter((a) => a.join(" ").toLowerCase().includes(q.toLowerCase()));
  return (
    <Page title="Help center" sub="Answers for your account, your opportunities and your work.">
      <div className="v2-toolbar">
        <input
          aria-label="Search help articles"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search help articles"
        />
      </div>
      <div className="v2-help-list">
        {results.map(([title, body]) => (
          <details key={title} className="border-b border-slate-200">
            <summary className="cursor-pointer py-3 font-semibold">{title}</summary>
            <p className="pb-3 text-slate-600">{body}</p>
          </details>
        ))}
        {!results.length && <Empty />}
      </div>
      <div className="v2-section mt-6">
        <h2>Manage your account</h2>
        <div className="v2-row-actions">
          <Btn v="outline" onClick={() => go("security")}>
            Security
          </Btn>
          <Btn v="outline" onClick={() => go("settings")}>
            Preferences
          </Btn>
          <Btn v="outline" onClick={() => go("login")}>
            Sign in
          </Btn>
        </div>
      </div>
    </Page>
  );
}
