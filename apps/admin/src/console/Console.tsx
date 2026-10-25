"use client";

import { useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { ApiError, api, publicGet, supabase } from "@/lib/client";
import { CONSOLE_ENV, envLabel, envMatches } from "@/lib/env";
import { errText } from "./kit";
import { Ic } from "./icons";
import {
  Announcements,
  AssistantActivity,
  Audit,
  AiUsage,
  Contracts,
  Flags,
  Integrations,
  JobSources,
  Jobs,
  Moderation,
  Organisations,
  Overview,
  People,
  Support,
  SystemStatus,
  UsageLimits,
  Verifications,
} from "./modules";

interface Me {
  id: string;
  email: string;
  full_name: string | null;
  role: string;
}
interface Version {
  environment: string;
  git_sha: string;
  version: string;
}

// Eight sections, each with named groups of screens: the top bar shows a tab per
// section (like the product), the sidebar shows only the section in use, and
// every screen is addressable as #screen.
type Screen = [key: string, label: string, icon: string];
const SECTIONS: {
  name: string;
  tab: string;
  icon: string;
  blurb: string;
  groups: { label: string; items: Screen[] }[];
}[] = [
  {
    name: "Dashboard",
    tab: "Dashboard",
    icon: "home",
    blurb: "Operations at a glance",
    groups: [{ label: "", items: [["overview", "Operations overview", "chart"]] }],
  },
  {
    name: "User Management",
    tab: "Users",
    icon: "users",
    blurb: "Accounts, staff and verification",
    groups: [
      {
        label: "Users",
        items: [
          ["users", "User directory", "users"],
          ["staff", "Staff & roles", "shield"],
        ],
      },
      { label: "Organisations", items: [["companies", "Company directory", "building"]] },
      { label: "Trust", items: [["verifications", "Identity verification", "check"]] },
    ],
  },
  {
    name: "Trust & Safety",
    tab: "Safety",
    icon: "shield",
    blurb: "Reports, decisions and restrictions",
    groups: [
      {
        label: "Moderation",
        items: [
          ["reports", "Review queue", "flag"],
          ["decisions", "Moderation history", "clock"],
        ],
      },
      { label: "Enforcement", items: [["restricted", "Restricted accounts", "lock"]] },
    ],
  },
  {
    name: "Marketplace",
    tab: "Marketplace",
    icon: "briefcase",
    blurb: "Jobs, sources and contracts",
    groups: [
      {
        label: "Jobs",
        items: [
          ["jobs", "Job listings", "briefcase"],
          ["sources", "Job sources", "globe"],
        ],
      },
      { label: "Freelancing", items: [["contracts", "Contracts", "file"]] },
    ],
  },
  {
    name: "Customer Support",
    tab: "Support",
    icon: "chat",
    blurb: "Tickets and service levels",
    groups: [
      {
        label: "Tickets",
        items: [
          ["tickets", "Ticket queue", "inbox"],
          ["mytickets", "My assigned tickets", "user"],
          ["resolved", "Resolved tickets", "check"],
        ],
      },
    ],
  },
  {
    name: "AI & Automation",
    tab: "AI",
    icon: "spark",
    blurb: "Usage, allowances and assistant actions",
    groups: [
      {
        label: "Usage",
        items: [
          ["ai", "AI usage & allowances", "chart"],
          ["assistant", "Assistant activity", "spark"],
        ],
      },
    ],
  },
  {
    name: "Platform Configuration",
    tab: "Platform",
    icon: "layers",
    blurb: "Flags, integrations and health",
    groups: [
      {
        label: "Settings",
        items: [
          ["flags", "Feature flags", "flag"],
          ["integrations", "Integrations", "link"],
          ["announcements", "Announcements", "bell"],
        ],
      },
      {
        label: "Health",
        items: [
          ["status", "System status", "zap"],
          ["usage", "Usage & limits", "chart"],
        ],
      },
    ],
  },
  {
    name: "Compliance & Audit",
    tab: "Compliance",
    icon: "list",
    blurb: "Who did what, and when",
    groups: [
      {
        label: "Audit",
        items: [
          ["audit", "Audit log", "list"],
          ["security", "Security events", "lock"],
        ],
      },
    ],
  },
];
const ALL = SECTIONS.flatMap((s) =>
  s.groups.flatMap((g) => g.items.map(([k, l]) => ({ key: k, label: l, section: s.name, group: g.label }))),
);
const screenFromHash = () => {
  const k = typeof window === "undefined" ? "" : window.location.hash.replace(/^#/, "");
  return ALL.some((x) => x.key === k) ? k : "overview";
};

export default function Console() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [me, setMe] = useState<Me | null>(null);
  const [meErr, setMeErr] = useState("");
  const [version, setVersion] = useState<Version | null>(null);
  const [screen, setScreen] = useState("overview");
  const [menu, setMenu] = useState(false);
  const [menuQ, setMenuQ] = useState("");
  const [theme, setTheme] = useState(() => {
    try {
      return (
        localStorage.getItem("rap-theme") ||
        (window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light")
      );
    } catch {
      return "light";
    }
  });
  useEffect(() => {
    document.documentElement.dataset.theme = theme === "dark" ? "dark" : "light";
    try {
      localStorage.setItem("rap-theme", theme);
    } catch {}
  }, [theme]);
  useEffect(() => {
    const sync = () => setScreen(screenFromHash());
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);
  useEffect(() => {
    if (!menu) return;
    const close = (e: KeyboardEvent) => e.key === "Escape" && setMenu(false);
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [menu]);
  const open = (k: string) => {
    window.location.hash = k;
    setScreen(k);
    setMenu(false);
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    publicGet<Version>("/health/version")
      .then(setVersion)
      .catch(() => setVersion(null));
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) {
      setMe(null);
      return;
    }
    api<Me>("/auth/me")
      .then((r) => setMe(r.data))
      .catch((e) => {
        // An expired or revoked session goes back to the sign-in screen.
        if (e instanceof ApiError && e.status === 401) void supabase.auth.signOut();
        else setMeErr(errText(e));
      });
  }, [session]);

  const writable = envMatches(version?.environment);
  const envClass = version && !writable ? "mismatch" : envLabel(CONSOLE_ENV)?.toLowerCase();

  if (session === undefined) return <p style={{ padding: 24 }}>Loading…</p>;
  if (!session) return <SignIn />;
  if (meErr) return <Blocked text={meErr} />;
  if (!me) return <p style={{ padding: 24 }}>Checking access…</p>;
  // Display gate only; every admin endpoint enforces the ADMIN role itself.
  if (me.role !== "ADMIN") return <Blocked text="This account does not have staff access." />;

  const here = ALL.find((x) => x.key === screen) ?? ALL[0];
  const section = SECTIONS.find((x) => x.name === here.section) ?? SECTIONS[0];
  const view: Record<string, ReactNode> = {
    overview: <Overview version={version} />,
    users: <People writable={writable} meId={me.id} />,
    staff: <People writable={writable} meId={me.id} preset="&role=ADMIN" title="Staff & roles" />,
    companies: <Organisations />,
    verifications: <Verifications writable={writable} />,
    reports: <Moderation writable={writable} />,
    decisions: <Moderation writable={writable} history />,
    restricted: <People writable={writable} meId={me.id} preset="&is_active=false" title="Restricted accounts" />,
    jobs: <Jobs writable={writable} />,
    sources: <JobSources />,
    contracts: <Contracts />,
    tickets: <Support writable={writable} meId={me.id} />,
    mytickets: <Support writable={writable} meId={me.id} initial="assignee=me" title="My assigned tickets" />,
    resolved: <Support writable={writable} meId={me.id} initial="status=RESOLVED" title="Resolved tickets" />,
    ai: <AiUsage />,
    assistant: <AssistantActivity />,
    flags: <Flags />,
    integrations: <Integrations />,
    announcements: <Announcements writable={writable} />,
    status: <SystemStatus />,
    usage: <UsageLimits />,
    audit: <Audit />,
    security: <Audit prefix="auth.,admin.user.,admin.bootstrap" title="Security events" />,
  };

  const first = (sec: (typeof SECTIONS)[number]) => sec.groups[0].items[0][0];
  const initial = (me.full_name || me.email).trim().charAt(0).toUpperCase();
  return (
    <div className="app">
      <header className="top">
        <div className="top-left">
          <button className="logo" aria-label="Staff console home" onClick={() => open("overview")}>
            <Ic n="globe" s={22} />
          </button>
          <div className="top-search">
            <Ic n="search" s={18} />
            <input
              aria-label="Find a console screen"
              placeholder="Search the console"
              value={menuQ}
              onChange={(e) => setMenuQ(e.target.value)}
              onKeyDown={(e) => {
                const hit = ALL.find((x) =>
                  `${x.section} ${x.label}`.toLowerCase().includes(menuQ.trim().toLowerCase()),
                );
                if (e.key === "Enter" && menuQ.trim() && hit) {
                  open(hit.key);
                  setMenuQ("");
                }
              }}
            />
            {menuQ.trim() && (
              <div className="search-results" role="listbox">
                {ALL.filter((x) => `${x.section} ${x.label}`.toLowerCase().includes(menuQ.trim().toLowerCase()))
                  .slice(0, 8)
                  .map((x) => (
                    <button
                      key={x.key}
                      role="option"
                      aria-selected={false}
                      onClick={() => {
                        open(x.key);
                        setMenuQ("");
                      }}
                    >
                      <b>{x.label}</b>
                      <span>{x.section}</span>
                    </button>
                  ))}
              </div>
            )}
          </div>
        </div>
        <nav className="tabs" aria-label="Main navigation">
          {SECTIONS.map((sec) => (
            <button
              key={sec.name}
              title={sec.name}
              className={sec.name === section.name ? "active" : ""}
              aria-current={sec.name === section.name ? "page" : undefined}
              onClick={() => open(first(sec))}
            >
              <Ic n={sec.icon} s={22} />
              <span>{sec.tab}</span>
            </button>
          ))}
        </nav>
        <div className="top-right">
          <span className={`env ${envClass}`}>
            {version && !writable ? "READ-ONLY" : (envLabel(CONSOLE_ENV) ?? "").toUpperCase()}
          </span>
          <button
            className="round"
            aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            title={theme === "dark" ? "Light mode" : "Dark mode"}
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          >
            <Ic n={theme === "dark" ? "sun" : "moon"} s={20} />
          </button>
          <button className="avatar" aria-label="Your account" aria-expanded={menu} onClick={() => setMenu(!menu)}>
            {initial}
          </button>
          {menu && (
            <div className="account-menu" role="dialog" aria-label="Your account">
              <div className="account-head">
                <span className="avatar big">{initial}</span>
                <div>
                  <b>{me.full_name || "Staff member"}</b>
                  <p>{me.email}</p>
                </div>
              </div>
              <button className="menu-item" onClick={() => supabase.auth.signOut()}>
                <Ic n="lock" s={18} />
                Sign out
              </button>
            </div>
          )}
        </div>
      </header>
      <div className="shell">
        <aside className="side">
          <div className="side-head">
            <span className="side-icon">
              <Ic n={section.icon} s={20} />
            </span>
            <div>
              <h1>{section.name}</h1>
              <p>{section.blurb}</p>
            </div>
          </div>
          <nav aria-label={`${section.name} navigation`}>
            {section.groups.map((g) => (
              <div key={g.label || section.name}>
                {g.label && <h2>{g.label}</h2>}
                {g.items.map(([k, label, icon]) => (
                  <button key={k} aria-current={screen === k ? "page" : undefined} onClick={() => open(k)}>
                    <span className="nav-icon">
                      <Ic n={icon} s={20} />
                    </span>
                    {label}
                  </button>
                ))}
              </div>
            ))}
          </nav>
        </aside>
        <main className="main">
          {version && !writable && (
            <div className="envbar mismatch">
              Environment mismatch: this {envLabel(CONSOLE_ENV)} console is pointed at a {version.environment} API.
              Changes are disabled.
            </div>
          )}
          <nav aria-label="Breadcrumb" className="crumb">
            <span>{here.section}</span>
            {here.group && <span>{here.group}</span>}
            <b>{here.label}</b>
          </nav>
          <div className="page" key={screen}>
            {view[screen]}
          </div>
          <footer className="foot">
            {envLabel(CONSOLE_ENV)} · API {version?.version ?? "?"} ({version?.git_sha?.slice(0, 7) ?? "unknown"})
          </footer>
        </main>
      </div>
    </div>
  );
}

function Blocked({ text }: { text: string }) {
  return (
    <div style={{ maxWidth: 420, margin: "80px auto" }} className="card">
      <h2>Access denied</h2>
      <p>{text}</p>
      <button className="btn" onClick={() => supabase.auth.signOut()}>
        Sign out
      </button>
    </div>
  );
}

function SignIn() {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState("");
  const send = async () => {
    setErr("");
    // Existing accounts only: the staff console never creates users.
    const { error } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: false } });
    if (error) setErr(error.message);
    else setSent(true);
  };
  const verify = async () => {
    setErr("");
    const { error } = await supabase.auth.verifyOtp({ email, token: code, type: "email" });
    if (error) setErr(error.message);
  };
  return (
    <div style={{ maxWidth: 380, margin: "80px auto" }} className="card">
      <h2 style={{ marginTop: 0 }}>Staff sign in</h2>
      <p className="muted">{envLabel(CONSOLE_ENV)} console. Staff accounts only.</p>
      <label>
        Work email
        <input
          className="input"
          style={{ width: "100%" }}
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </label>
      {sent && (
        <label style={{ display: "block", marginTop: 8 }}>
          Code from the email
          <input
            className="input"
            style={{ width: "100%" }}
            inputMode="numeric"
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
        </label>
      )}
      {err && <p className="error">{err}</p>}
      <div style={{ marginTop: 12 }}>
        {sent ? (
          <button className="btn primary" onClick={verify} disabled={!code}>
            Verify
          </button>
        ) : (
          <button className="btn primary" onClick={send} disabled={!email}>
            Send code
          </button>
        )}
      </div>
    </div>
  );
}
