import { useState, useEffect, useRef, type ReactNode } from "react";
import { AssistantDock } from "./rap_collab";
import { Ic, Av, Brand, cx, useDialogFocus } from "./rap_kit";
import { useAuth } from "@/lib/auth";
import api from "@/lib/api";
import { useApi } from "./live";
// Enterprise navigation: each area has a purpose, an icon and named groups of
// pages. The sidebar shows the current area's groups; the app launcher shows
// every area at once. Admin lives in the separate staff console.
type NavItem = [route: string, label: string, icon: string];
type Area = { icon: string; blurb: string; groups: { label: string; items: NavItem[] }[] };
const catalog: Record<string, Area> = {
  Home: {
    icon: "home",
    blurb: "Your feed, alerts and assistant",
    groups: [
      {
        label: "Stay updated",
        items: [
          ["feed", "News feed", "home"],
          ["notifications", "Notifications", "bell"],
        ],
      },
      {
        label: "Get help fast",
        items: [
          ["assistant", "AI assistant", "spark"],
          ["search", "Search everything", "search"],
        ],
      },
    ],
  },
  Network: {
    icon: "users",
    blurb: "People, groups and organisations",
    groups: [
      {
        label: "Your network",
        items: [
          ["network", "Connections", "users"],
          ["groups", "Groups", "globe"],
          ["profile", "My profile", "user"],
        ],
      },
      {
        label: "Discover",
        items: [
          ["engineers", "Professionals", "search"],
          ["companies", "Organisations", "building"],
        ],
      },
    ],
  },
  Messaging: {
    icon: "chat",
    blurb: "Chat, channels and video calls",
    groups: [
      {
        label: "Conversations",
        items: [
          ["messenger", "Direct messages", "chat"],
          ["channels", "Channels", "inbox"],
        ],
      },
      { label: "Meet", items: [["meetings", "Meetings & calls", "video"]] },
    ],
  },
  Careers: {
    icon: "briefcase",
    blurb: "Find and apply to remote jobs",
    groups: [
      {
        label: "Find work",
        items: [
          ["jobs", "Search jobs", "briefcase"],
          ["recs", "Recommended for you", "target"],
          ["saved", "Saved jobs", "bookmark"],
        ],
      },
      {
        label: "Track",
        items: [
          ["applications", "My applications", "file"],
          ["dash", "Career insights", "chart"],
        ],
      },
      { label: "Preferences", items: [["onboarding", "Job preferences", "settings"]] },
    ],
  },
  Freelance: {
    icon: "zap",
    blurb: "Gigs, contracts and deliverables",
    groups: [
      {
        label: "Find work",
        items: [
          ["freelancework", "Freelance work for you", "target"],
          ["taskmarket", "Task offers", "zap"],
        ],
      },
      {
        label: "Deliver",
        items: [
          ["contracts", "Contracts", "file"],
          ["submissions", "Deliverables", "inbox"],
          ["worklog", "Time & work log", "clock"],
        ],
      },
      {
        label: "Reputation & pay",
        items: [
          ["reviews", "Reviews", "star"],
          ["earnings", "Payments", "wallet"],
        ],
      },
    ],
  },
  Hiring: {
    icon: "building",
    blurb: "Post jobs, find talent, contract",
    groups: [
      { label: "Overview", items: [["codash", "Hiring overview", "chart"]] },
      {
        label: "Jobs",
        items: [
          ["postjob", "Post a job", "plus"],
          ["cojobs", "Job postings", "briefcase"],
          ["candidates", "Candidates", "users"],
        ],
      },
      {
        label: "Talent",
        items: [
          ["ride", "Match a professional", "zap"],
          ["engineers", "Talent search", "search"],
        ],
      },
      {
        label: "Engagements",
        items: [
          ["contracts", "Contracts", "file"],
          ["copayments", "Payments", "wallet"],
          ["coprofile", "Organisation profile", "building"],
        ],
      },
    ],
  },
  Projects: {
    icon: "board",
    blurb: "Boards, sprints, docs and code",
    groups: [
      {
        label: "Plan & track",
        items: [
          ["workspace", "Workspace overview", "layers"],
          ["projects", "Boards & sprints", "board"],
        ],
      },
      {
        label: "Docs & files",
        items: [
          ["files", "All files", "file"],
          ["docs", "Docs", "file"],
          ["sheets", "Sheets", "grid"],
          ["slides", "Slides", "layers"],
        ],
      },
      { label: "Code", items: [["quality", "Code review", "code"]] },
    ],
  },
  Account: {
    icon: "settings",
    blurb: "Settings, security and support",
    groups: [
      {
        label: "Your account",
        items: [
          ["settings", "Settings & connected apps", "settings"],
          ["security", "Security & verification", "shield"],
        ],
      },
      {
        label: "Support",
        items: [
          ["help", "Help center", "question"],
          ["support", "Contact support", "chat"],
        ],
      },
    ],
  },
};
const sections: Record<string, string[][]> = Object.fromEntries(
  Object.entries(catalog).map(([name, a]) => [name, a.groups.flatMap((g) => g.items)]),
);
// Quick actions shown in the app launcher.
const CREATE: Record<string, NavItem[]> = {
  ENGINEER: [
    ["feed", "Write a post", "plus"],
    ["meetings", "Schedule a meeting", "video"],
    ["docs", "New document", "file"],
    ["support", "Ask support", "question"],
  ],
  COMPANY: [
    ["postjob", "Post a job", "plus"],
    ["ride", "Find a professional", "zap"],
    ["meetings", "Schedule a meeting", "video"],
    ["docs", "New document", "file"],
  ],
};
type ShellPerson = { id: string; full_name?: string };
type ShellConnection = { sender_id: string; sender?: ShellPerson; receiver?: ShellPerson };
type ShellRecommendation = {
  job?: { id: string; title: string; company_name?: string | null; location?: string | null };
};

export function AppShell({ r, go, children }: { r: string; go: (route: string) => void; children: ReactNode }) {
  const { user, logout, updateUser } = useAuth();
  const unreadN = useApi<{ count: number }>(user ? "/notifications/unread-count" : null);
  const unreadM = useApi<{ count: number }>(user ? "/conversations/unread-count" : null);
  const conns = useApi<ShellConnection[]>(user && r === "feed" ? "/connections" : null, { status: "ACCEPTED" });
  const top = useApi<ShellRecommendation[]>(
    user?.role === "ENGINEER" && r === "feed" ? "/matching/recommendations" : null,
    {
      limit: 1,
    },
  );
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
    messenger: unreadM.data?.count || 0,
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
  useEffect(() => {
    setMenu("");
  }, [r]);
  // Navigation follows the signed-in role; visitors only see public discovery.
  const role = user?.role || "GUEST";
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
      : role === "COMPANY"
        ? (({ Careers: _c, Freelance: _f, ...rest }) => rest)(sections)
        : role === "ENGINEER"
          ? (({ Hiring: _h, ...rest }) => rest)(sections)
          : sections;
  let section = Object.keys(visible).find((s) => visible[s].some((x) => x[0] === r)) || Object.keys(visible)[0];
  const prefer = (name: string) => {
    if (visible[name]) section = name;
  };
  if (["jobdetail", "work"].includes(r)) prefer("Careers");
  if (["company", "engineer", "talent"].includes(r)) prefer(role === "COMPANY" ? "Hiring" : "Network");
  if (["contractsign"].includes(r)) prefer(role === "COMPANY" ? "Hiring" : "Freelance");
  if (r === "group") prefer("Network");
  const crumb = (() => {
    const area = catalog[section];
    if (!area) return null;
    for (const g of area.groups) {
      const hit = g.items.find((i) => i[0] === r);
      if (hit) return { area: section, group: g.label, page: hit[1] };
    }
    return null;
  })();
  const nav = (rows: string[][]) =>
    rows.map(([path, label, icon]) => (
      <button
        key={path}
        onClick={() => go(path)}
        className={cx("rap-nav", r === path && "selected")}
        aria-current={r === path ? "page" : undefined}
      >
        <span className="rap-nav-icon">
          <Ic n={icon} s={22} />
        </span>
        <span>{label}</span>
      </button>
    ));
  const primary =
    role === "GUEST"
      ? [
          ["jobs", "Jobs", "briefcase", "Explore"],
          ["engineers", "Professionals", "users", "Explore"],
          ["companies", "Companies", "building", "Explore"],
        ]
      : [
          ["feed", "Home", "home", "Home"],
          ["network", "Network", "users", "Network"],
          ["messenger", "Messaging", "chat", "Messaging"],
          ...(role !== "COMPANY" ? [["jobs", "Careers", "briefcase", "Careers"]] : []),
          ...(role !== "COMPANY" ? [["freelancework", "Freelance", "zap", "Freelance"]] : []),
          ...(role !== "ENGINEER" ? [["codash", "Hiring", "building", "Hiring"]] : []),
          ["workspace", "Projects", "board", "Projects"],
        ];
  return (
    <div className="rap-app">
      <header className="rap-top">
        <div className="rap-brand-search">
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
        <nav className="rap-primary" aria-label="Main navigation">
          {primary.map(([p, l, i, s]) => (
            <button
              key={p}
              title={l}
              onClick={() => go(p)}
              className={r === p || (section === s && r !== "network") ? "active" : ""}
            >
              <Ic n={i} s={26} />
              <span>{l}</span>
            </button>
          ))}
        </nav>
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
                ["waffle", "Menu", "pages"],
                ["chat", "Messages", "messenger"],
                ["bell", "Notifications", "notifications"],
              ]
            : [["waffle", "Menu", "pages"]]
          ).map(([i, l, p]) => (
            <button
              key={p}
              aria-label={l}
              title={l}
              onClick={() => (p === "pages" ? setMenu(menu ? "" : "pages") : go(p))}
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
        <div className="rap-side-title">
          {section === "Home" && user ? (
            <button className="rap-person" onClick={() => go("profile")}>
              <Av name={me} s={38} />
              <b>{me}</b>
            </button>
          ) : (
            <>
              <h1>{section}</h1>
              <button title="Settings" aria-label="Section settings" onClick={() => go("settings")}>
                <Ic n="settings" />
              </button>
            </>
          )}
        </div>
        {catalog[section]
          ? catalog[section].groups.map((g) => (
              <div key={g.label}>
                <h3 className="rap-side-label">{g.label}</h3>
                {nav(g.items)}
              </div>
            ))
          : nav(visible[section])}
        {user ? (
          <>
            <div className="rap-divider" />
            <h3 className="rap-side-label">Your shortcuts</h3>
            {nav(
              section === "Home"
                ? role === "COMPANY"
                  ? [
                      ["codash", "Hiring overview", "building"],
                      ["workspace", "My workspace", "board"],
                    ]
                  : [
                      ["dash", "My career", "briefcase"],
                      ["workspace", "My workspace", "board"],
                    ]
                : [
                    ["feed", "Community home", "home"],
                    ["network", "My network", "users"],
                    ["groups", "My groups", "users"],
                  ],
            )}
          </>
        ) : (
          <div className="rap-guest-cta">
            <p>Join to apply, message and hire.</p>
            <button onClick={() => go("register")}>Create a free account</button>
            <button onClick={() => go("login")}>Sign in</button>
          </div>
        )}
        <button className="rap-more" onClick={() => setMenu("pages")}>
          <Ic n="waffle" s={18} />
          Explore all pages
        </button>
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
        {primary.map(([p, l, i]) => (
          <button key={p} onClick={() => go(p)}>
            <Ic n={i} />
            <span>{l}</span>
          </button>
        ))}
      </nav>
      {menu && (
        <div className="rap-overlay" onClick={() => setMenu("")}>
          <div
            ref={menuBox}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-label={menu === "pages" ? "Product menu" : "Your account"}
            className={cx("rap-menu", menu === "pages" && "wide")}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="rap-menu-head">
              <h2>{menu === "pages" ? "Menu" : "Your account"}</h2>
              <button aria-label="Close menu" onClick={() => setMenu("")}>
                <Ic n="x" />
              </button>
            </div>
            {menu === "pages" ? (
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
                  autoFocus
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
                              {nav(g.items)}
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
                  {user && CREATE[role] && (
                    <aside className="rap-create">
                      <h3>Create</h3>
                      {nav(CREATE[role])}
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
                  ["profile", "View your profile", "user"],
                  ["settings", "Settings & privacy", "settings"],
                  ["security", "Security & verification", "shield"],
                  ["help", "Help & support", "question"],
                ])}
                {user && user.role !== "ADMIN" && (
                  <>
                    <p className="rap-side-label">Workspace</p>
                    {[
                      ["ENGINEER", "Professional", "dash"],
                      ["COMPANY", "Company", "codash"],
                    ].map(([r, l, home]) => (
                      <button
                        key={r}
                        className="rap-nav"
                        onClick={async () => {
                          if (user.role === r) {
                            go(home);
                            return;
                          }
                          try {
                            await api.patch("/auth/role", null, { params: { role: r } });
                            updateUser({ role: r as "ENGINEER" | "COMPANY" });
                            setMenu("");
                            go(home);
                          } catch {}
                        }}
                      >
                        {l}
                        {user.role === r && <Ic n="check" s={18} />}
                      </button>
                    ))}
                  </>
                )}
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
