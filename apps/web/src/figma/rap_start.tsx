import { useState, type ReactNode } from "react";
import { useAuth } from "@/lib/auth";
import { useApi, goRoute, timeAgo } from "./live";
import { Ic, Av, Btn, Card, Tag, cx } from "./rap_kit";
import { catalog } from "./rap_shell";

/**
 * Home after sign-in: what needs attention (jobs for you, messages, network,
 * projects, files, meetings), a getting-started checklist for new members and
 * a directory of every area so nothing is hidden behind the menu.
 */
type Conn = { id: string; status: string; sender_id: string; receiver_id: string };
type Conv = {
  id: string;
  participant_one_id: string;
  participant_two_id: string;
  unread_count?: number;
  other_participant?: { full_name?: string };
  last_message?: { content?: string; created_at?: string } | null;
};
type Rec = { id: string; overall_score?: number; job?: { id: string; title: string; company_name?: string | null } };
type Named = { id: string; name?: string; title?: string; updated_at?: string; starts_at?: string };

const ASSISTANT_KEY = "rap-tried-assistant";
const HIDE_KEY = "rap-hide-checklist";
const read = (k: string) => {
  try {
    return localStorage.getItem(k) === "1";
  } catch {
    return false;
  }
};
const remember = (k: string) => {
  try {
    localStorage.setItem(k, "1");
  } catch {}
};

function Tile({
  title,
  icon,
  to,
  action,
  children,
}: {
  title: string;
  icon: string;
  to: string;
  action: string;
  children: ReactNode;
}) {
  return (
    <Card c="flex flex-col rounded-xl">
      <div className="mb-2 flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-soft text-brand">
          <Ic n={icon} s={16} />
        </span>
        <h2 className="text-base font-bold">{title}</h2>
      </div>
      <div className="flex-1 text-sm text-slate-600">{children}</div>
      <Btn v="outline" sm c="mt-3 self-start px-3 py-1.5" onClick={() => goRoute(to)}>
        {action}
      </Btn>
    </Card>
  );
}

const Line = ({ children, onClick }: { children: ReactNode; onClick: () => void }) => (
  <button onClick={onClick} className="flex w-full items-center gap-2 truncate py-1 text-left hover:underline">
    {children}
  </button>
);

export function Home() {
  const { user } = useAuth();
  const profile = useApi<{ headline?: string | null }>(user ? "/engineers/me" : null);
  const conns = useApi<Conn[]>(user ? "/connections" : null, { limit: 200 });
  const convs = useApi<Conv[]>(user ? "/conversations" : null);
  const recs = useApi<Rec[]>(profile.data ? "/matching/recommendations" : null, { limit: 3 });
  const projects = useApi<Named[]>(user ? "/projects" : null);
  const files = useApi<Named[]>(user ? "/files" : null, { view: "recent", sort: "modified" });
  const groups = useApi<Named[]>(user ? "/groups/me/joined" : null);
  const meetings = useApi<Named[]>(user ? "/meetings" : null);
  const saved = useApi<unknown[]>(user ? "/saved-jobs" : null, { limit: 100 });
  const [hidden, setHidden] = useState(() => read(HIDE_KEY));
  const [triedAssistant, setTried] = useState(() => read(ASSISTANT_KEY));

  const all = conns.data ?? [];
  const accepted = all.filter((c) => c.status === "ACCEPTED").length;
  const invites = all.filter((c) => c.status === "PENDING" && c.receiver_id === user?.id).length;
  const unread = (convs.data ?? []).reduce((n, c) => n + (c.unread_count || 0), 0);
  const first = (user?.full_name || "").split(" ")[0];

  const steps: [done: boolean, label: string, route: string, extra?: () => void][] = [
    [!!profile.data, "Create your professional profile", "onboarding"],
    [(saved.data ?? []).length > 0, "Save a job you like", "jobs"],
    [all.length > 0, "Connect with someone", "suggestions"],
    [(groups.data ?? []).length > 0, "Join a community", "groups"],
    [(projects.data ?? []).length > 0, "Start a project board", "projects"],
    [(files.data ?? []).length > 0, "Upload or create a file", "files"],
    [
      triedAssistant,
      "Ask the AI assistant",
      "assistant",
      () => {
        remember(ASSISTANT_KEY);
        setTried(true);
      },
    ],
  ];
  const loaded = !profile.loading && !conns.loading && !projects.loading;
  const done = steps.filter((s) => s[0]).length;
  const showChecklist = loaded && !hidden && done < steps.length;
  const upcoming = (meetings.data ?? []).filter((m) => m.starts_at && new Date(m.starts_at) > new Date()).slice(0, 2);

  return (
    <div className="bg-[#F0F2F5] py-6">
      <div className="mx-auto max-w-[1100px] px-4">
        <header className="mb-4">
          <h1 className="text-2xl font-bold text-slate-900">{first ? `Welcome, ${first}` : "Welcome"}</h1>
          <p className="text-sm text-slate-500">Your jobs, conversations, network and work in one place.</p>
        </header>

        {showChecklist && (
          <Card c="mb-4 rounded-xl">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-base font-bold">Get started</h2>
                <p className="text-sm text-slate-500">
                  {done} of {steps.length} done
                </p>
              </div>
              <Btn
                v="ghost"
                sm
                c="px-2 py-1"
                onClick={() => {
                  remember(HIDE_KEY);
                  setHidden(true);
                }}
              >
                Hide
              </Btn>
            </div>
            <ol aria-label="Getting started" className="mt-3 grid gap-1 sm:grid-cols-2">
              {steps.map(([ok, label, route, extra]) => (
                <li key={label}>
                  <button
                    onClick={() => {
                      extra?.();
                      goRoute(route);
                    }}
                    className={cx(
                      "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-slate-50",
                      ok && "text-slate-400 line-through",
                    )}
                  >
                    <Ic n={ok ? "check" : "right"} s={16} c={ok ? "text-emerald-600" : "text-brand"} />
                    {label}
                  </button>
                </li>
              ))}
            </ol>
          </Card>
        )}

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Tile title="Jobs for you" icon="briefcase" to={profile.data ? "recs" : "jobs"} action="Find jobs">
            {!profile.data ? (
              <p>Create a profile to get roles matched to your skills, or browse every remote job now.</p>
            ) : (recs.data ?? []).filter((m) => m.job).length ? (
              (recs.data ?? [])
                .filter((m) => m.job)
                .map((m) => (
                  <Line
                    key={m.id}
                    onClick={() => {
                      localStorage.setItem("rap-selected-job", m.job!.id);
                      goRoute("jobs");
                    }}
                  >
                    <span className="flex-1 truncate">
                      <b>{m.job!.title}</b> {m.job!.company_name ? `· ${m.job!.company_name}` : ""}
                    </span>
                    {m.overall_score != null && <Tag t="blue">{Math.round(m.overall_score)}%</Tag>}
                  </Line>
                ))
            ) : (
              <p>No matches yet. Add skills and preferences, and matches appear as jobs arrive.</p>
            )}
          </Tile>
          <Tile title="Messages" icon="chat" to="messenger" action="Open chats">
            {(convs.data ?? []).length ? (
              <>
                <p className="mb-1 font-semibold">{unread ? `${unread} unread` : "You're all caught up"}</p>
                {(convs.data ?? []).slice(0, 3).map((c) => (
                  <Line
                    key={c.id}
                    onClick={() => {
                      const other = c.participant_one_id === user?.id ? c.participant_two_id : c.participant_one_id;
                      sessionStorage.setItem("rap-contact-id", other);
                      goRoute("messenger");
                    }}
                  >
                    <Av name={c.other_participant?.full_name || "Member"} s={24} />
                    <span className="flex-1 truncate">
                      {c.other_participant?.full_name || "Member"}
                      {c.last_message?.created_at ? ` · ${timeAgo(c.last_message.created_at)}` : ""}
                    </span>
                  </Line>
                ))}
              </>
            ) : (
              <p>No conversations yet. Message someone from your network, or talk in a channel.</p>
            )}
          </Tile>
          <Tile
            title="Network"
            icon="users"
            to={invites ? "invitations" : "suggestions"}
            action={invites ? "Review invitations" : "Find people"}
          >
            <p>
              <b>{accepted}</b> connection{accepted === 1 ? "" : "s"}
              {invites ? (
                <>
                  {" "}
                  · <b>{invites}</b> invitation{invites === 1 ? "" : "s"} waiting
                </>
              ) : null}
            </p>
            <p className="mt-1">
              {accepted
                ? "See people you may know and grow your network."
                : "Connect with people you work with to see their updates."}
            </p>
          </Tile>
          <Tile
            title="Projects"
            icon="board"
            to="projects"
            action={(projects.data ?? []).length ? "Open boards" : "Create a project"}
          >
            {(projects.data ?? []).length ? (
              (projects.data ?? []).slice(0, 3).map((p) => (
                <Line key={p.id} onClick={() => goRoute(`project/${p.id}`)}>
                  <Ic n="board" s={14} />
                  <span className="flex-1 truncate">{p.name || p.title}</span>
                </Line>
              ))
            ) : (
              <p>Plan tasks, sprints and milestones on a board with your team.</p>
            )}
          </Tile>
          <Tile
            title="Files"
            icon="inbox"
            to="files"
            action={(files.data ?? []).length ? "Open files" : "Upload a file"}
          >
            {(files.data ?? []).length ? (
              (files.data ?? []).slice(0, 3).map((f) => (
                <Line key={f.id} onClick={() => goRoute("files")}>
                  <Ic n="file" s={14} />
                  <span className="flex-1 truncate">{f.name}</span>
                </Line>
              ))
            ) : (
              <p>
                Store, share and preview documents, spreadsheets and presentations. Write in Docs, Sheets and Slides.
              </p>
            )}
          </Tile>
          <Tile
            title="Meetings"
            icon="calendar"
            to="meetings"
            action={upcoming.length ? "See meetings" : "Schedule a meeting"}
          >
            {upcoming.length ? (
              upcoming.map((m) => (
                <Line key={m.id} onClick={() => goRoute("meetings")}>
                  <Ic n="calendar" s={14} />
                  <span className="flex-1 truncate">
                    {m.title} · {new Date(m.starts_at!).toLocaleString()}
                  </span>
                </Line>
              ))
            ) : (
              <p>No upcoming meetings. Schedule a video call with a waiting room, or start a call now.</p>
            )}
          </Tile>
        </div>

        <Card c="mt-4 flex flex-wrap items-center gap-3 rounded-xl">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-soft text-brand">
            <Ic n="spark" s={20} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-bold">AI assistant</h2>
            <p className="text-sm text-slate-500">
              Ask it to find jobs, draft a post or open any screen. It asks before changing anything.
            </p>
          </div>
          <Btn
            onClick={() => {
              remember(ASSISTANT_KEY);
              setTried(true);
              goRoute("assistant");
            }}
          >
            Ask the assistant
          </Btn>
        </Card>

        <section aria-labelledby="all-features" className="mt-6">
          <h2 id="all-features" className="mb-3 text-lg font-bold">
            Everything on Remote AI
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Object.entries(catalog)
              .filter(([name]) => name !== "Home")
              .map(([name, area]) => (
                <Card key={name} c="rounded-xl">
                  <div className="mb-1 flex items-center gap-2">
                    <Ic n={area.icon} s={18} c="text-brand" />
                    <h3 className="font-bold">{name}</h3>
                  </div>
                  <p className="mb-2 text-xs text-slate-500">{area.blurb}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {area.groups
                      .flatMap((g) => g.items)
                      .map(([route, label]) => (
                        <button
                          key={route}
                          onClick={() => goRoute(route)}
                          className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-brand-soft hover:text-brand"
                        >
                          {label}
                        </button>
                      ))}
                  </div>
                </Card>
              ))}
          </div>
        </section>
      </div>
    </div>
  );
}
