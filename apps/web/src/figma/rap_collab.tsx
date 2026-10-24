import { useEffect, useState, type ReactNode } from "react";
import { Ic, Btn, Card, Tag, Modal, Field, inputCls, Notice } from "./rap_kit";
import api, { extractErrorMessage } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useApi, safeHref, timeAgo, statusOf } from "./live";

/* Collaboration screens: meetings, support, the assistant and milestone
   deliverables. All data is live; links from users go through safeHref and
   open with noopener so a destination page can never reach this app. */

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

function Empty({ icon, title, text }: { icon: string; title: string; text: string }) {
  return (
    <div className="v2-empty">
      <Ic n={icon} s={28} c="mx-auto" />
      <h3>{title}</h3>
      <p>{text}</p>
    </div>
  );
}

function Failed({ retry }: { retry: () => void }) {
  return (
    <Card c="text-center">
      <p className="text-sm text-slate-600">We couldn’t load this right now.</p>
      <Btn v="line" sm c="mt-3" onClick={retry}>
        Try again
      </Btn>
    </Card>
  );
}

const fmt = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
const human = (s: string) => s.charAt(0) + s.slice(1).toLowerCase().replace(/_/g, " ");

function openExternal(url: string | undefined) {
  const href = safeHref(url);
  if (href) window.open(href, "_blank", "noopener,noreferrer");
}

/* ---------------- Meetings ---------------- */

interface Meeting {
  id: string;
  organizer_id: string;
  title: string;
  agenda: string | null;
  starts_at: string;
  ends_at: string;
  provider: string;
  status: string;
  phase: "UPCOMING" | "JOINABLE" | "ENDED" | "CANCELLED";
  participants: { user_id: string; full_name: string | null; response: string }[];
}

const PHASE_TONE: Record<string, string> = { UPCOMING: "blue", JOINABLE: "green", ENDED: "gray", CANCELLED: "red" };

export function Meetings() {
  const { user } = useAuth();
  const [past, setPast] = useState(false);
  const q = useApi<Meeting[]>(user ? "/meetings" : null, { include_past: past });
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState("");
  const act = async (fn: () => Promise<unknown>, ok: string) => {
    try {
      await fn();
      setMsg(ok);
      q.reload();
    } catch (e) {
      setMsg(extractErrorMessage(e, "That didn’t work. Please try again."));
    }
  };
  const join = async (m: Meeting) => {
    try {
      const r = await api.get<{ url: string }>(`/meetings/${m.id}/join`);
      openExternal(r.data.url);
    } catch (e) {
      setMsg(extractErrorMessage(e, "You can’t join this meeting right now."));
    }
  };
  const rows = q.data ?? [];
  return (
    <Page
      title="Meetings"
      sub="Schedule calls with your connections and contract partners. Calls open in a separate tab."
      action={
        <Btn icon="plus" onClick={() => setOpen(true)}>
          Schedule meeting
        </Btn>
      }
    >
      {msg && <Notice text={msg} onDismiss={() => setMsg("")} />}
      <label className="mb-3 flex items-center gap-2 text-sm text-slate-600">
        <input type="checkbox" checked={past} onChange={(e) => setPast(e.target.checked)} /> Show past meetings
      </label>
      {!!q.error && !q.data ? (
        <Failed retry={q.reload} />
      ) : q.loading && !q.data ? (
        <p className="text-slate-500">Loading…</p>
      ) : rows.length === 0 ? (
        <Empty icon="calendar" title="No meetings yet" text="Schedule one with a connection or a contract partner." />
      ) : (
        <div className="grid gap-3">
          {rows.map((m) => {
            const mine = m.organizer_id === user?.id;
            const me = m.participants.find((p) => p.user_id === user?.id);
            return (
              <Card key={m.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-bold">{m.title}</h3>
                      <Tag t={PHASE_TONE[m.phase]}>{human(m.phase)}</Tag>
                      {m.provider === "EXTERNAL" && <Tag>External link</Tag>}
                    </div>
                    <p className="text-sm text-slate-600">
                      {fmt(m.starts_at)} – {new Date(m.ends_at).toLocaleTimeString(undefined, { timeStyle: "short" })}
                    </p>
                    <p className="mt-1 text-sm text-slate-500">
                      {m.participants.map((p) => `${p.full_name || "Member"} (${human(p.response)})`).join(", ")}
                    </p>
                    {m.agenda && <p className="mt-2 whitespace-pre-line text-sm">{m.agenda}</p>}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {m.phase === "JOINABLE" && me?.response !== "DECLINED" && (
                      <Btn sm icon="video" onClick={() => join(m)}>
                        Join
                      </Btn>
                    )}
                    {me && ["UPCOMING", "JOINABLE"].includes(m.phase) && (
                      <>
                        {me.response !== "ACCEPTED" && (
                          <Btn
                            sm
                            v="line"
                            onClick={() =>
                              act(
                                () => api.post(`/meetings/${m.id}/respond`, { response: "ACCEPTED" }),
                                "You accepted the meeting.",
                              )
                            }
                          >
                            Accept
                          </Btn>
                        )}
                        {me.response !== "DECLINED" && (
                          <Btn
                            sm
                            v="ghost"
                            onClick={() =>
                              act(
                                () => api.post(`/meetings/${m.id}/respond`, { response: "DECLINED" }),
                                "You declined the meeting.",
                              )
                            }
                          >
                            Decline
                          </Btn>
                        )}
                      </>
                    )}
                    {mine && ["UPCOMING", "JOINABLE"].includes(m.phase) && (
                      <Btn
                        sm
                        v="ghost"
                        onClick={() => act(() => api.post(`/meetings/${m.id}/cancel`), "Meeting cancelled.")}
                      >
                        Cancel
                      </Btn>
                    )}
                  </div>
                </div>
                {m.phase === "UPCOMING" && (
                  <p className="mt-2 text-xs text-slate-500">The join button appears 15 minutes before the start.</p>
                )}
              </Card>
            );
          })}
        </div>
      )}
      <ScheduleMeeting
        open={open}
        onClose={() => setOpen(false)}
        onDone={() => {
          setOpen(false);
          setMsg("Meeting scheduled and invitations sent.");
          q.reload();
        }}
      />
    </Page>
  );
}

function ScheduleMeeting({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const { user } = useAuth();
  const conns = useApi<any[]>(open && user ? "/connections" : null, { status: "ACCEPTED", limit: 200 });
  const [title, setTitle] = useState("");
  const [agenda, setAgenda] = useState("");
  const [when, setWhen] = useState("");
  const [mins, setMins] = useState("30");
  const [link, setLink] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [err, setErr] = useState("");
  const people = (conns.data ?? []).map((c) => (c.sender_id === user?.id ? c.receiver : c.sender)).filter(Boolean);
  const submit = async () => {
    setErr("");
    if (!title.trim() || !when || picked.length === 0) {
      setErr("Add a title, a start time and at least one person.");
      return;
    }
    const start = new Date(when);
    const end = new Date(start.getTime() + Number(mins) * 60000);
    try {
      await api.post("/meetings", {
        title,
        agenda: agenda || null,
        starts_at: start.toISOString(),
        ends_at: end.toISOString(),
        participant_ids: picked,
        external_url: link.trim() || null,
      });
      setTitle("");
      setAgenda("");
      setWhen("");
      setLink("");
      setPicked([]);
      onDone();
    } catch (e) {
      setErr(extractErrorMessage(e, "Couldn’t schedule the meeting."));
    }
  };
  return (
    <Modal open={open} onClose={onClose} title="Schedule a meeting">
      <div className="grid gap-3">
        <Field label="Title">
          <input className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={255} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Starts (your local time)">
            <input type="datetime-local" className={inputCls} value={when} onChange={(e) => setWhen(e.target.value)} />
          </Field>
          <Field label="Length">
            <select className={inputCls} value={mins} onChange={(e) => setMins(e.target.value)}>
              {["15", "30", "45", "60", "90", "120"].map((m) => (
                <option key={m} value={m}>
                  {m} minutes
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="Invite">
          {conns.loading && !conns.data ? (
            <p className="text-sm text-slate-500">Loading your connections…</p>
          ) : people.length === 0 ? (
            <p className="text-sm text-slate-500">You can invite people once you’re connected with them.</p>
          ) : (
            <div className="max-h-40 overflow-y-auto rounded-lg border border-slate-200 p-2">
              {people.map((p: any) => (
                <label key={p.id} className="flex items-center gap-2 py-1 text-sm">
                  <input
                    type="checkbox"
                    checked={picked.includes(p.id)}
                    onChange={(e) => setPicked((x) => (e.target.checked ? [...x, p.id] : x.filter((i) => i !== p.id)))}
                  />
                  {p.full_name || "Member"}
                </label>
              ))}
            </div>
          )}
        </Field>
        <Field label="Agenda (optional)">
          <textarea className={`${inputCls} h-20 py-2`} value={agenda} onChange={(e) => setAgenda(e.target.value)} />
        </Field>
        <Field label="Your own meeting link (optional, https)">
          <input
            className={inputCls}
            placeholder="Leave empty to get a free Jitsi Meet room"
            value={link}
            onChange={(e) => setLink(e.target.value)}
          />
        </Field>
        {err && (
          <p role="alert" className="text-sm text-red-600">
            {err}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Btn v="ghost" onClick={onClose}>
            Cancel
          </Btn>
          <Btn onClick={submit}>Schedule</Btn>
        </div>
      </div>
    </Modal>
  );
}

/* ---------------- Support ---------------- */

interface Ticket {
  id: string;
  subject: string;
  category: string;
  severity: string;
  status: string;
  created_at: string;
  updated_at: string;
}
interface TicketDetail {
  ticket: Ticket;
  messages: { id: string; body: string; from_staff: boolean; created_at: string }[];
}

const STATUS_TONE: Record<string, string> = {
  OPEN: "blue",
  IN_PROGRESS: "indigo",
  WAITING_ON_USER: "amber",
  RESOLVED: "green",
  CLOSED: "gray",
};

export function Support() {
  const { user } = useAuth();
  const list = useApi<Ticket[]>(user ? "/support/tickets" : null);
  const [sel, setSel] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState("");
  if (!user)
    return (
      <Page title="Support" sub="Sign in to contact support.">
        <Empty icon="question" title="Sign in to open a ticket" text="Browse the help center for common questions." />
      </Page>
    );
  return (
    <Page
      title="Support"
      sub="Ask our team for help. We reply here and notify you."
      action={
        <Btn icon="plus" onClick={() => setOpen(true)}>
          New ticket
        </Btn>
      }
    >
      {msg && <Notice text={msg} onDismiss={() => setMsg("")} />}
      <div className="grid gap-4 md:grid-cols-[320px_1fr]">
        <div className="grid content-start gap-2">
          {!!list.error && !list.data ? (
            <Failed retry={list.reload} />
          ) : (list.data ?? []).length === 0 ? (
            <Empty icon="question" title="No tickets" text="Open one if something isn’t working." />
          ) : (
            (list.data ?? []).map((t) => (
              <button
                key={t.id}
                onClick={() => setSel(t.id)}
                className={`rounded-xl border p-3 text-left ${sel === t.id ? "border-[#0552CC] bg-[#E8F0FC]" : "border-slate-200 bg-white"}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold">{t.subject}</span>
                  <Tag t={STATUS_TONE[t.status]}>{human(t.status)}</Tag>
                </div>
                <span className="text-xs text-slate-500">
                  {human(t.category)} · updated {timeAgo(t.updated_at)}
                </span>
              </button>
            ))
          )}
        </div>
        {sel ? (
          <TicketThread id={sel} onChange={list.reload} />
        ) : (
          <Card c="text-sm text-slate-500">Select a ticket to see the conversation.</Card>
        )}
      </div>
      <NewTicket
        open={open}
        onClose={() => setOpen(false)}
        onDone={(id) => {
          setOpen(false);
          setSel(id);
          setMsg("Ticket opened. We’ll reply here.");
          list.reload();
        }}
      />
    </Page>
  );
}

function TicketThread({ id, onChange }: { id: string; onChange: () => void }) {
  const q = useApi<TicketDetail>(`/support/tickets/${id}`);
  const [body, setBody] = useState("");
  const [err, setErr] = useState("");
  const send = async () => {
    if (!body.trim()) return;
    try {
      await api.post(`/support/tickets/${id}/messages`, { body });
      setBody("");
      q.reload();
      onChange();
    } catch (e) {
      setErr(extractErrorMessage(e, "Couldn’t send your reply."));
    }
  };
  const close = async () => {
    await api.post(`/support/tickets/${id}/close`).catch(() => undefined);
    q.reload();
    onChange();
  };
  if (q.error && !q.data) return <Failed retry={q.reload} />;
  if (!q.data) return <p className="text-slate-500">Loading…</p>;
  const t = q.data.ticket;
  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="font-bold">{t.subject}</h3>
          <p className="text-xs text-slate-500">
            {human(t.category)} · opened {fmt(t.created_at)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Tag t={STATUS_TONE[t.status]}>{human(t.status)}</Tag>
          {t.status !== "CLOSED" && (
            <Btn sm v="ghost" onClick={close}>
              Close ticket
            </Btn>
          )}
        </div>
      </div>
      <ol className="grid gap-2">
        {q.data.messages.map((m) => (
          <li key={m.id} className={`rounded-lg p-3 text-sm ${m.from_staff ? "bg-[#E8F0FC]" : "bg-slate-50"}`}>
            <p className="mb-1 text-xs font-semibold text-slate-500">
              {m.from_staff ? "Support team" : "You"} · {timeAgo(m.created_at)}
            </p>
            <p className="whitespace-pre-line">{m.body}</p>
          </li>
        ))}
      </ol>
      {t.status === "CLOSED" ? (
        <p className="mt-3 text-sm text-slate-500">This ticket is closed. Open a new one if you still need help.</p>
      ) : (
        <div className="mt-3 grid gap-2">
          <label className="sr-only" htmlFor="ticket-reply">
            Reply
          </label>
          <textarea
            id="ticket-reply"
            className={`${inputCls} h-24 py-2`}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            maxLength={10000}
            placeholder="Write a reply…"
          />
          {err && (
            <p role="alert" className="text-sm text-red-600">
              {err}
            </p>
          )}
          <div className="flex justify-end">
            <Btn sm onClick={send}>
              Send reply
            </Btn>
          </div>
        </div>
      )}
    </Card>
  );
}

function NewTicket({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: (id: string) => void }) {
  const [subject, setSubject] = useState("");
  const [category, setCategory] = useState("OTHER");
  const [body, setBody] = useState("");
  const [err, setErr] = useState("");
  const submit = async () => {
    try {
      const r = await api.post<TicketDetail>("/support/tickets", { subject, category, body });
      setSubject("");
      setBody("");
      onDone(r.data.ticket.id);
    } catch (e) {
      setErr(extractErrorMessage(e, "Couldn’t open the ticket."));
    }
  };
  return (
    <Modal open={open} onClose={onClose} title="Contact support">
      <div className="grid gap-3">
        <Field label="Subject">
          <input className={inputCls} value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={255} />
        </Field>
        <Field label="Topic">
          <select className={inputCls} value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="ACCOUNT">Account & sign-in</option>
            <option value="BUG">Something is broken</option>
            <option value="CONTRACT">Contracts & deliverables</option>
            <option value="SAFETY">Safety or abuse</option>
            <option value="OTHER">Something else</option>
          </select>
        </Field>
        <Field label="What happened?">
          <textarea className={`${inputCls} h-32 py-2`} value={body} onChange={(e) => setBody(e.target.value)} />
        </Field>
        <p className="text-xs text-slate-500">Never include passwords or one-time codes.</p>
        {err && (
          <p role="alert" className="text-sm text-red-600">
            {err}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Btn v="ghost" onClick={onClose}>
            Cancel
          </Btn>
          <Btn onClick={submit}>Send</Btn>
        </div>
      </div>
    </Modal>
  );
}

/* ---------------- Assistant ---------------- */

interface ChatOut {
  reply: string;
  tool: string | null;
  kind: "READ" | "DRAFT" | "WRITE" | null;
  result: Record<string, any> | null;
  pending_action: { id: string; summary: string; expires_at: string } | null;
}
interface Turn {
  role: "user" | "assistant";
  text: string;
  out?: ChatOut;
  actionState?: string;
}

export function Assistant({ go }: { go?: (r: string) => void }) {
  const { user } = useAuth();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  if (!user)
    return (
      <Page title="Assistant" sub="Sign in to use the assistant.">
        <Empty icon="spark" title="Sign in first" text="The assistant works with your own data and permissions." />
      </Page>
    );
  const send = async () => {
    const message = text.trim();
    if (!message || busy) return;
    setText("");
    setBusy(true);
    setTurns((t) => [...t, { role: "user", text: message }]);
    try {
      const r = await api.post<ChatOut>("/assistant/chat", { message });
      setTurns((t) => [...t, { role: "assistant", text: r.data.reply, out: r.data }]);
    } catch (e) {
      const s = statusOf(e);
      const fallback =
        s === 429 ? "You’ve reached the AI allowance for now." : "The assistant is unavailable right now.";
      setTurns((t) => [...t, { role: "assistant", text: extractErrorMessage(e, fallback) }]);
    } finally {
      setBusy(false);
    }
  };
  const decide = async (i: number, id: string, confirm: boolean) => {
    try {
      const r = await api.post(`/assistant/actions/${id}/${confirm ? "confirm" : "cancel"}`);
      const st = r.data.status as string;
      const res = r.data.result as Record<string, any> | null;
      const note =
        st === "EXECUTED"
          ? "Done."
          : st === "FAILED"
            ? `It didn’t work: ${res?.error ?? "unknown error"}`
            : "Cancelled.";
      setTurns((t) =>
        t.map((x, k) => (k === i ? { ...x, actionState: note, out: x.out && { ...x.out, result: res } } : x)),
      );
    } catch (e) {
      setTurns((t) =>
        t.map((x, k) => (k === i ? { ...x, actionState: extractErrorMessage(e, "Couldn’t complete that.") } : x)),
      );
    }
  };
  return (
    <Page
      title="Assistant"
      sub="Ask about your work. It acts only with your permissions and asks before changing anything."
    >
      <Card c="grid gap-3">
        {turns.length === 0 && (
          <div className="text-sm text-slate-500">
            Try: “Find React jobs”, “What are my open tasks?”, “Draft an intro message to a client”, or “Schedule a call
            tomorrow at 10:00 UTC”.
          </div>
        )}
        <ol className="grid gap-2" aria-live="polite">
          {turns.map((t, i) => (
            <li
              key={i}
              className={`rounded-lg p-3 text-sm ${t.role === "user" ? "ml-10 bg-slate-50" : "mr-10 bg-[#E8F0FC]"}`}
            >
              <p className="whitespace-pre-line">{t.text}</p>
              {t.out?.kind === "READ" && t.out.result && <ResultList result={t.out.result} go={go} />}
              {t.out?.kind === "DRAFT" && t.out.result?.draft && (
                <div className="mt-2 rounded border border-slate-200 bg-white p-2">
                  <p className="whitespace-pre-line">{t.out.result.draft}</p>
                  <Btn sm v="ghost" c="mt-1" onClick={() => navigator.clipboard?.writeText(t.out!.result!.draft)}>
                    Copy
                  </Btn>
                </div>
              )}
              {t.out?.pending_action && (
                <div className="mt-2 rounded border border-amber-300 bg-white p-2">
                  <p className="font-semibold">Confirm: {t.out.pending_action.summary}</p>
                  {t.actionState ? (
                    <p className="mt-1">
                      {t.actionState}{" "}
                      {t.out.result?.link && (
                        <a className="text-[#0552CC] underline" href={t.out.result.link}>
                          Open
                        </a>
                      )}
                    </p>
                  ) : (
                    <div className="mt-2 flex gap-2">
                      <Btn sm onClick={() => decide(i, t.out!.pending_action!.id, true)}>
                        Confirm
                      </Btn>
                      <Btn sm v="ghost" onClick={() => decide(i, t.out!.pending_action!.id, false)}>
                        Cancel
                      </Btn>
                    </div>
                  )}
                </div>
              )}
            </li>
          ))}
          {busy && <li className="mr-10 text-sm text-slate-500">Thinking…</li>}
        </ol>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
        >
          <label htmlFor="assistant-input" className="sr-only">
            Message the assistant
          </label>
          <input
            id="assistant-input"
            className={inputCls}
            value={text}
            maxLength={2000}
            onChange={(e) => setText(e.target.value)}
            placeholder="Ask anything about your jobs, tasks, contracts or meetings…"
          />
          <Btn icon="spark">Send</Btn>
        </form>
        <p className="text-xs text-slate-500">AI answers can be wrong. Uses your monthly AI allowance.</p>
      </Card>
    </Page>
  );
}

function ResultList({ result, go }: { result: Record<string, any>; go?: (r: string) => void }) {
  if (!result.ok) return <p className="mt-1 text-red-600">{result.error}</p>;
  const items = (result.items ?? []) as Record<string, string>[];
  if (!items.length) return <p className="mt-1 text-slate-500">Nothing found.</p>;
  return (
    <ul className="mt-2 grid gap-1">
      {items.map((it, k) => (
        <li key={k}>
          <button
            className="text-left text-[#0552CC] underline"
            onClick={() => go?.(String(it.link || "").replace(/^#/, ""))}
          >
            {it.title}
          </button>{" "}
          <span className="text-slate-500">
            {[it.company, it.status && human(it.status), it.priority].filter(Boolean).join(" · ")}
          </span>
        </li>
      ))}
    </ul>
  );
}

/* ---------------- Deliverables (shown on a contract) ---------------- */

interface Deliverable {
  id: string;
  milestone_id: string;
  kind: "CODE" | "DOCUMENT" | "DEMO";
  title: string;
  notes: string | null;
  version: number;
  status: string;
  review_note: string | null;
  repo_url: string | null;
  branch: string | null;
  commit_sha: string | null;
  file_name: string | null;
  file_size: number | null;
  demo_url: string | null;
  environment: string | null;
  created_at: string;
}

const DSTATUS: Record<string, string> = {
  SUBMITTED: "blue",
  CHANGES_REQUESTED: "amber",
  ACCEPTED: "green",
  WITHDRAWN: "gray",
};

export function Deliverables({
  contractId,
  party,
  active,
  milestones,
}: {
  contractId: string;
  party: "client" | "worker" | null;
  active: boolean;
  milestones: { id: string; title: string; status: string }[];
}) {
  const q = useApi<Deliverable[]>(party ? `/contracts/${contractId}/deliverables` : null);
  const [adding, setAdding] = useState<{ kind: string; supersedes?: Deliverable } | null>(null);
  const [msg, setMsg] = useState("");
  if (!party) return null;
  const review = async (d: Deliverable, decision: string) => {
    let note: string | null = null;
    if (decision === "CHANGES_REQUESTED") {
      note = window.prompt("What needs to change?") || "";
      if (!note.trim()) return;
    }
    try {
      await api.post(`/contracts/${contractId}/deliverables/${d.id}/review`, { decision, note });
      setMsg(decision === "ACCEPTED" ? "Deliverable accepted." : "Change request sent.");
      q.reload();
    } catch (e) {
      setMsg(extractErrorMessage(e, "Couldn’t save your review."));
    }
  };
  const download = async (d: Deliverable) => {
    try {
      const r = await api.get<{ url: string }>(`/contracts/${contractId}/deliverables/${d.id}/download`);
      openExternal(r.data.url);
    } catch (e) {
      setMsg(extractErrorMessage(e, "The file isn’t available right now."));
    }
  };
  const byMilestone = (id: string) => (q.data ?? []).filter((d) => d.milestone_id === id);
  return (
    <Card c="mt-4">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-lg font-bold">Deliverables</h3>
        {party === "worker" && active && (
          <div className="flex gap-2">
            <Btn sm v="line" icon="code" onClick={() => setAdding({ kind: "code" })}>
              Code commit
            </Btn>
            <Btn sm v="line" icon="file" onClick={() => setAdding({ kind: "document" })}>
              Document
            </Btn>
            <Btn sm v="line" icon="link" onClick={() => setAdding({ kind: "demo" })}>
              Demo link
            </Btn>
          </div>
        )}
      </div>
      <p className="mb-3 text-xs text-slate-500">
        Accepting a deliverable records your review only. Payment happens directly between you, outside the platform.
      </p>
      {msg && <Notice text={msg} onDismiss={() => setMsg("")} />}
      {!active && <p className="text-sm text-slate-500">Deliverables open once both parties have signed.</p>}
      {!!q.error && !q.data && <Failed retry={q.reload} />}
      {milestones.map((ms) => (
        <div key={ms.id} className="border-t border-slate-100 py-2">
          <p className="text-sm font-semibold">
            {ms.title} <Tag>{human(ms.status)}</Tag>
          </p>
          {byMilestone(ms.id).length === 0 ? (
            <p className="text-xs text-slate-500">Nothing submitted yet.</p>
          ) : (
            <ul className="mt-1 grid gap-2">
              {byMilestone(ms.id).map((d) => (
                <li key={d.id} className="rounded-lg bg-slate-50 p-2 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <Ic n={d.kind === "CODE" ? "code" : d.kind === "DOCUMENT" ? "file" : "link"} s={14} />
                    <strong>{d.title}</strong>
                    <span className="text-xs text-slate-500">v{d.version}</span>
                    <Tag t={DSTATUS[d.status]}>{human(d.status)}</Tag>
                  </div>
                  {d.kind === "CODE" && (
                    <p className="mt-1 font-mono text-xs break-all">
                      <a
                        className="text-[#0552CC] underline"
                        href={safeHref(`${d.repo_url}/commit/${d.commit_sha}`)}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {d.repo_url?.replace("https://github.com/", "")}@{d.commit_sha?.slice(0, 12)}
                      </a>
                      {d.branch && ` (${d.branch})`}
                    </p>
                  )}
                  {d.kind === "DOCUMENT" && (
                    <button className="mt-1 text-xs text-[#0552CC] underline" onClick={() => download(d)}>
                      Download {d.file_name} ({Math.ceil((d.file_size ?? 0) / 1024)} KB)
                    </button>
                  )}
                  {d.kind === "DEMO" && (
                    <p className="mt-1 text-xs">
                      {d.environment && <Tag>{d.environment}</Tag>}{" "}
                      <a
                        className="text-[#0552CC] underline break-all"
                        href={safeHref(d.demo_url)}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Open demo in a new tab
                      </a>
                    </p>
                  )}
                  {d.notes && <p className="mt-1 whitespace-pre-line text-xs">{d.notes}</p>}
                  {d.review_note && <p className="mt-1 text-xs text-amber-700">Review: {d.review_note}</p>}
                  <div className="mt-2 flex gap-2">
                    {party === "client" && d.status === "SUBMITTED" && (
                      <>
                        <Btn sm v="green" onClick={() => review(d, "ACCEPTED")}>
                          Accept
                        </Btn>
                        <Btn sm v="line" onClick={() => review(d, "CHANGES_REQUESTED")}>
                          Request changes
                        </Btn>
                      </>
                    )}
                    {party === "worker" && active && ["SUBMITTED", "CHANGES_REQUESTED"].includes(d.status) && (
                      <Btn sm v="ghost" onClick={() => setAdding({ kind: d.kind.toLowerCase(), supersedes: d })}>
                        Submit revision
                      </Btn>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
      {adding && (
        <SubmitDeliverable
          contractId={contractId}
          kind={adding.kind}
          supersedes={adding.supersedes}
          milestones={milestones.filter((m) => ["PENDING", "IN_PROGRESS", "DELIVERED"].includes(m.status))}
          onClose={() => setAdding(null)}
          onDone={() => {
            setAdding(null);
            setMsg("Deliverable submitted. The client has been notified.");
            q.reload();
          }}
        />
      )}
    </Card>
  );
}

function SubmitDeliverable({
  contractId,
  kind,
  supersedes,
  milestones,
  onClose,
  onDone,
}: {
  contractId: string;
  kind: string;
  supersedes?: Deliverable;
  milestones: { id: string; title: string }[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [milestone, setMilestone] = useState(supersedes?.milestone_id ?? milestones[0]?.id ?? "");
  const [title, setTitle] = useState(supersedes?.title ?? "");
  const [notes, setNotes] = useState("");
  const [repo, setRepo] = useState(supersedes?.repo_url ?? "");
  const [branch, setBranch] = useState(supersedes?.branch ?? "");
  const [sha, setSha] = useState("");
  const [url, setUrl] = useState(supersedes?.demo_url ?? "");
  const [env, setEnv] = useState(supersedes?.environment ?? "staging");
  const [file, setFile] = useState<File | null>(null);
  const [err, setErr] = useState("");
  const submit = async () => {
    setErr("");
    const base = `/contracts/${contractId}/deliverables`;
    const common = { milestone_id: milestone, title, notes: notes || null, supersedes_id: supersedes?.id ?? null };
    try {
      if (kind === "code")
        await api.post(`${base}/code`, { ...common, repo_url: repo, branch: branch || null, commit_sha: sha });
      else if (kind === "demo") await api.post(`${base}/demo`, { ...common, demo_url: url, environment: env || null });
      else {
        if (!file) {
          setErr("Choose a file.");
          return;
        }
        const form = new FormData();
        form.append("milestone_id", milestone);
        form.append("title", title);
        if (notes) form.append("notes", notes);
        if (supersedes) form.append("supersedes_id", supersedes.id);
        form.append("file", file);
        await api.post(`${base}/document`, form);
      }
      onDone();
    } catch (e) {
      setErr(extractErrorMessage(e, "Couldn’t submit the deliverable."));
    }
  };
  const label = kind === "code" ? "code commit" : kind === "demo" ? "demo link" : "document";
  return (
    <Modal open onClose={onClose} title={supersedes ? `Revise: ${supersedes.title}` : `Submit a ${label}`}>
      <div className="grid gap-3">
        {!supersedes && (
          <Field label="Milestone">
            <select className={inputCls} value={milestone} onChange={(e) => setMilestone(e.target.value)}>
              {milestones.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.title}
                </option>
              ))}
            </select>
          </Field>
        )}
        <Field label="Title">
          <input className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={255} />
        </Field>
        {kind === "code" && (
          <>
            <Field label="GitHub repository">
              <input
                className={inputCls}
                placeholder="https://github.com/owner/repo"
                value={repo}
                onChange={(e) => setRepo(e.target.value)}
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Branch (optional)">
                <input className={inputCls} value={branch} onChange={(e) => setBranch(e.target.value)} />
              </Field>
              <Field label="Full commit SHA">
                <input
                  className={`${inputCls} font-mono`}
                  value={sha}
                  onChange={(e) => setSha(e.target.value)}
                  maxLength={40}
                />
              </Field>
            </div>
            <p className="text-xs text-slate-500">The deliverable stays tied to this exact commit.</p>
          </>
        )}
        {kind === "demo" && (
          <>
            <Field label="Demo URL">
              <input className={inputCls} placeholder="https://" value={url} onChange={(e) => setUrl(e.target.value)} />
            </Field>
            <Field label="Environment">
              <input className={inputCls} value={env} onChange={(e) => setEnv(e.target.value)} maxLength={50} />
            </Field>
          </>
        )}
        {kind === "document" && (
          <Field label="File (PDF, DOCX, PPTX, XLSX, TXT, MD or CSV, up to 15 MB)">
            <input
              type="file"
              accept=".pdf,.docx,.pptx,.xlsx,.txt,.md,.csv"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="text-sm"
            />
          </Field>
        )}
        <Field label="Notes for the reviewer (optional)">
          <textarea className={`${inputCls} h-20 py-2`} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        {err && (
          <p role="alert" className="text-sm text-red-600">
            {err}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Btn v="ghost" onClick={onClose}>
            Cancel
          </Btn>
          <Btn onClick={submit}>Submit</Btn>
        </div>
      </div>
    </Modal>
  );
}

/* ---------------- Channels ---------------- */

interface ChannelRow {
  id: string;
  kind: "PROJECT" | "GROUP";
  name: string;
  topic: string | null;
  owner_id: string;
  muted: boolean;
  unread: number;
}
interface ChannelMsg {
  id: string;
  author_id: string | null;
  author_name: string | null;
  parent_id: string | null;
  body: string;
  reply_count: number;
  created_at: string;
}

const token = () =>
  (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`).replace(/-/g, "").slice(0, 32);

export function Channels() {
  const { user } = useAuth();
  const list = useApi<ChannelRow[]>(user ? "/channels" : null);
  const [sel, setSel] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  if (!user)
    return (
      <Page title="Channels" sub="Sign in to use channels.">
        <Empty icon="chat" title="Sign in first" text="Channels are for people who work together." />
      </Page>
    );
  const rows = list.data ?? [];
  const current = rows.find((c) => c.id === sel) ?? null;
  return (
    <Page
      title="Channels"
      sub="Group conversations with threads. Project channels include everyone on the project."
      action={
        <Btn icon="plus" onClick={() => setCreating(true)}>
          New channel
        </Btn>
      }
    >
      <div className="grid gap-4 md:grid-cols-[260px_1fr]">
        <nav aria-label="Channels" className="grid content-start gap-1">
          {!!list.error && !list.data && <Failed retry={list.reload} />}
          {list.data && rows.length === 0 && <p className="text-sm text-slate-500">No channels yet.</p>}
          {rows.map((c) => (
            <button
              key={c.id}
              onClick={() => setSel(c.id)}
              className={`flex items-center justify-between rounded-lg px-3 py-2 text-left text-sm ${sel === c.id ? "bg-[#E8F0FC] font-semibold" : "hover:bg-slate-100"}`}
            >
              <span>
                # {c.name} {c.muted && <span className="text-xs text-slate-400">(muted)</span>}
              </span>
              {c.unread > 0 && !c.muted && <Tag t="blue">{c.unread}</Tag>}
            </button>
          ))}
        </nav>
        {current ? (
          <ChannelView key={current.id} channel={current} onRead={list.reload} />
        ) : (
          <Card c="text-sm text-slate-500">Pick a channel.</Card>
        )}
      </div>
      {creating && (
        <NewChannel
          onClose={() => setCreating(false)}
          onDone={(id) => {
            setCreating(false);
            setSel(id);
            list.reload();
          }}
        />
      )}
    </Page>
  );
}

function ChannelView({ channel, onRead }: { channel: ChannelRow; onRead: () => void }) {
  const { user } = useAuth();
  const [thread, setThread] = useState<ChannelMsg | null>(null);
  const q = useApi<ChannelMsg[]>(`/channels/${channel.id}/messages`, thread ? { thread: thread.id } : undefined);
  const [body, setBody] = useState("");
  const [err, setErr] = useState("");
  const { reload } = q;
  // Poll every 15 s while the tab is visible; nothing while hidden.
  useEffect(() => {
    const t = window.setInterval(() => {
      if (document.visibilityState === "visible") reload();
    }, 15000);
    return () => window.clearInterval(t);
  }, [reload]);
  useEffect(() => {
    api
      .post(`/channels/${channel.id}/read`)
      .then(onRead)
      .catch(() => undefined);
  }, [channel.id, q.data?.length, onRead]);
  const send = async () => {
    const text = body.trim();
    if (!text) return;
    try {
      await api.post(`/channels/${channel.id}/messages`, {
        body: text,
        parent_id: thread?.id ?? null,
        client_token: token(),
      });
      setBody("");
      setErr("");
      q.reload();
    } catch (e) {
      setErr(extractErrorMessage(e, "Message not sent. Try again."));
    }
  };
  const mute = async () => {
    await api.post(`/channels/${channel.id}/mute`, { muted: !channel.muted }).catch(() => undefined);
    onRead();
  };
  return (
    <Card>
      <div className="mb-2 flex items-center justify-between gap-2">
        <div>
          <h3 className="font-bold">
            # {channel.name} {thread && <span className="font-normal text-slate-500">› thread</span>}
          </h3>
          {channel.topic && <p className="text-xs text-slate-500">{channel.topic}</p>}
        </div>
        <div className="flex gap-2">
          {thread && (
            <Btn sm v="ghost" onClick={() => setThread(null)}>
              Back to channel
            </Btn>
          )}
          <Btn sm v="ghost" onClick={mute}>
            {channel.muted ? "Unmute" : "Mute"}
          </Btn>
        </div>
      </div>
      {thread && (
        <div className="mb-2 rounded-lg bg-slate-50 p-2 text-sm">
          <b>{thread.author_name || "Member"}</b>: {thread.body}
        </div>
      )}
      {!!q.error && !q.data && <Failed retry={q.reload} />}
      <ol className="grid max-h-[50vh] gap-2 overflow-y-auto" aria-live="polite">
        {(q.data ?? []).map((m) => (
          <li
            key={m.id}
            className={`rounded-lg p-2 text-sm ${m.author_id === user?.id ? "bg-[#E8F0FC]" : "bg-slate-50"}`}
          >
            <p className="text-xs text-slate-500">
              <b className="text-slate-700">{m.author_name || "Former member"}</b> · {timeAgo(m.created_at)}
            </p>
            <p className="whitespace-pre-line">{m.body}</p>
            {!thread && (
              <button className="mt-1 text-xs text-[#0552CC] underline" onClick={() => setThread(m)}>
                {m.reply_count ? `${m.reply_count} repl${m.reply_count === 1 ? "y" : "ies"}` : "Reply in thread"}
              </button>
            )}
          </li>
        ))}
        {q.data?.length === 0 && <li className="text-sm text-slate-500">No messages yet.</li>}
      </ol>
      <form
        className="mt-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <label htmlFor="channel-input" className="sr-only">
          Message
        </label>
        <input
          id="channel-input"
          className={inputCls}
          value={body}
          maxLength={10000}
          onChange={(e) => setBody(e.target.value)}
          placeholder={thread ? "Reply in thread…" : `Message #${channel.name}`}
        />
        <Btn>Send</Btn>
      </form>
      {err && (
        <p role="alert" className="mt-1 text-sm text-red-600">
          {err}
        </p>
      )}
    </Card>
  );
}

function NewChannel({ onClose, onDone }: { onClose: () => void; onDone: (id: string) => void }) {
  const { user } = useAuth();
  const projects = useApi<any[]>("/projects");
  const conns = useApi<any[]>("/connections", { status: "ACCEPTED", limit: 200 });
  const [kind, setKind] = useState<"GROUP" | "PROJECT">("GROUP");
  const [name, setName] = useState("");
  const [topic, setTopic] = useState("");
  const [project, setProject] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [err, setErr] = useState("");
  const people = (conns.data ?? []).map((c) => (c.sender_id === user?.id ? c.receiver : c.sender)).filter(Boolean);
  const submit = async () => {
    try {
      const r = await api.post<ChannelRow>("/channels", {
        kind,
        name,
        topic: topic || null,
        project_id: kind === "PROJECT" ? project : null,
        member_ids: kind === "GROUP" ? picked : [],
      });
      onDone(r.data.id);
    } catch (e) {
      setErr(extractErrorMessage(e, "Couldn’t create the channel."));
    }
  };
  return (
    <Modal open onClose={onClose} title="New channel">
      <div className="grid gap-3">
        <Field label="Type">
          <select className={inputCls} value={kind} onChange={(e) => setKind(e.target.value as "GROUP" | "PROJECT")}>
            <option value="GROUP">Group — people you choose</option>
            <option value="PROJECT">Project — everyone on a project</option>
          </select>
        </Field>
        <Field label="Name">
          <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
        </Field>
        <Field label="Topic (optional)">
          <input className={inputCls} value={topic} onChange={(e) => setTopic(e.target.value)} maxLength={255} />
        </Field>
        {kind === "PROJECT" ? (
          <Field label="Project">
            <select className={inputCls} value={project} onChange={(e) => setProject(e.target.value)}>
              <option value="">Choose…</option>
              {(projects.data ?? []).map((p: any) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
            </select>
          </Field>
        ) : (
          <Field label="Members">
            {people.length === 0 ? (
              <p className="text-sm text-slate-500">Connect with people to add them.</p>
            ) : (
              <div className="max-h-40 overflow-y-auto rounded-lg border border-slate-200 p-2">
                {people.map((p: any) => (
                  <label key={p.id} className="flex items-center gap-2 py-1 text-sm">
                    <input
                      type="checkbox"
                      checked={picked.includes(p.id)}
                      onChange={(e) =>
                        setPicked((x) => (e.target.checked ? [...x, p.id] : x.filter((i) => i !== p.id)))
                      }
                    />
                    {p.full_name || "Member"}
                  </label>
                ))}
              </div>
            )}
          </Field>
        )}
        {err && (
          <p role="alert" className="text-sm text-red-600">
            {err}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Btn v="ghost" onClick={onClose}>
            Cancel
          </Btn>
          <Btn onClick={submit}>Create</Btn>
        </div>
      </div>
    </Modal>
  );
}
