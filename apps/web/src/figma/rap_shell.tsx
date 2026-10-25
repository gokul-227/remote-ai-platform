import { Suspense, lazy, useState, useEffect, useRef, type ReactNode } from "react";
import { AssistantDock } from "./rap_collab";
import { Ic, Av, Brand, cx, useDialogFocus } from "./rap_kit";
import { useAuth } from "@/lib/auth";
import api from "@/lib/api";
import { isMember, timeAgo, useApi } from "./live";
const NotificationsPanel = lazy(() => import("./rap_social").then((m) => ({ default: m.Notifications })));
// Enterprise navigation: seven sections, each with named groups of screens.
// The menu (top-left) lists every section; the sidebar shows only the section
// in use. Notifications, messages and the assistant live in the top bar and the
// floating dock, not in the menu. Staff tools live in the separate console.
type NavItem = [route: string, label: string, icon: string];
type Area = { icon: string; blurb: string; groups: { label: string; items: NavItem[] }[] };
const catalog: Record<string, Area> = {
  Home: {
    icon: "home",
    blurb: "Updates from your network",
    groups: [{ label: "", items: [["feed", "Feed", "home"]] }],
  },
  Network: {
    icon: "users",
    blurb: "Profile, connections and companies",
    groups: [
      {
        label: "My network",
        items: [
          ["profile", "My profile", "user"],
          ["network", "Connections", "users"],
          ["invitations", "Invitations", "inbox"],
          ["suggestions", "Suggested connections", "plus"],
        ],
      },
      {
        label: "Discover",
        items: [
          ["engineers", "People directory", "search"],
          ["companies", "Company pages", "building"],
          ["coprofile", "My company page", "briefcase"],
        ],
      },
    ],
  },
  Collaboration: {
    icon: "chat",
    blurb: "Chats, channels, communities and meetings",
    groups: [
      {
        label: "Communicate",
        items: [
          ["messenger", "Chats", "chat"],
          ["channels", "Channels", "inbox"],
          ["groups", "Communities", "globe"],
        ],
      },
      {
        label: "Meet",
        items: [
          ["meetings", "Meetings", "calendar"],
          ["calls", "Calls", "video"],
        ],
      },
    ],
  },
  Jobs: {
    icon: "briefcase",
    blurb: "Find roles and hire talent",
    groups: [
      {
        label: "Find jobs",
        items: [
          ["jobs", "Job search", "briefcase"],
          ["recs", "AI-matched jobs", "target"],
          ["saved", "Saved jobs", "bookmark"],
        ],
      },
      {
        label: "My job search",
        items: [
          ["applications", "Applications", "file"],
          ["onboarding", "Job preferences", "settings"],
          ["dash", "Career insights", "chart"],
        ],
      },
      {
        label: "Hiring",
        items: [
          ["postjob", "Post a job", "plus"],
          ["cojobs", "Manage postings", "layers"],
          ["candidates", "Applicants", "users"],
          ["ride", "Talent matching", "zap"],
        ],
      },
    ],
  },
  Freelancing: {
    icon: "zap",
    blurb: "Find work, deliver and get paid",
    groups: [
      {
        label: "Find work",
        items: [
          ["work", "Browse projects", "search"],
          ["freelancework", "AI-matched work", "target"],
        ],
      },
      {
        label: "Engagements",
        items: [
          ["taskmarket", "Proposals & offers", "inbox"],
          ["contracts", "Contracts", "file"],
          ["submissions", "Deliverables", "check"],
          ["worklog", "Time & activity", "clock"],
        ],
      },
      {
        label: "Earnings",
        items: [
          ["earnings", "Payments", "wallet"],
          ["reviews", "Reviews & ratings", "star"],
        ],
      },
    ],
  },
  Projects: {
    icon: "board",
    blurb: "Plan, document and ship work",
    groups: [
      { label: "Overview", items: [["workspace", "Workspace", "layers"]] },
      {
        label: "Plan & track",
        items: [
          ["projects", "Boards", "board"],
          ["backlog", "Backlog & sprints", "list"],
          ["timeline", "Timeline", "calendar"],
        ],
      },
      {
        label: "Documents",
        items: [
          ["docs", "Documents", "file"],
          ["sheets", "Spreadsheets", "grid"],
          ["slides", "Presentations", "layers"],
          ["files", "Files", "inbox"],
        ],
      },
      {
        label: "Development",
        items: [
          ["repos", "Repositories", "code"],
          ["quality", "Code review", "check"],
        ],
      },
      { label: "Tools", items: [["browser", "Web browser", "globe"]] },
    ],
  },
  Account: {
    icon: "settings",
    blurb: "Settings, security and support",
    groups: [
      {
        label: "Settings",
        items: [
          ["settings", "Account settings", "settings"],
          ["security", "Security & verification", "shield"],
          ["privacydata", "Privacy & data", "lock"],
          ["apps", "Connected apps", "link"],
        ],
      },
      {
        label: "Support",
        items: [
          ["help", "Help center", "question"],
          ["support", "Support tickets", "chat"],
        ],
      },
    ],
  },
};
const sections: Record<string, string[][]> = Object.fromEntries(
  Object.entries(catalog).map(([name, a]) => [name, a.groups.flatMap((g) => g.items)]),
);
// Screens reached from inside another screen belong to that screen's section.
const HOME_OF: Record<string, string> = {
  jobdetail: "Jobs",
  talent: "Jobs",
  codash: "Jobs",
  engineer: "Network",
  company: "Network",
  group: "Collaboration",
  contractsign: "Freelancing",
  copayments: "Freelancing",
  notifications: "Home",
  search: "Home",
  assistant: "Home",
};
// Quick actions shown in the menu.
const CREATE: NavItem[] = [
  ["feed", "Write a post", "plus"],
  ["postjob", "Post a job", "briefcase"],
  ["meetings", "Schedule a meeting", "calendar"],
  ["docs", "New document", "file"],
  ["ride", "Find a professional", "zap"],
  ["support", "Contact support", "question"],
];
const MENU_TITLES: Record<string, string> = {
  pages: "Menu",
  account: "Your account",
  messages: "Messages",
  notifications: "Notifications",
};
type ShellPerson = { id: string; full_name?: string };
type ShellConnection = { sender_id: string; sender?: ShellPerson; receiver?: ShellPerson };
type ShellRecommendation = {
  job?: { id: string; title: string; company_name?: string | null; location?: string | null };
};

export function AppShell({ r, go, children }: { r: string; go: (route: string) => void; children: ReactNode }) {
  const { user, logout } = useAuth();
  const unreadN = useApi<{ count: number }>(user ? "/notifications/unread-count" : null);
  const unreadM = useApi<{ count: number }>(user ? "/conversations/unread-count" : null);
  const conns = useApi<ShellConnection[]>(user && r === "feed" ? "/connections" : null, { status: "ACCEPTED" });
  const top = useApi<ShellRecommendation[]>(isMember(user) && r === "feed" ? "/matching/recommendations" : null, {
    limit: 1,
  });
  useEffect(() => {
    unreadN.reload();
    unreadM.reload();
  }, [r]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const t = setInterval(() => {
      unreadN.reload();
      unreadM.reload();
    }, 30000);
    return () => clearInterval(t);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const badges: Record<string, number> = {
    messages: unreadM.data?.count || 0,
    notifications: unreadN.data?.count || 0,
  };
  const contacts = (conns.data ?? [])
    .map((c) => (c.sender_id === user?.id ? c.receiver : c.sender))
    .filter((p): p is ShellPerson => Boolean(p));
  const opp = top.data?.[0]?.job;
  const me = user?.full_name || "Guest";
  const signOut = async () => {
    try {
      await api.post("/auth/logout");
    } catch {}
    await logout();
    setMenu("");
    go("login");
  };
  const [menu, setMenu] = useState("");
  const menuBox = useRef<HTMLDivElement>(null);
  useDialogFocus(menuBox, !!menu, () => setMenu(""));
  const [q, setQ] = useState("");
  const [menuQ, setMenuQ] = useState("");
  // The section picked in the menu; the sidebar shows only this section.
  const [chosen, setChosen] = useState(() => {
    try {
      return sessionStorage.getItem("rap-section") || "";
    } catch {
      return "";
    }
  });
  const choose = (name: string) => {
    setChosen(name);
    try {
      sessionStorage.setItem("rap-section", name);
    } catch {}
  };
  const convs = useApi<
    {
      id: string;
      participant_one_id: string;
      participant_two_id: string;
      unread_count?: number;
      other_participant?: { full_name?: string };
      last_message?: { content?: string; created_at?: string } | null;
    }[]
  >(
    user && menu === "messages" ? "/conversations" : null,
  );
  useEffect(() => {
    setMenu("");
  }, [r]);
  // Navigation follows the signed-in role; visitors only see public discovery.
  // One member account: professionals and organisations see the same areas.
  const role = !user ? "GUEST" : user.role === "ADMIN" ? "ADMIN" : "MEMBER";
  const visible: Record<string, string[][]> =
    role === "GUEST"
      ? {
          Explore: [
            ["jobs", "Discover jobs", "briefcase"],
            ["engineers", "Discover professionals", "search"],
            ["companies", "Explore companies", "building"],
            ["help", "Help center", "question"],
          ],
        }
      : sections;
  const owner = (route: string) =>
    HOME_OF[route] && visible[HOME_OF[route]]
      ? HOME_OF[route]
      : Object.keys(visible).find((name) => visible[name].some((x) => x[0] === route));
  const section =
    chosen && visible[chosen]?.some((x) => x[0] === r) ? chosen : owner(r) || Object.keys(visible)[0];
  const crumb = (() => {
    const area = catalog[section];
    if (!area) return null;
    for (const g of area.groups) {
      const hit = g.items.find((i) => i[0] === r);
      if (hit) return { area: section, group: g.label, page: hit[1] };
    }
    return null;
  })();
  const nav = (rows: string[][], before?: () => void) =>
    rows.map(([path, label, icon]) => (
      <button
        key={path}
        onClick={() => {
          before?.();
          go(path);
        }}
        className={cx("rap-nav", r === path && "selected")}
        aria-current={r === path ? "page" : undefined}
      >
        <span className="rap-nav-icon">
          <Ic n={icon} s={22} />
        </span>
        <span>{label}</span>
      </button>
    ));
  // Phone bottom bar: the most used sections plus the full menu.
  const mobile =
    role === "GUEST"
      ? [
          ["jobs", "Jobs", "briefcase"],
          ["engineers", "People", "users"],
          ["companies", "Companies", "building"],
        ]
      : [
          ["feed", "Home", "home"],
          ["network", "Network", "users"],
          ["jobs", "Jobs", "briefcase"],
          ["workspace", "Projects", "board"],
        ];
  return (
    <div className="rap-app">
      <header className="rap-top">
        <div className="rap-brand-search">
          <button
            className="rap-launcher-btn"
            aria-label="Open the menu"
            aria-expanded={menu === "pages"}
            title="Menu"
            onClick={() => setMenu(menu === "pages" ? "" : "pages")}
          >
            <Ic n="waffle" s={22} />
          </button>
          <button aria-label="Remote AI home" onClick={() => go("feed")}>
            <Brand s={42} />
          </button>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              sessionStorage.setItem("rap-search", q);
              window.dispatchEvent(new Event("rap-search"));
              go("search");
            }}
          >
            <Ic n="search" s={19} />
            <input
              aria-label="Search Remote AI"
              placeholder="Search Remote AI"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </form>
        </div>
        <div className="rap-tools">
          {!user && (
            <>
              <button className="rap-auth-link" onClick={() => go("login")}>
                Sign in
              </button>
              <button className="rap-auth-join" onClick={() => go("register")}>
                Join
              </button>
            </>
          )}
          {(user
            ? [
                ["chat", "Messages", "messages"],
                ["bell", "Notifications", "notifications"],
              ]
            : []
          ).map(([i, l, p]) => (
            <button
              key={p}
              aria-label={l}
              title={l}
              aria-expanded={menu === p}
              onClick={() => setMenu(menu === p ? "" : p)}
              style={{ position: "relative" }}
            >
              <Ic n={i} s={21} />
              {badges[p] > 0 && (
                <span
                  style={{
                    position: "absolute",
                    top: -4,
                    right: -4,
                    minWidth: 19,
                    height: 19,
                    padding: "0 5px",
                    borderRadius: 10,
                    background: "#e41e3f",
                    color: "#fff",
                    fontSize: 11,
                    fontWeight: 700,
                    display: "grid",
                    placeItems: "center",
                  }}
                >
                  {badges[p] > 99 ? "99+" : badges[p]}
                </span>
              )}
            </button>
          ))}
          {user && (
            <button aria-label="Your account" onClick={() => setMenu(menu ? "" : "account")}>
              <Av name={me} s={40} />
            </button>
          )}
        </div>
      </header>
      <aside className="rap-sidebar">
        <div className="rap-section-head">
          <span className="rap-area-icon">
            <Ic n={catalog[section]?.icon ?? "layers"} s={20} />
          </span>
          <div>
            <h1>{section}</h1>
            {catalog[section] && <p>{catalog[section].blurb}</p>}
          </div>
        </div>
        <button className="rap-all-sections" onClick={() => setMenu("pages")}>
          <Ic n="waffle" s={16} />
          All sections
        </button>
        <nav aria-label={`${section} navigation`} className="rap-section-nav">
          {(catalog[section]?.groups ?? [{ label: "", items: (visible[section] ?? []) as NavItem[] }]).map((g) => (
            <div key={g.label || section} className="rap-tree-group">
              {g.label && <h4>{g.label}</h4>}
              {nav(g.items)}
            </div>
          ))}
        </nav>
        {!user && (
          <div className="rap-guest-cta">
            <p>Join to apply, message and hire.</p>
            <button onClick={() => go("register")}>Create a free account</button>
            <button onClick={() => go("login")}>Sign in</button>
          </div>
        )}
        <footer>
          <button onClick={() => go("privacy")}>Privacy</button> · <button onClick={() => go("terms")}>Terms</button> ·{" "}
          <button onClick={() => go("help")}>Help</button>
          <p>Remote AI Platform</p>
        </footer>
      </aside>
      {user && r !== "assistant" && <AssistantDock go={go} />}
      <main className={cx("rap-main", r === "feed" && "rap-main-feed")}>
        <div className="rap-content" key={r}>
          {crumb && r !== "feed" && (
            <nav aria-label="Breadcrumb" className="rap-crumb">
              <button onClick={() => go(sections[crumb.area]?.[0]?.[0] ?? "feed")}>{crumb.area}</button>
              {crumb.group && <span>{crumb.group}</span>}
              <b aria-current="page">{crumb.page}</b>
            </nav>
          )}
          {children}
        </div>
      </main>
      {r === "feed" && (
        <aside className="rap-right">
          {opp && (
            <>
              <h3>Recommended opportunity</h3>
              <button
                className="rap-opportunity"
                onClick={() => {
                  localStorage.setItem("rap-selected-job", opp.id);
                  go("jobs");
                }}
              >
                <span className="rap-company-mark">{(opp.company_name || "?").slice(0, 1).toUpperCase()}</span>
                <b>{opp.title}</b>
                <p>
                  {opp.company_name} · {opp.location || "Remote"}
                </p>
                <span>View opportunity →</span>
              </button>
              <div className="rap-divider" />
            </>
          )}
          <div className="flex items-center justify-between">
            <h3>Contacts</h3>
            <button aria-label="Find people" onClick={() => go("network")}>
              <Ic n="search" s={18} />
            </button>
          </div>
          {contacts.length ? (
            contacts.map((p) => (
              <button
                className="rap-contact"
                key={p.id}
                onClick={() => {
                  sessionStorage.setItem("rap-contact-id", p.id);
                  go("messenger");
                }}
              >
                <Av name={p.full_name ?? ""} s={37} />
                <span>{p.full_name}</span>
              </button>
            ))
          ) : (
            <p className="px-2 text-sm text-slate-500">Connect with people to see them here.</p>
          )}
        </aside>
      )}
      <nav className="rap-mobile">
        {mobile.map(([p, l, i]) => (
          <button key={p} onClick={() => go(p)}>
            <Ic n={i} />
            <span>{l}</span>
          </button>
        ))}
        <button onClick={() => setMenu("pages")}>
          <Ic n="waffle" />
          <span>Menu</span>
        </button>
      </nav>
      {menu && (
        <div className="rap-overlay" onClick={() => setMenu("")}>
          <div
            ref={menuBox}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-label={menu === "pages" ? "Product menu" : MENU_TITLES[menu]}
            className={cx("rap-menu", menu === "pages" && "wide", menu === "notifications" && "tall")}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="rap-menu-head">
              <h2>{MENU_TITLES[menu]}</h2>
              <button aria-label="Close menu" onClick={() => setMenu("")}>
                <Ic n="x" />
              </button>
            </div>
            {menu === "notifications" ? (
              <Suspense fallback={<p className="text-sm text-slate-500">Loading…</p>}>
                <div className="rap-panel-embed">
                  <NotificationsPanel />
                </div>
              </Suspense>
            ) : menu === "messages" ? (
              <div className="grid gap-1">
                {convs.loading && !convs.data && <p className="text-sm text-slate-500">Loading…</p>}
                {(convs.data ?? []).slice(0, 8).map((c) => (
                  <button
                    key={c.id}
                    className="rap-contact"
                    onClick={() => {
                      const other = c.participant_one_id === user?.id ? c.participant_two_id : c.participant_one_id;
                      sessionStorage.setItem("rap-contact-id", other);
                      go("messenger");
                    }}
                  >
                    <Av name={c.other_participant?.full_name || "Member"} s={44} />
                    <span className="min-w-0 flex-1">
                      <b className="block truncate">{c.other_participant?.full_name || "Member"}</b>
                      <small className="block truncate text-slate-500">
                        {c.last_message?.content || "No messages yet"}
                        {c.last_message?.created_at ? ` · ${timeAgo(c.last_message.created_at)}` : ""}
                      </small>
                    </span>
                  </button>
                ))}
                {!convs.loading && !(convs.data ?? []).length && (
                  <p className="px-2 py-4 text-sm text-slate-500">No conversations yet.</p>
                )}
                <button className="rap-button mt-2" onClick={() => go("messenger")}>
                  Open chats
                </button>
              </div>
            ) : menu === "pages" ? (
              <>
                <label className="sr-only" htmlFor="menu-search">
                  Search the menu
                </label>
                <input
                  id="menu-search"
                  className="rap-menu-search"
                  placeholder="Search menu…"
                  value={menuQ}
                  onChange={(e) => setMenuQ(e.target.value)}
                />
                <div className="rap-launcher">
                  <div className="rap-menu-grid">
                    {Object.entries(visible)
                      .map(([title, rows]) => {
                        const area = catalog[title];
                        const groups = area ? area.groups : [{ label: "", items: rows as NavItem[] }];
                        const ql = menuQ.trim().toLowerCase();
                        const shown = groups
                          .map((g) => ({
                            ...g,
                            items: g.items.filter(
                              (i) => !ql || `${title} ${g.label} ${i[1]}`.toLowerCase().includes(ql),
                            ),
                          }))
                          .filter((g) => g.items.length);
                        return { title, area, shown };
                      })
                      .filter((x) => x.shown.length)
                      .map(({ title, area, shown }) => (
                        <section key={title} className="rap-area">
                          <div className="rap-area-head">
                            <span className="rap-area-icon">
                              <Ic n={area?.icon ?? "layers"} s={20} />
                            </span>
                            <div>
                              <h3>{title}</h3>
                              {area && <p>{area.blurb}</p>}
                            </div>
                          </div>
                          {shown.map((g) => (
                            <div key={g.label || title}>
                              {g.label && <h4 className="rap-area-group">{g.label}</h4>}
                              {nav(g.items, () => choose(title))}
                            </div>
                          ))}
                        </section>
                      ))}
                    {!user && (
                      <section className="rap-area">
                        <h3>Joining Remote AI</h3>
                        {nav([
                          ["login", "Sign in", "lock"],
                          ["register", "Create an account", "user"],
                          ["forgot", "Having trouble signing in?", "mail"],
                        ])}
                      </section>
                    )}
                  </div>
                  {user && (
                    <aside className="rap-create">
                      <h3>Create</h3>
                      {nav(CREATE)}
                    </aside>
                  )}
                </div>
              </>
            ) : (
              <>
                <button className="rap-person" onClick={() => go("profile")}>
                  <Av name={me} s={48} />
                  <b>{me}</b>
                </button>
                <div className="rap-divider" />
                {nav([
                  ["profile", "My profile", "user"],
                  ["settings", "Account settings", "settings"],
                  ["help", "Help center", "question"],
                ])}
                {user ? (
                  <button className="rap-nav" onClick={signOut}>
                    <span className="rap-nav-icon">
                      <Ic n="lock" s={22} />
                    </span>
                    <span>Sign out</span>
                  </button>
                ) : (
                  nav([["login", "Sign in", "lock"]])
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
