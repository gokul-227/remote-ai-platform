/**
 * Navigation model for the app shell — the Figma design's section structure
 * (Community / Careers / Workspace / Hiring / Account / Admin) mapped onto the
 * real Next.js routes, filtered by the signed-in user's role.
 */
export type Role = "ENGINEER" | "COMPANY" | "ADMIN";
export type NavItem = { href: string; label: string; icon: string };
export type SectionKey = "Community" | "Careers" | "Workspace" | "Hiring" | "Account" | "Admin" | "Explore";

export function profileHref(role?: Role | null) {
  return role === "COMPANY" ? "/company/profile" : role === "ADMIN" ? "/settings" : "/engineer/profile";
}

export function workspaceHref(role?: Role | null) {
  return role === "ENGINEER" ? "/engineer/workspace" : "/projects";
}

export function sectionsFor(role?: Role | null): Record<SectionKey, NavItem[]> {
  const community: NavItem[] = [
    { href: "/feed", label: "Home", icon: "home" },
    { href: "/network", label: "My network", icon: "users" },
    { href: "/groups", label: "Groups", icon: "users" },
    { href: "/messages", label: "Messages", icon: "chat" },
    { href: "/notifications", label: "Notifications", icon: "bell" },
    { href: profileHref(role), label: "My profile", icon: "user" },
  ];
  const careers: NavItem[] = [
    { href: "/jobs", label: "Discover jobs", icon: "briefcase" },
    { href: "/engineer/recommendations", label: "Recommended for you", icon: "target" },
    { href: "/engineer/applications", label: "My applications", icon: "file" },
    { href: "/saved", label: "Saved jobs", icon: "bookmark" },
    { href: "/engineer/dashboard", label: "Career overview", icon: "chart" },
    { href: "/companies", label: "Explore companies", icon: "building" },
    { href: "/onboarding", label: "Career preferences", icon: "settings" },
  ];
  const workspace: NavItem[] = [
    ...(role === "ENGINEER" ? [{ href: "/engineer/workspace", label: "Overview", icon: "layers" }] : []),
    { href: "/projects", label: "Project board", icon: "board" },
    { href: "/contracts", label: "Contracts", icon: "file" },
    { href: "/payments", label: "Payments", icon: "wallet" },
    { href: "/quality", label: "Quality review", icon: "code" },
  ];
  const hiring: NavItem[] = [
    { href: "/company/dashboard", label: "Hiring overview", icon: "chart" },
    { href: "/company/jobs", label: "Job postings", icon: "briefcase" },
    { href: "/jobs/new", label: "Post a job", icon: "plus" },
    { href: "/company/candidates", label: "Candidates", icon: "users" },
    { href: "/engineers", label: "Discover talent", icon: "search" },
    { href: "/company/profile", label: "Company profile", icon: "building" },
    { href: "/contracts", label: "Contracts", icon: "file" },
    { href: "/payments", label: "Payments", icon: "wallet" },
  ];
  const account: NavItem[] = [
    { href: "/settings", label: "Account settings", icon: "settings" },
    { href: "/security", label: "Security & trust", icon: "shield" },
    { href: profileHref(role), label: "Profile & visibility", icon: "user" },
  ];
  const admin: NavItem[] = [
    { href: "/admin/dashboard", label: "Platform overview", icon: "chart" },
    { href: "/admin/users", label: "People & access", icon: "users" },
    { href: "/admin/jobs", label: "Job moderation", icon: "briefcase" },
  ];
  const explore: NavItem[] = [
    { href: "/jobs", label: "Remote jobs", icon: "briefcase" },
    { href: "/engineers", label: "Engineers", icon: "users" },
    { href: "/companies", label: "Companies", icon: "building" },
  ];

  const empty: NavItem[] = [];
  return {
    Community: role ? community : empty,
    Careers: role === "ENGINEER" ? careers : empty,
    Workspace: role ? workspace : empty,
    Hiring: role === "COMPANY" ? hiring : empty,
    Account: role ? account : empty,
    Admin: role === "ADMIN" ? admin : empty,
    Explore: role ? empty : explore,
  };
}

/** Primary top-bar tabs: [href, label, icon, section]. */
export function primaryFor(role?: Role | null): Array<[string, string, string, SectionKey]> {
  if (!role) return [["/jobs", "Jobs", "briefcase", "Explore"], ["/engineers", "Engineers", "users", "Explore"], ["/companies", "Companies", "building", "Explore"]];
  const tabs: Array<[string, string, string, SectionKey]> = [
    ["/feed", "Home", "home", "Community"],
    ["/network", "My network", "users", "Community"],
  ];
  if (role === "ENGINEER") tabs.push(["/jobs", "Jobs", "briefcase", "Careers"]);
  tabs.push([workspaceHref(role), "Workspace", "board", "Workspace"]);
  if (role === "COMPANY") tabs.push(["/company/dashboard", "Hiring", "building", "Hiring"]);
  if (role === "ADMIN") tabs.push(["/admin/dashboard", "Admin", "shield", "Admin"]);
  return tabs;
}

/** Longest-prefix match of the current path against every nav item. */
export function activeHref(pathname: string, items: NavItem[]): string | undefined {
  let best: string | undefined;
  for (const { href } of items) {
    const hit = pathname === href || pathname.startsWith(href + "/");
    if (hit && (!best || href.length > best.length)) best = href;
  }
  return best;
}

export function sectionOf(pathname: string, sections: Record<SectionKey, NavItem[]>, role?: Role | null): SectionKey {
  // Detail routes that belong to a section without being listed in it.
  if (/^\/jobs\/[^/]+$/.test(pathname) && pathname !== "/jobs/new") return role === "COMPANY" ? "Hiring" : role ? "Careers" : "Explore";
  if (/^\/(engineers|companies)(\/|$)/.test(pathname) && role === "COMPANY") return "Hiring";
  if (pathname.startsWith("/contracts") || pathname.startsWith("/payments")) return role === "COMPANY" ? "Hiring" : "Workspace";
  let best: SectionKey | undefined;
  let bestLen = -1;
  (Object.keys(sections) as SectionKey[]).forEach((key) => {
    const hit = activeHref(pathname, sections[key]);
    if (hit && hit.length > bestLen) { best = key; bestLen = hit.length; }
  });
  return best ?? (role ? "Community" : "Explore");
}
