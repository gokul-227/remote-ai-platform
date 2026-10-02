import { useState, useEffect, useRef, type ReactNode } from "react";
import { Ic, Av, Brand, cx, useDialogFocus } from "./rap_kit";
import { useAuth } from "@/lib/auth";
import api from "@/lib/api";
import { useApi } from "./live";
const sections: Record<string, string[][]> = {
  Community: [
    ["feed", "Home", "home"],
    ["network", "My network", "users"],
    ["groups", "Groups", "users"],
    ["messenger", "Messages", "chat"],
    ["notifications", "Notifications", "bell"],
    ["profile", "My profile", "user"],
  ],
  Careers: [
    ["jobs", "Discover jobs", "briefcase"],
    ["recs", "Recommended for you", "target"],
    ["applications", "My applications", "file"],
    ["saved", "Saved jobs", "bookmark"],
    ["dash", "Career overview", "chart"],
    ["companies", "Explore companies", "building"],
    ["onboarding", "Career preferences", "settings"],
  ],
  Workspace: [
    ["workspace", "Overview", "layers"],
    ["projects", "Project board", "board"],
    ["taskmarket", "Task offers", "inbox"],
    ["submissions", "Submissions", "file"],
    ["worklog", "Work log", "clock"],
    ["contracts", "Contracts", "file"],
    ["earnings", "Payments", "wallet"],
    ["reviews", "Reviews", "star"],
    ["quality", "Quality review", "code"],
  ],
  Hiring: [
    ["codash", "Hiring overview", "chart"],
    ["ride", "Hire a professional", "zap"],
    ["cojobs", "Job postings", "briefcase"],
    ["postjob", "Post a job", "plus"],
    ["candidates", "Candidates", "users"],
    ["engineers", "Discover talent", "search"],
    ["coprofile", "Company profile", "building"],
    ["contracts", "Contracts", "file"],
    ["copayments", "Payments", "wallet"],
  ],
  Account: [
    ["settings", "Account settings", "settings"],
    ["security", "Security & verification", "shield"],
    ["profile", "Profile & visibility", "user"],
    ["help", "Help center", "question"],
  ],
  Admin: [
    ["admin", "Platform overview", "chart"],
    ["adminusers", "People & access", "users"],
    ["adminjobs", "Job moderation", "briefcase"],
    ["reports", "Content reports", "flag"],
    ["verifications", "Verification queue", "shieldcheck"],
    ["audit", "Audit trail", "history"],
    ["sync", "Job sources", "layers"],
    ["aiusage", "AI usage", "spark"],
    ["health", "System health", "bolt"],
    ["flags", "Feature availability", "settings"],
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
        ? {
            Community: sections.Community,
            Hiring: sections.Hiring,
            Workspace: sections.Workspace,
            Account: sections.Account,
          }
        : role === "ENGINEER"
          ? {
              Community: sections.Community,
              Careers: sections.Careers,
              Workspace: sections.Workspace,
              Account: sections.Account,
            }
          : sections;
  let section = Object.keys(visible).find((s) => visible[s].some((x) => x[0] === r)) || Object.keys(visible)[0];
  const prefer = (name: string) => {
    if (visible[name]) section = name;
  };
  if (["jobdetail", "work"].includes(r)) prefer("Careers");
  if (["company", "engineer", "talent"].includes(r)) prefer("Hiring");
  if (["contractsign"].includes(r)) prefer("Workspace");
  if (r === "group") prefer("Community");
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
          ["feed", "Home", "home", "Community"],
          ["network", "My network", "users", "Network"],
          ...(role !== "COMPANY" ? [["jobs", "Jobs", "briefcase", "Careers"]] : []),
          ["workspace", "Workspace", "board", "Workspace"],
          ...(role !== "ENGINEER" ? [["codash", "Hiring", "building", "Hiring"]] : []),
          ...(role === "ADMIN" ? [["admin", "Admin", "shield", "Admin"]] : []),
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
          {section === "Community" && user ? (
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
        {nav(visible[section])}
        {user ? (
          <>
            <div className="rap-divider" />
            <h3 className="rap-side-label">Your shortcuts</h3>
            {nav(
              section === "Community"
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
      <main className={cx("rap-main", r === "feed" && "rap-main-feed")}>
        <div className="rap-content" key={r}>
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
                <div className="rap-menu-grid">
                  {Object.entries(visible).map(([title, rows]) => (
                    <section key={title}>
                      <h3>{title}</h3>
                      {nav(rows)}
                    </section>
                  ))}
                  {!user && (
                    <section>
                      <h3>Joining Remote AI</h3>
                      {nav([
                        ["login", "Sign in", "lock"],
                        ["register", "Create an account", "user"],
                        ["forgot", "Having trouble signing in?", "mail"],
                      ])}
                    </section>
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
