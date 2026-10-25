"use client";

import { useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { api, publicGet, supabase } from "@/lib/client";
import { CONSOLE_ENV, envLabel, envMatches } from "@/lib/env";
import { errText } from "./kit";
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

// Eight sections, each with named groups of screens. The menu lists them all;
// the sidebar shows only the section in use. Screens are addressable as #screen.
type Screen = [key: string, label: string];
const SECTIONS: { name: string; blurb: string; groups: { label: string; items: Screen[] }[] }[] = [
  {
    name: "Dashboard",
    blurb: "Operations at a glance",
    groups: [{ label: "", items: [["overview", "Operations overview"]] }],
  },
  {
    name: "User Management",
    blurb: "Accounts, staff and verification",
    groups: [
      {
        label: "Users",
        items: [
          ["users", "User directory"],
          ["staff", "Staff & roles"],
        ],
      },
      { label: "Organisations", items: [["companies", "Company directory"]] },
      { label: "Trust", items: [["verifications", "Identity verification"]] },
    ],
  },
  {
    name: "Trust & Safety",
    blurb: "Reports, decisions and restrictions",
    groups: [
      {
        label: "Moderation",
        items: [
          ["reports", "Review queue"],
          ["decisions", "Moderation history"],
        ],
      },
      { label: "Enforcement", items: [["restricted", "Restricted accounts"]] },
    ],
  },
  {
    name: "Marketplace",
    blurb: "Jobs, sources and contracts",
    groups: [
      {
        label: "Jobs",
        items: [
          ["jobs", "Job listings"],
          ["sources", "Job sources"],
        ],
      },
      { label: "Freelancing", items: [["contracts", "Contracts"]] },
    ],
  },
  {
    name: "Customer Support",
    blurb: "Tickets and service levels",
    groups: [
      {
        label: "Tickets",
        items: [
          ["tickets", "Ticket queue"],
          ["mytickets", "My assigned tickets"],
          ["resolved", "Resolved tickets"],
        ],
      },
    ],
  },
  {
    name: "AI & Automation",
    blurb: "Usage, allowances and assistant actions",
    groups: [
      {
        label: "Usage",
        items: [
          ["ai", "AI usage & allowances"],
          ["assistant", "Assistant activity"],
        ],
      },
    ],
  },
  {
    name: "Platform Configuration",
    blurb: "Flags, integrations and health",
    groups: [
      {
        label: "Settings",
        items: [
          ["flags", "Feature flags"],
          ["integrations", "Integrations"],
          ["announcements", "Announcements"],
        ],
      },
      { label: "Health", items: [["status", "System status"]] },
    ],
  },
  {
    name: "Compliance & Audit",
    blurb: "Who did what, and when",
    groups: [
      {
        label: "Audit",
        items: [
          ["audit", "Audit log"],
          ["security", "Security events"],
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
      .catch((e) => setMeErr(errText(e)));
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
  const ql = menuQ.trim().toLowerCase();
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
    audit: <Audit />,
    security: <Audit prefix="auth." title="Security events" />,
  };

  return (
    <div className="app">
      <header className="top">
        <button className="menu-btn" aria-label="Open the menu" aria-expanded={menu} onClick={() => setMenu(!menu)}>
          ☰
        </button>
        <b className="brand">
          <span className="logo" aria-hidden="true">
            R
          </span>
          Staff console
        </b>
        <span className={`env ${envClass}`}>
          {version && !writable ? "ENVIRONMENT MISMATCH · READ-ONLY" : (envLabel(CONSOLE_ENV) ?? "").toUpperCase()}
        </span>
        <span className="who">{me.email}</span>
        <button
          className="theme-btn"
          aria-label="Switch between light and dark mode"
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
        >
          {theme === "dark" ? "Light mode" : "Dark mode"}
        </button>
        <button className="btn" onClick={() => supabase.auth.signOut()}>
          Sign out
        </button>
      </header>
      <div className="shell">
        <nav className="side" aria-label={`${section.name} navigation`}>
          <h1>{section.name}</h1>
          <p className="side-blurb">{section.blurb}</p>
          <button className="all" onClick={() => setMenu(true)}>
            ← All sections
          </button>
          {section.groups.map((g) => (
            <div key={g.label || section.name}>
              {g.label && <h2>{g.label}</h2>}
              {g.items.map(([k, label]) => (
                <button key={k} aria-current={screen === k ? "page" : undefined} onClick={() => open(k)}>
                  {label}
                </button>
              ))}
            </div>
          ))}
        </nav>
        <main className="main">
          <div className={`envbar ${envClass}`}>
            {version && !writable
              ? `Environment mismatch: this ${envLabel(CONSOLE_ENV)} console is pointed at a ${version.environment} API. Changes are disabled.`
              : `${envLabel(CONSOLE_ENV)} · API ${version?.version ?? "?"} (${version?.git_sha?.slice(0, 7) ?? "unknown"}) · signed in as ${me.email}`}
          </div>
          <nav aria-label="Breadcrumb" className="crumb">
            {here.section}
            {here.group && ` / ${here.group}`} / <b>{here.label}</b>
          </nav>
          {view[screen]}
        </main>
      </div>
      {menu && (
        <div className="overlay" onClick={() => setMenu(false)}>
          <div role="dialog" aria-label="Console menu" className="launcher" onClick={(e) => e.stopPropagation()}>
            <div className="row" style={{ justifyContent: "space-between" }}>
              <h2 style={{ margin: 0 }}>Menu</h2>
              <button className="btn" aria-label="Close menu" onClick={() => setMenu(false)}>
                ✕
              </button>
            </div>
            <input
              className="input"
              aria-label="Search the menu"
              placeholder="Search the menu…"
              style={{ width: "100%", margin: "12px 0" }}
              value={menuQ}
              onChange={(e) => setMenuQ(e.target.value)}
            />
            <div className="launcher-grid">
              {SECTIONS.map((sec) => {
                const groups = sec.groups
                  .map((g) => ({
                    ...g,
                    items: g.items.filter(([, l]) => !ql || `${sec.name} ${g.label} ${l}`.toLowerCase().includes(ql)),
                  }))
                  .filter((g) => g.items.length);
                if (!groups.length) return null;
                return (
                  <section key={sec.name}>
                    <h3>{sec.name}</h3>
                    <p className="muted">{sec.blurb}</p>
                    {groups.map((g) => (
                      <div key={g.label || sec.name}>
                        {g.label && <h4>{g.label}</h4>}
                        {g.items.map(([k, l]) => (
                          <button key={k} className="link" onClick={() => open(k)}>
                            {l}
                          </button>
                        ))}
                      </div>
                    ))}
                  </section>
                );
              })}
            </div>
          </div>
        </div>
      )}
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
