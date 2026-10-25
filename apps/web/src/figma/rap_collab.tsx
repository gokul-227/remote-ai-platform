import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Ic, Btn, Card, Tag, Modal, Field, inputCls, Notice, cx } from "./rap_kit";
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
  const [inCall, setInCall] = useState<Meeting | null>(null);
  const join = (m: Meeting) => {
    if (typeof RTCPeerConnection === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      // Browsers without WebRTC use the external room.
      api
        .get<{ url: string }>(`/meetings/${m.id}/join`)
        .then((r) => openExternal(r.data.url))
        .catch((e) => setMsg(extractErrorMessage(e, "You can’t join this meeting right now.")));
      return;
    }
    setInCall(m);
  };
  const rows = q.data ?? [];
  return (
    <Page
      title="Meetings"
      sub="Schedule and hold video calls with your connections and contract partners, right here."
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
                    <ul className="mt-1 flex flex-wrap gap-2 text-sm text-slate-500">
                      {m.participants.map((p) => (
                        <li key={p.user_id}>
                          {p.full_name || "Member"} ({human(p.response)})
                          {mine && ["UPCOMING", "JOINABLE"].includes(m.phase) && (
                            <button
                              className="ml-1 text-xs text-red-600 underline"
                              aria-label={`Remove ${p.full_name || "member"} from ${m.title}`}
                              onClick={() =>
                                act(
                                  () => api.delete(`/meetings/${m.id}/participants/${p.user_id}`),
                                  "Participant removed.",
                                )
                              }
                            >
                              remove
                            </button>
                          )}
                        </li>
                      ))}
                    </ul>
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
      {inCall && <CallRoom meeting={inCall} onLeave={() => setInCall(null)} />}
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

export function AssistantChat({ go, compact }: { go?: (r: string) => void; compact?: boolean }) {
  const inputId = useId();
  const { user } = useAuth();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  if (!user)
    return <Empty icon="spark" title="Sign in first" text="The assistant works with your own data and permissions." />;
  const send = async () => {
    const message = text.trim();
    if (!message || busy) return;
    setText("");
    setBusy(true);
    setTurns((t) => [...t, { role: "user", text: message }]);
    try {
      const r = await api.post<ChatOut>("/assistant/chat", { message });
      setTurns((t) => [...t, { role: "assistant", text: r.data.reply, out: r.data }]);
      // "Take me to …" opens the screen right away.
      const target = r.data.tool === "open_screen" ? r.data.result?.items?.[0]?.link : null;
      if (typeof target === "string" && go) go(target.replace(/^#/, ""));
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
    <>
      <Card c={cx("grid gap-3", compact && "border-0 shadow-none")} p={compact ? "p-3" : true}>
        {turns.length === 0 && (
          <div className="text-sm text-slate-500">
            Try: “Find React jobs”, “Freelance work for me”, “Open my spreadsheets”, “Post that I’m hiring a designer”,
            “What are my open tasks?”, “Schedule a call tomorrow at 10:00 UTC”, or “Create a doc called Kickoff notes”.
          </div>
        )}
        <ol className={cx("grid gap-2", compact && "max-h-[50vh] overflow-y-auto")} aria-live="polite">
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
          <label htmlFor={inputId} className="sr-only">
            Message the assistant
          </label>
          <input
            id={inputId}
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
    </>
  );
}

export function Assistant({ go }: { go?: (r: string) => void }) {
  return (
    <Page
      title="AI assistant"
      sub="Ask about your work. It acts only with your permissions and asks before changing anything."
    >
      <AssistantChat go={go} />
    </Page>
  );
}

/** Messenger-style assistant bubble available on every page. */
export function AssistantDock({ go }: { go: (r: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rap-dock">
      {open && (
        <div className="rap-dock-panel" role="dialog" aria-label="AI assistant chat">
          <div className="rap-dock-head">
            <span className="rap-area-icon">
              <Ic n="spark" s={18} />
            </span>
            <div className="flex-1">
              <b>AI assistant</b>
              <p className="text-xs text-slate-500">Asks before changing anything</p>
            </div>
            <button
              aria-label="Open full screen"
              title="Open full screen"
              onClick={() => (setOpen(false), go("assistant"))}
            >
              <Ic n="layers" s={16} />
            </button>
            <button aria-label="Close chat" title="Close" onClick={() => setOpen(false)}>
              <Ic n="x" s={16} />
            </button>
          </div>
          <AssistantChat go={go} compact />
        </div>
      )}
      <button
        className="rap-dock-bubble"
        aria-label={open ? "Hide AI assistant" : "Chat with the AI assistant"}
        onClick={() => setOpen(!open)}
      >
        <Ic n={open ? "x" : "spark"} s={26} />
      </button>
    </div>
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
  commit_check: string | null;
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
  const [previewing, setPreviewing] = useState<Deliverable | null>(null);
  const [viewing, setViewing] = useState<Deliverable | null>(null);
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
                      {d.branch && ` (${d.branch})`}{" "}
                      {d.commit_check === "VERIFIED" && <Tag t="green">Found on GitHub</Tag>}
                      {d.commit_check === "NOT_FOUND" && <Tag t="amber">Not in a public repo</Tag>}
                      {d.commit_check === "UNVERIFIED" && <Tag>Not checked</Tag>}
                    </p>
                  )}
                  {d.kind === "DOCUMENT" && (
                    <button className="mt-1 text-xs text-[#0552CC] underline" onClick={() => download(d)}>
                      Download {d.file_name} ({Math.ceil((d.file_size ?? 0) / 1024)} KB)
                    </button>
                  )}
                  {d.kind === "DOCUMENT" && /\.(csv|txt|md)$/i.test(d.file_name ?? "") && (
                    <button className="ml-3 mt-1 text-xs text-[#0552CC] underline" onClick={() => setPreviewing(d)}>
                      Preview
                    </button>
                  )}
                  {d.kind === "DEMO" && (
                    <p className="mt-1 text-xs">
                      {d.environment && <Tag>{d.environment}</Tag>}{" "}
                      {canEmbed(d.demo_url) && (
                        <button className="mr-2 text-[#0552CC] underline" onClick={() => setViewing(d)}>
                          Open in demo viewer
                        </button>
                      )}
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
      {viewing && <DemoViewer deliverable={viewing} onClose={() => setViewing(null)} />}
      {previewing && (
        <PreviewModal contractId={contractId} deliverable={previewing} onClose={() => setPreviewing(null)} />
      )}
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
            <CommitPicker
              onPick={(r, b, c) => {
                setRepo(r);
                setBranch(b);
                setSha(c);
              }}
            />
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
  notify_level: "ALL" | "MENTIONS" | "NOTHING";
  unread: number;
}
interface ChannelMsg {
  id: string;
  author_id: string | null;
  author_name: string | null;
  parent_id: string | null;
  body: string;
  reply_count: number;
  reactions: Record<string, number>;
  my_reactions: string[];
  edited: boolean;
  deleted: boolean;
  created_at: string;
}

const QUICK_EMOJI = ["👍", "🎉", "❤️", "👀", "✅", "🙏", "😂", "🚀"];

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
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const msgAction = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
      setErr("");
      q.reload();
    } catch (e) {
      setErr(extractErrorMessage(e, "That didn’t work. Try again."));
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
          <select
            aria-label="Notify me about"
            className="rounded-lg border border-slate-200 px-2 text-sm"
            value={channel.notify_level}
            disabled={channel.muted}
            onChange={async (e) => {
              await api.post(`/channels/${channel.id}/notifications`, { level: e.target.value }).catch(() => undefined);
              onRead();
            }}
          >
            <option value="ALL">All new posts</option>
            <option value="MENTIONS">Just mentions</option>
            <option value="NOTHING">Nothing</option>
          </select>
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
            {m.deleted ? (
              <p className="italic text-slate-400">This message was deleted.</p>
            ) : editing === m.id ? (
              <form
                className="mt-1 flex gap-2"
                onSubmit={async (e) => {
                  e.preventDefault();
                  await msgAction(() => api.patch(`/channels/${channel.id}/messages/${m.id}`, { body: draft }));
                  setEditing(null);
                }}
              >
                <label className="sr-only" htmlFor={`edit-${m.id}`}>
                  Edit message
                </label>
                <input
                  id={`edit-${m.id}`}
                  className={inputCls}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                />
                <Btn sm>Save</Btn>
                <Btn sm v="ghost" onClick={() => setEditing(null)}>
                  Cancel
                </Btn>
              </form>
            ) : (
              <p className="whitespace-pre-line">
                {m.body} {m.edited && <span className="text-xs text-slate-400">(edited)</span>}
              </p>
            )}
            {!m.deleted && (
              <div className="mt-1 flex flex-wrap items-center gap-1">
                {Object.entries(m.reactions).map(([emoji, n]) => (
                  <button
                    key={emoji}
                    aria-pressed={m.my_reactions.includes(emoji)}
                    className={`rounded-full border px-2 text-xs ${m.my_reactions.includes(emoji) ? "border-[#0552CC] bg-white" : "border-slate-200"}`}
                    onClick={() =>
                      msgAction(() =>
                        m.my_reactions.includes(emoji)
                          ? api.delete(
                              `/channels/${channel.id}/messages/${m.id}/reactions/${encodeURIComponent(emoji)}`,
                            )
                          : api.put(`/channels/${channel.id}/messages/${m.id}/reactions/${encodeURIComponent(emoji)}`),
                      )
                    }
                  >
                    {emoji} {n}
                  </button>
                ))}
                <select
                  aria-label="Add a reaction"
                  className="rounded bg-transparent text-xs text-slate-500"
                  value=""
                  onChange={(e) =>
                    e.target.value &&
                    msgAction(() =>
                      api.put(
                        `/channels/${channel.id}/messages/${m.id}/reactions/${encodeURIComponent(e.target.value)}`,
                      ),
                    )
                  }
                >
                  <option value="">+ react</option>
                  {QUICK_EMOJI.map((e) => (
                    <option key={e} value={e}>
                      {e}
                    </option>
                  ))}
                </select>
                {m.author_id === user?.id && (
                  <button
                    className="text-xs text-slate-500 underline"
                    onClick={() => {
                      setDraft(m.body);
                      setEditing(m.id);
                    }}
                  >
                    edit
                  </button>
                )}
                {(m.author_id === user?.id || channel.owner_id === user?.id) && (
                  <button
                    className="text-xs text-red-600 underline"
                    onClick={() => msgAction(() => api.delete(`/channels/${channel.id}/messages/${m.id}`))}
                  >
                    delete
                  </button>
                )}
              </div>
            )}
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

/* ---------------- Document preview (text/CSV only; nothing is executed) ---------------- */

function PreviewModal({
  contractId,
  deliverable,
  onClose,
}: {
  contractId: string;
  deliverable: Deliverable;
  onClose: () => void;
}) {
  const q = useApi<{ kind: "text" | "table"; text?: string; rows?: string[][]; truncated: boolean }>(
    `/contracts/${contractId}/deliverables/${deliverable.id}/preview`,
  );
  return (
    <Modal open onClose={onClose} title={`Preview: ${deliverable.file_name}`} w="max-w-4xl">
      {!!q.error && <p className="text-sm text-red-600">Preview isn’t available; download the file instead.</p>}
      {!q.data && !q.error && <p className="text-sm text-slate-500">Loading…</p>}
      {q.data?.kind === "text" && (
        <pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap text-sm">{q.data.text}</pre>
      )}
      {q.data?.kind === "table" && (
        <div className="max-h-[60vh] overflow-auto">
          <table className="text-sm">
            <tbody>
              {q.data.rows!.map((r, i) => (
                <tr key={i} className={i === 0 ? "font-semibold" : ""}>
                  {r.map((c, j) => (
                    <td key={j} className="border border-slate-200 px-2 py-1">
                      {c}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {q.data?.truncated && (
        <p className="mt-2 text-xs text-slate-500">Showing the beginning only. Download for the full file.</p>
      )}
    </Modal>
  );
}

/* ---------------- Endorsements (on a professional's profile) ---------------- */

export function Endorsements({ userId, canEndorse }: { userId: string; canEndorse: boolean }) {
  const q = useApi<{ skill: string; count: number; endorsed_by_me: boolean }[]>(`/endorsements/${userId}`);
  const [err, setErr] = useState("");
  const toggle = async (skill: string, mine: boolean) => {
    try {
      if (mine) await api.delete(`/endorsements/${userId}/${encodeURIComponent(skill)}`);
      else await api.post("/endorsements", { user_id: userId, skill });
      setErr("");
      q.reload();
    } catch (e) {
      setErr(extractErrorMessage(e, "Couldn’t update the endorsement."));
    }
  };
  if (!q.data?.length) return null;
  return (
    <div className="mt-3">
      <h4 className="text-sm font-semibold text-slate-600">Endorsed skills</h4>
      <ul className="mt-1 flex flex-wrap gap-2">
        {q.data.map((s) => (
          <li
            key={s.skill}
            className="flex items-center gap-1 rounded-full border border-slate-200 px-2 py-0.5 text-sm"
          >
            <span className="capitalize">{s.skill}</span>
            <span className="text-xs text-slate-500">{s.count}</span>
            {canEndorse && (
              <button className="text-xs text-[#0552CC] underline" onClick={() => toggle(s.skill, s.endorsed_by_me)}>
                {s.endorsed_by_me ? "Withdraw" : "Endorse"}
              </button>
            )}
          </li>
        ))}
      </ul>
      {err && (
        <p role="alert" className="mt-1 text-xs text-red-600">
          {err}
        </p>
      )}
    </div>
  );
}

/* ---------------- Sprints (on the project board) ---------------- */

interface SprintRow {
  id: string;
  name: string;
  goal: string | null;
  status: "PLANNED" | "ACTIVE" | "COMPLETED";
}

export function SprintBar({ projectId, onChange }: { projectId: string; onChange: () => void }) {
  const q = useApi<SprintRow[]>(`/projects/${projectId}/sprints`);
  const [name, setName] = useState("");
  const [msg, setMsg] = useState("");
  const act = async (fn: () => Promise<{ data?: { returned_to_backlog?: number } }>, ok: string) => {
    try {
      const r = await fn();
      const back = r?.data?.returned_to_backlog;
      setMsg(back != null ? `${ok} ${back} unfinished item${back === 1 ? "" : "s"} moved to the backlog.` : ok);
      q.reload();
      onChange();
    } catch (e) {
      setMsg(extractErrorMessage(e, "That didn’t work."));
    }
  };
  const rows = (q.data ?? []).filter((s) => s.status !== "COMPLETED");
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
      {rows.map((s) => (
        <span key={s.id} className="flex items-center gap-1 rounded border border-slate-200 px-2 py-1">
          <b>{s.name}</b>
          <Tag t={s.status === "ACTIVE" ? "green" : "gray"}>{s.status === "ACTIVE" ? "Active" : "Planned"}</Tag>
          {s.status === "PLANNED" && (
            <button
              className="text-[#0552CC] underline"
              onClick={() => act(() => api.post(`/projects/sprints/${s.id}/start`), "Sprint started.")}
            >
              Start
            </button>
          )}
          {s.status === "ACTIVE" && (
            <button
              className="text-[#0552CC] underline"
              onClick={() => act(() => api.post(`/projects/sprints/${s.id}/complete`), "Sprint completed.")}
            >
              Complete
            </button>
          )}
        </span>
      ))}
      <form
        className="flex items-center gap-1"
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim()) return;
          act(() => api.post(`/projects/${projectId}/sprints`, { name }), "Sprint created.");
          setName("");
        }}
      >
        <label className="sr-only" htmlFor="new-sprint">
          New sprint name
        </label>
        <input
          id="new-sprint"
          className="h-8 rounded border border-slate-300 px-2"
          placeholder="New sprint"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <Btn sm v="line">
          Add sprint
        </Btn>
      </form>
      {msg && <span className="text-xs text-slate-500">{msg}</span>}
    </div>
  );
}

/* ---------------- Demo viewer: an in-app browser for live demos ---------------- */

/** Only https pages on other sites are embedded; our own domains never are. */
export function canEmbed(url: string | null | undefined): boolean {
  const href = safeHref(url);
  if (!href) return false;
  const u = new URL(href);
  return u.protocol === "https:" && !/(^|\.)remoteaiplatform\.com$/i.test(u.hostname);
}

function DemoViewer({ deliverable, onClose }: { deliverable: Deliverable; onClose: () => void }) {
  const href = safeHref(deliverable.demo_url)!;
  const [key, setKey] = useState(0);
  return (
    <Modal open onClose={onClose} title={deliverable.title} w="max-w-6xl">
      <div className="mb-2 flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-sm">
        <Ic n="shield" s={14} />
        <span className="flex-1 truncate font-mono text-xs" title={href}>
          {href}
        </span>
        {deliverable.environment && <Tag>{deliverable.environment}</Tag>}
        <Btn sm v="ghost" onClick={() => setKey((k) => k + 1)}>
          Reload
        </Btn>
        <Btn sm v="line" onClick={() => openExternal(href)}>
          Open in new tab
        </Btn>
      </div>
      <iframe
        key={key}
        src={href}
        title={`Live demo: ${deliverable.title}`}
        className="h-[65vh] w-full rounded-lg border border-slate-200 bg-white"
        sandbox="allow-scripts allow-forms allow-same-origin allow-popups allow-popups-to-escape-sandbox"
        referrerPolicy="no-referrer"
        allow=""
      />
      <p className="mt-2 text-xs text-slate-500">
        The demo runs in an isolated frame and can’t see your account. If it stays blank, the site doesn’t allow
        embedding: use “Open in new tab”.
      </p>
    </Modal>
  );
}

/* ---------------- GitHub (the user's own account) ---------------- */

interface GhStatus {
  configured: boolean;
  connected: boolean;
  login: string | null;
  private_access: boolean;
}

export function GithubConnect() {
  const q = useApi<GhStatus>("/github/status");
  const [err, setErr] = useState("");
  const result = typeof window !== "undefined" ? /github=([a-z]+)/.exec(window.location.hash)?.[1] : undefined;
  const connect = async (access: "public" | "private") => {
    try {
      const r = await api.post<{ authorize_url: string }>(`/github/connect?access=${access}`);
      const href = safeHref(r.data.authorize_url);
      if (href && new URL(href).hostname === "github.com") window.location.assign(href);
    } catch (e) {
      setErr(extractErrorMessage(e, "Couldn’t start the GitHub connection."));
    }
  };
  const s = q.data;
  return (
    <div>
      <h2>Connected accounts</h2>
      <p className="mt-1 text-sm text-slate-600">
        Connect GitHub to pick commits for code deliverables and verify private repositories.
      </p>
      {result === "connected" && (
        <p className="mt-3 rounded-lg bg-emerald-50 p-2 text-sm text-emerald-800">GitHub connected.</p>
      )}
      {result && result !== "connected" && (
        <p className="mt-3 rounded-lg bg-amber-50 p-2 text-sm text-amber-800">
          The GitHub connection didn’t finish ({result}). Try again.
        </p>
      )}
      <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 p-4">
        <Ic n="code" s={22} />
        <div className="flex-1">
          <b>GitHub</b>
          <p className="text-sm text-slate-500">
            {!s
              ? "Checking…"
              : !s.configured
                ? "Not available on this server yet."
                : s.connected
                  ? `Connected as @${s.login}${s.private_access ? " · private repositories allowed" : " · public repositories only"}`
                  : "Not connected"}
          </p>
        </div>
        {s?.configured && !s.connected && (
          <>
            <Btn sm onClick={() => connect("public")}>
              Connect (public repos)
            </Btn>
            <Btn sm v="line" onClick={() => connect("private")}>
              Connect incl. private
            </Btn>
          </>
        )}
        {s?.connected && (
          <Btn
            sm
            v="line"
            onClick={async () => {
              await api.delete("/github/connection").catch(() => undefined);
              q.reload();
            }}
          >
            Disconnect
          </Btn>
        )}
      </div>
      {err && (
        <p role="alert" className="mt-2 text-sm text-red-600">
          {err}
        </p>
      )}
    </div>
  );
}

function CommitPicker({ onPick }: { onPick: (repo: string, branch: string, sha: string) => void }) {
  const status = useApi<GhStatus>("/github/status");
  const connected = !!status.data?.connected;
  const repos = useApi<{ full_name: string; html_url: string; default_branch: string; private: boolean }[]>(
    connected ? "/github/repos" : null,
  );
  const [repo, setRepo] = useState("");
  const chosen = (repos.data ?? []).find((r) => r.full_name === repo);
  const commits = useApi<{ sha: string; message: string; date: string }[]>(
    chosen ? `/github/repos/${chosen.full_name}/commits` : null,
    chosen ? { branch: chosen.default_branch } : undefined,
  );
  if (!connected)
    return (
      <p className="text-xs text-slate-500">
        Tip: connect GitHub in Settings → Connected accounts to pick a commit instead of pasting it.
      </p>
    );
  return (
    <div className="grid gap-2 rounded-lg border border-slate-200 p-2">
      <Field label="Pick from your GitHub">
        <select className={inputCls} value={repo} onChange={(e) => setRepo(e.target.value)}>
          <option value="">Choose a repository…</option>
          {(repos.data ?? []).map((r) => (
            <option key={r.full_name} value={r.full_name}>
              {r.full_name} {r.private ? "(private)" : ""}
            </option>
          ))}
        </select>
      </Field>
      {chosen && (
        <ul className="max-h-40 overflow-y-auto text-xs">
          {(commits.data ?? []).map((c) => (
            <li key={c.sha}>
              <button
                type="button"
                className="w-full rounded p-1 text-left hover:bg-slate-50"
                onClick={() => onPick(chosen.html_url, chosen.default_branch, c.sha)}
              >
                <span className="font-mono">{c.sha.slice(0, 8)}</span> {c.message}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ---------------- In-app calls (WebRTC, browser to browser) ---------------- */

interface Signal {
  id: number;
  kind: "JOIN" | "LEAVE" | "OFFER" | "ANSWER" | "ICE";
  from_user_id: string;
  from_name: string | null;
  payload: any;
}

function VideoTile({ stream, name, muted }: { stream: MediaStream | null; name: string; muted?: boolean }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (ref.current && ref.current.srcObject !== stream) ref.current.srcObject = stream;
  }, [stream]);
  return (
    <div className="relative aspect-video overflow-hidden rounded-xl bg-slate-900">
      <video ref={ref} autoPlay playsInline muted={muted} className="h-full w-full object-cover" />
      <span className="absolute bottom-2 left-2 rounded bg-black/60 px-2 py-0.5 text-xs text-white">{name}</span>
    </div>
  );
}

export function CallRoom({ meeting, onLeave }: { meeting: Meeting; onLeave: () => void }) {
  const { user } = useAuth();
  const me = user?.id ?? "";
  const [local, setLocal] = useState<MediaStream | null>(null);
  const [remotes, setRemotes] = useState<Record<string, { stream: MediaStream; name: string }>>({});
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [sharing, setSharing] = useState(false);
  const [problem, setProblem] = useState("");
  const [failed, setFailed] = useState(false);
  const peers = useRef<Record<string, RTCPeerConnection>>({});
  const names = useRef<Record<string, string>>({});
  const ice = useRef<RTCIceServer[]>([{ urls: ["stun:stun.l.google.com:19302"] }]);
  const localRef = useRef<MediaStream | null>(null);
  const base = `/meetings/${meeting.id}/signals`;

  const send = useCallback(
    (kind: Signal["kind"], to: string | null, payload?: unknown) =>
      api.post(base, { kind, to_user_id: to, payload: payload ?? null }).catch(() => undefined),
    [base],
  );

  const peer = useCallback(
    (other: string) => {
      if (peers.current[other]) return peers.current[other];
      const pc = new RTCPeerConnection({ iceServers: ice.current });
      localRef.current?.getTracks().forEach((t) => pc.addTrack(t, localRef.current!));
      pc.onicecandidate = (e) => e.candidate && send("ICE", other, e.candidate.toJSON());
      pc.ontrack = (e) =>
        setRemotes((r) => ({ ...r, [other]: { stream: e.streams[0], name: names.current[other] || "Participant" } }));
      pc.onconnectionstatechange = () => {
        if (pc.connectionState === "failed") setFailed(true);
        if (["closed", "disconnected"].includes(pc.connectionState))
          setRemotes((r) => {
            const next = { ...r };
            delete next[other];
            return next;
          });
      };
      peers.current[other] = pc;
      return pc;
    },
    [send],
  );

  useEffect(() => {
    let live = true;
    let cursor = 0;
    let timer: number | undefined;
    const handle = async (s: Signal) => {
      names.current[s.from_user_id] = s.from_name || "Participant";
      if (s.kind === "JOIN") {
        // Whoever is already in the call calls the newcomer.
        const pc = peer(s.from_user_id);
        await pc.setLocalDescription(await pc.createOffer());
        await send("OFFER", s.from_user_id, pc.localDescription);
      } else if (s.kind === "OFFER") {
        const pc = peer(s.from_user_id);
        const collision = pc.signalingState !== "stable";
        const polite = me > s.from_user_id;
        if (collision && !polite) return;
        if (collision) await pc.setLocalDescription({ type: "rollback" });
        await pc.setRemoteDescription(s.payload);
        await pc.setLocalDescription(await pc.createAnswer());
        await send("ANSWER", s.from_user_id, pc.localDescription);
      } else if (s.kind === "ANSWER") {
        const pc = peers.current[s.from_user_id];
        if (pc && pc.signalingState === "have-local-offer") await pc.setRemoteDescription(s.payload);
      } else if (s.kind === "ICE") {
        await peers.current[s.from_user_id]?.addIceCandidate(s.payload).catch(() => undefined);
      } else if (s.kind === "LEAVE") {
        peers.current[s.from_user_id]?.close();
        delete peers.current[s.from_user_id];
        setRemotes((r) => {
          const next = { ...r };
          delete next[s.from_user_id];
          return next;
        });
      }
    };
    const poll = async () => {
      try {
        const r = await api.get<{ signals: Signal[]; cursor: number; ice_servers: RTCIceServer[] }>(base, {
          params: { after: cursor },
        });
        ice.current = r.data.ice_servers;
        cursor = r.data.cursor;
        for (const s of r.data.signals) await handle(s).catch(() => undefined);
      } catch (e) {
        if (statusOf(e) === 409) setProblem("This call has ended.");
      }
      if (live) timer = window.setTimeout(poll, document.visibilityState === "visible" ? 1000 : 3000);
    };
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
        if (!live) return stream.getTracks().forEach((t) => t.stop());
        localRef.current = stream;
        setLocal(stream);
      } catch {
        try {
          const audio = await navigator.mediaDevices.getUserMedia({ audio: true });
          localRef.current = audio;
          setLocal(audio);
          setCamOn(false);
          setProblem("Camera unavailable: you joined with audio only.");
        } catch {
          setProblem(
            "Allow microphone (and camera) access in your browser, then rejoin. You can still listen and watch.",
          );
        }
      }
      // Skip anything sent before we arrived, then announce ourselves.
      try {
        const r = await api.get<{ cursor: number }>(base, { params: { after: 0 } });
        cursor = r.data.cursor;
      } catch {
        /* handled by poll */
      }
      await send("JOIN", null);
      poll();
    })();
    const leave = () => send("LEAVE", null);
    window.addEventListener("beforeunload", leave);
    return () => {
      live = false;
      window.clearTimeout(timer);
      window.removeEventListener("beforeunload", leave);
      leave();
      Object.values(peers.current).forEach((pc) => pc.close());
      peers.current = {};
      localRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, [base, me, peer, send]);

  const toggleMic = () => {
    localRef.current?.getAudioTracks().forEach((t) => (t.enabled = !micOn));
    setMicOn(!micOn);
  };
  const toggleCam = () => {
    localRef.current?.getVideoTracks().forEach((t) => (t.enabled = !camOn));
    setCamOn(!camOn);
  };
  const replaceVideo = (track: MediaStreamTrack | null) =>
    Object.values(peers.current).forEach((pc) =>
      pc
        .getSenders()
        .find((s) => s.track?.kind === "video")
        ?.replaceTrack(track),
    );
  const toggleShare = async () => {
    if (sharing) {
      replaceVideo(localRef.current?.getVideoTracks()[0] ?? null);
      setSharing(false);
      return;
    }
    try {
      const screen = await navigator.mediaDevices.getDisplayMedia({ video: true });
      const track = screen.getVideoTracks()[0];
      replaceVideo(track);
      setSharing(true);
      track.onended = () => {
        replaceVideo(localRef.current?.getVideoTracks()[0] ?? null);
        setSharing(false);
      };
    } catch {
      setProblem("Screen sharing was cancelled or isn’t supported in this browser.");
    }
  };
  const fallback = async () => {
    try {
      const r = await api.get<{ url: string }>(`/meetings/${meeting.id}/join`);
      openExternal(r.data.url);
    } catch (e) {
      setProblem(extractErrorMessage(e, "The backup room isn’t available."));
    }
  };
  const tiles = Object.entries(remotes);
  return (
    <Modal open onClose={onLeave} title={`Call: ${meeting.title}`} w="max-w-5xl">
      {problem && <p className="mb-2 rounded-lg bg-amber-50 p-2 text-sm text-amber-800">{problem}</p>}
      {failed && (
        <p className="mb-2 rounded-lg bg-amber-50 p-2 text-sm text-amber-800">
          Your networks can’t connect directly (common on strict office Wi-Fi).{" "}
          <button className="font-semibold underline" onClick={fallback}>
            Join the backup room instead
          </button>
          .
        </p>
      )}
      <div className={`grid gap-2 ${tiles.length ? "md:grid-cols-2" : ""}`}>
        <VideoTile stream={local} name={`You${micOn ? "" : " (muted)"}${sharing ? " · sharing screen" : ""}`} muted />
        {tiles.map(([id, t]) => (
          <VideoTile key={id} stream={t.stream} name={t.name} />
        ))}
      </div>
      {!tiles.length && <p className="mt-2 text-sm text-slate-500">Waiting for others to join…</p>}
      <div className="mt-3 flex flex-wrap justify-center gap-2">
        <Btn v={micOn ? "line" : "danger"} onClick={toggleMic}>
          {micOn ? "Mute" : "Unmute"}
        </Btn>
        <Btn v={camOn ? "line" : "danger"} onClick={toggleCam}>
          {camOn ? "Stop video" : "Start video"}
        </Btn>
        <Btn v={sharing ? "primary" : "line"} onClick={toggleShare}>
          {sharing ? "Stop sharing" : "Share screen"}
        </Btn>
        <Btn v="ghost" onClick={fallback}>
          Backup room
        </Btn>
        <Btn v="danger" onClick={onLeave}>
          Leave call
        </Btn>
      </div>
      <p className="mt-2 text-center text-xs text-slate-500">
        Audio and video go directly between browsers; nothing is recorded or stored.
      </p>
    </Modal>
  );
}
