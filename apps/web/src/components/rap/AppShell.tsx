"use client";

/**
 * Application shell — port of the Figma Make design's rap_shell.tsx:
 * fixed top bar (brand + search, primary tabs, round tool buttons), a
 * section-aware left sidebar, the feed's right rail and a mobile tab bar.
 * All data is live: the signed-in user, their role's sections, unread
 * counts, workspace switching and sign-out.
 */
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useAuth } from "@/lib/auth";
import api from "@/lib/api";
import { useNotifications } from "@/hooks/useNotifications";
import { useUnreadMessages } from "@/hooks/useConversations";
import { useConnections, otherParty } from "@/hooks/useConnections";
import { useRecommendations } from "@/hooks/useRecommendations";
import { useSwitchWorkspace } from "@/hooks/useWorkspace";
import { CommandPalette } from "@/components/CommandPalette";
import { Av, Brand, Ic, cx } from "./kit";
import { activeHref, primaryFor, profileHref, sectionOf, sectionsFor, type NavItem, type Role, type SectionKey } from "./nav";

/** Routes rendered without any shell chrome (they carry their own layout). */
const BARE = [/^\/auth(\/|$)/];
/** Routes that use the full width (no left sidebar), like the Figma project board. */
const FULL = [/^\/projects\/[^/]+$/];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname() || "/";
  const router = useRouter();
  const { user, logout } = useAuth();
  const role = (user?.role ?? null) as Role | null;
  const [menu, setMenu] = useState<"" | "pages" | "account">("");
  const [q, setQ] = useState("");
  const [paletteOpen, setPaletteOpen] = useState(false);

  const notifications = useNotifications(!!user);
  const unreadMessages = useUnreadMessages(!!user);
  const unreadNotifications = notifications.unread.data?.count ?? 0;

  const sections = useMemo(() => sectionsFor(role), [role]);
  const section = sectionOf(pathname, sections, role);
  const allItems = useMemo(() => Object.values(sections).flat(), [sections]);
  const current = activeHref(pathname, allItems);

  // Close any overlay on navigation.
  const [lastPath, setLastPath] = useState(pathname);
  if (lastPath !== pathname) { setLastPath(pathname); setMenu(""); }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setPaletteOpen((o) => !o); }
      if (e.key === "Escape") setMenu("");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (BARE.some((r) => r.test(pathname))) return <>{children}</>;

  const full = FULL.some((r) => r.test(pathname));
  const isFeed = pathname === "/feed";
  const primary = primaryFor(role);
  const name = user?.full_name || "Your account";

  const signOut = async () => {
    try { await api.post("/auth/logout"); } catch { /* token may already be invalid — still clear locally */ }
    logout();
    setMenu("");
    router.push("/auth/login");
  };

  const nav = (rows: NavItem[]) => rows.map((it) => (
    <Link key={it.href + it.label} href={it.href} className={cx("rap-nav", current === it.href && "selected")} aria-current={current === it.href ? "page" : undefined}>
      <span className="rap-nav-icon"><Ic n={it.icon} s={22} /></span><span>{it.label}</span>
    </Link>
  ));

  const shortcuts: NavItem[] = !role
    ? [{ href: "/auth/register", label: "Create an account", icon: "user" }, { href: "/auth/login", label: "Sign in", icon: "lock" }]
    : section === "Community"
      ? [
          ...(role === "ENGINEER" ? [{ href: "/engineer/dashboard", label: "My career", icon: "briefcase" }] : []),
          { href: role === "ENGINEER" ? "/engineer/workspace" : "/projects", label: "My workspace", icon: "board" },
          ...(role === "COMPANY" ? [{ href: "/company/dashboard", label: "Hire a team", icon: "building" }] : []),
        ]
      : [
          { href: "/feed", label: "Community home", icon: "home" },
          { href: "/network", label: "My network", icon: "users" },
          { href: "/groups", label: "My groups", icon: "users" },
        ];

  return (
    <div className="rap-app">
      <header className="rap-top">
        <div className="rap-brand-search">
          <Link aria-label="Remote AI home" href={user ? "/feed" : "/"}><Brand s={42} /></Link>
          <form role="search" onSubmit={(e) => { e.preventDefault(); if (q.trim()) router.push(`/search?q=${encodeURIComponent(q.trim())}`); }}>
            <Ic n="search" s={19} />
            <input aria-label="Search Remote AI" placeholder="Search Remote AI" value={q} onChange={(e) => setQ(e.target.value)} />
          </form>
        </div>
        <nav className="rap-primary" aria-label="Main navigation">
          {primary.map(([href, label, icon, sec]) => {
            const active = pathname === href || pathname.startsWith(href + "/") || (section === sec && sec !== "Community" && sec !== "Explore");
            return <Link key={href} href={href} title={label} className={active ? "active" : ""}><Ic n={icon} s={26} /><span>{label}</span></Link>;
          })}
        </nav>
        <div className="rap-tools">
          {user ? (
            <>
              <button aria-label="Menu" title="Menu" onClick={() => setMenu(menu === "pages" ? "" : "pages")}><Ic n="waffle" s={21} /></button>
              <Link aria-label="Messages" title="Messages" href="/messages"><Ic n="chat" s={21} />{!!unreadMessages.data?.count && <span className="rap-badge">{badge(unreadMessages.data.count)}</span>}</Link>
              <Link aria-label="Notifications" title="Notifications" href="/notifications"><Ic n="bell" s={21} />{unreadNotifications > 0 && <span className="rap-badge">{badge(unreadNotifications)}</span>}</Link>
              <button aria-label="Your account" onClick={() => setMenu(menu === "account" ? "" : "account")} className="!bg-transparent"><Av name={name} src={user.avatar_url} s={40} /></button>
            </>
          ) : (
            <div className="flex items-center gap-2">
              <Link href="/auth/login" className="rounded-lg px-4 py-2 font-semibold text-[#0866ff] hover:bg-[#e7f0ff]">Sign in</Link>
              <Link href="/auth/register" className="rap-button !py-2">Join now</Link>
            </div>
          )}
        </div>
      </header>

      {!full && (
        <aside className="rap-sidebar" aria-label="Section navigation">
          <div className="rap-side-title">
            {section === "Community" && user ? (
              <Link className="rap-person" href={profileHref(role)}><Av name={name} src={user.avatar_url} s={38} /><b>{name}</b></Link>
            ) : (
              <>
                <h2 className="rap-side-heading">{section === "Explore" ? "Explore" : section}</h2>
                {user && <Link title="Settings" aria-label="Settings" href="/settings"><Ic n="settings" /></Link>}
              </>
            )}
          </div>
          {nav(sections[section].length ? sections[section] : sections.Explore)}
          <div className="rap-divider" />
          <h3 className="rap-side-label">{user ? "Your shortcuts" : "Get started"}</h3>
          {nav(shortcuts)}
          {user && <button className="rap-more" onClick={() => setMenu("pages")}><Ic n="waffle" s={18} />Explore all pages</button>}
          <footer>
            <Link href="/privacy">Privacy</Link> · <Link href="/terms">Terms</Link> · <Link href="/impressum">Impressum</Link> · <Link href="/security">Security</Link>
            <p>Remote AI Platform © {new Date().getFullYear()}</p>
          </footer>
        </aside>
      )}

      <main className={cx("rap-main", full && "rap-main-full", isFeed && user && "rap-main-feed")}>
        <div className="rap-content">{children}</div>
      </main>

      {isFeed && user && <FeedRail role={role} myId={user.id} />}

      <nav className="rap-mobile" aria-label="Mobile navigation">
        {primary.map(([href, label, icon]) => (
          <Link key={href} href={href} className={pathname === href || pathname.startsWith(href + "/") ? "active" : ""}><Ic n={icon} /><span>{label}</span></Link>
        ))}
      </nav>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />

      {menu && user && (
        <div className="rap-overlay" onClick={() => setMenu("")}>
          <div role="dialog" aria-modal="true" aria-label={menu === "pages" ? "Menu" : "Your account"} className={cx("rap-menu", menu === "pages" && "wide")} onClick={(e) => e.stopPropagation()}>
            <div className="rap-menu-head">
              <h2>{menu === "pages" ? "Menu" : "Your account"}</h2>
              <button aria-label="Close menu" onClick={() => setMenu("")}><Ic n="x" /></button>
            </div>
            {menu === "pages" ? (
              <div className="rap-menu-grid">
                {(Object.entries(sections) as Array<[SectionKey, NavItem[]]>).filter(([, rows]) => rows.length).map(([title, rows]) => (
                  <section key={title}><h3>{title}</h3>{nav(rows)}</section>
                ))}
              </div>
            ) : (
              <AccountMenu name={name} avatar={user.avatar_url} email={user.email} role={role} nav={nav} onSignOut={signOut} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const badge = (n: number) => (n > 99 ? "99+" : String(n));

function AccountMenu({ name, avatar, email, role, nav, onSignOut }: { name: string; avatar?: string; email: string; role: Role | null; nav: (rows: NavItem[]) => ReactNode; onSignOut: () => void }) {
  const { currentWorkspace, switchTo, hasEngineerProfile, hasCompanyProfile } = useSwitchWorkspace();
  return (
    <>
      <Link className="rap-person" href={profileHref(role)}>
        <Av name={name} src={avatar} s={48} />
        <span><b className="block">{name}</b><span className="text-xs text-slate-500">{email}</span></span>
      </Link>
      <div className="rap-divider" />
      {nav([
        { href: profileHref(role), label: "View your profile", icon: "user" },
        { href: "/settings", label: "Settings & privacy", icon: "settings" },
        { href: "/security", label: "Security & trust", icon: "shield" },
      ])}
      {currentWorkspace && (
        <>
          <p className="rap-side-label">Workspace</p>
          {([["ENGINEER", "Engineer", "briefcase", hasEngineerProfile], ["COMPANY", "Company", "building", hasCompanyProfile]] as const).map(([r, label, icon, has]) => (
            <button key={r} className="rap-nav" disabled={switchTo.isPending} onClick={() => currentWorkspace !== r && switchTo.mutate(r)} aria-pressed={currentWorkspace === r}>
              <span className="rap-nav-icon"><Ic n={icon} s={22} /></span>
              <span className="flex-1">{label}{!has && currentWorkspace !== r && <span className="ml-2 text-xs text-amber-700">Set up</span>}</span>
              {switchTo.isPending && switchTo.variables === r ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-[#0866ff]" /> : currentWorkspace === r && <Ic n="check" s={18} c="text-[#0866ff]" />}
            </button>
          ))}
        </>
      )}
      <div className="rap-divider" />
      <button className="rap-nav" onClick={onSignOut}><span className="rap-nav-icon"><Ic n="lock" s={22} /></span><span>Sign out</span></button>
    </>
  );
}

function FeedRail({ role, myId }: { role: Role | null; myId: string }) {
  const recs = useRecommendations(1);
  const connections = useConnections(true);
  const job = role === "ENGINEER" ? recs.data?.[0]?.job : undefined;
  const contacts = (connections.data ?? []).filter((c) => c.status === "ACCEPTED").map((c) => otherParty(c, myId)).filter(Boolean).slice(0, 12);

  return (
    <aside className="rap-right" aria-label="Opportunities and contacts">
      {job && (
        <>
          <h3>Recommended opportunity</h3>
          <Link className="rap-opportunity" href={`/jobs/${job.id}`}>
            <span className="rap-company-mark">{(job.company_name || "?").slice(0, 1).toUpperCase()}</span>
            <b>{job.title}</b>
            <p>{job.company_name} · {job.remote_type ? job.remote_type.toLowerCase().replace(/_/g, " ") : "Remote"}</p>
            <span>View opportunity →</span>
          </Link>
          <div className="rap-divider" />
        </>
      )}
      <div className="flex items-center justify-between">
        <h3>Contacts</h3>
        <Link aria-label="Find people" href="/network"><Ic n="search" s={18} /></Link>
      </div>
      {contacts.length ? contacts.map((p) => p && (
        <Link className="rap-contact" key={p.id} href={`/messages?to=${p.id}`}><Av name={p.full_name} src={p.avatar_url} s={37} /><span>{p.full_name}</span></Link>
      )) : (
        <p className="px-2 text-sm text-slate-500">Connect with engineers and companies to see them here. <Link href="/network" className="font-semibold text-[#0866ff]">Grow your network</Link></p>
      )}
    </aside>
  );
}
