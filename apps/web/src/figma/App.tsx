import { useEffect, useState } from "react";
import { Ic, Av, Brand, Btn, Card, Tag, cx, Field, inputCls, Bar } from "./rap_kit";
import { Feed, Groups, Messenger, Notifications } from "./rap_social";
import { Jobs, Profile, Network, Company } from "./rap_jobs";
import { Admin } from "./rap_admin";
import { Dashboard, Recs, Applications, Saved, Engineers, Companies, Settings, Onboarding, CoDash, PostJob, Candidates, CoJobs } from "./rap_home";
import { AuthFlow } from "./rap_auth";
import { EngineerDetail, JobDetail, ContractSign, Workspace, Quality, Security, Search, CoProfile, Terms, Privacy, Impressum, NotFound, GroupDetail } from "./rap_pages";
import { AppShell } from "./rap_shell";
import { Projects } from "./rap_projects";
import { Ride } from "./rap_ride";
import { Work, Talent, Contracts, Earnings, CoPayments, TaskMarketplace } from "./rap_work";
import { WorkLedger, HelpCenter } from "./rap_enterprise";

type Mod = { k: string; l: string; i: string; sub: [string, string][]; accent: string };
const MODS: Mod[] = [
  { k: "social", l: "Social", i: "home", accent: "#0552CC", sub: [["feed", "Feed"], ["groups", "Groups"], ["messenger", "Messenger"], ["notifications", "Notifications"], ["saved", "Saved"], ["settings", "Settings"], ["onboarding", "Get started"], ["group", "Group page"], ["search", "Search"], ["security", "Security"]] },
  { k: "jobs", l: "Jobs", i: "briefcase", accent: "#0552CC", sub: [["jobs", "Jobs"], ["recs", "Recommended"], ["applications", "Applications"], ["profile", "My profile"], ["network", "My network"], ["engineers", "Engineers"], ["companies", "Companies"], ["company", "Company page"], ["jobdetail", "Job detail"], ["engineer", "Engineer profile"]] },
  { k: "work", l: "Freelance", i: "dollar", accent: "#0552CC", sub: [["work", "Find work"], ["talent", "Find talent"], ["contracts", "Contracts"], ["earnings", "Earnings"], ["dash", "Dashboard"], ["contractsign", "Contract offer"], ["workspace", "Workspace"], ["quality", "Code quality"], ["taskmarket", "Task offers"]] },
  { k: "projects", l: "Projects", i: "board", accent: "#0552CC", sub: [["projects", "Board"]] },
  { k: "ride", l: "Hiring", i: "building", accent: "#0552CC", sub: [["codash", "Dashboard"], ["postjob", "Post a job"], ["candidates", "Candidates"], ["cojobs", "Job postings"], ["copayments", "Payments"], ["coprofile", "Company profile"]] },
  { k: "admin", l: "Admin", i: "shield", accent: "#0552CC", sub: [["admin", "Console"]] },
];
const modOf = (r: string) => MODS.find((m) => m.sub.some((s) => s[0] === r)) || MODS[0];

export const REG: Record<string, any> = { submissions: () => <TaskMarketplace initial="submissions" />, reviews: () => <TaskMarketplace initial="reviews" />, worklog: WorkLedger, help: HelpCenter, adminusers: () => <Admin initial="adminusers" />, adminjobs: () => <Admin initial="adminjobs" />, reports: () => <Admin initial="reports" />, verifications: () => <Admin initial="verifications" />, audit: () => <Admin initial="audit" />, sync: () => <Admin initial="sync" />, aiusage: () => <Admin initial="aiusage" />, health: () => <Admin initial="health" />, flags: () => <Admin initial="flags" />, orgs: () => <Admin initial="orgs" />, engineer: EngineerDetail, jobdetail: JobDetail, contractsign: ContractSign, workspace: Workspace, quality: Quality, security: Security, search: Search, coprofile: CoProfile, copayments: CoPayments, taskmarket: TaskMarketplace, terms: Terms, privacy: Privacy, impressum: Impressum, group: GroupDetail, dash: Dashboard, recs: Recs, applications: Applications, saved: Saved, engineers: Engineers, companies: Companies, settings: Settings, onboarding: Onboarding, codash: CoDash, postjob: PostJob, candidates: Candidates, cojobs: CoJobs, admin: Admin, projects: Projects, ride: Ride, jobs: Jobs, profile: Profile, network: Network, company: Company, work: Work, talent: Talent, contracts: Contracts, earnings: Earnings, feed: Feed, groups: Groups, messenger: Messenger, notifications: Notifications };

function Soon({ r }: { r: string }) {
  return <div className="mx-auto max-w-xl p-16 text-center text-slate-500"><Ic n="layers" s={40} c="mx-auto mb-3" /><p className="text-lg font-bold text-slate-800">{r}</p><p>This workspace is fully wired; select a surface above to continue designing the workflow.</p></div>;
}

function Auth({ mode, go }: { mode: "login" | "register"; go: (r: string) => void }) {
  const [role, setRole] = useState("engineer");
  const [pw, setPw] = useState("");
  const rules = [["8+ characters", pw.length >= 8], ["One number", /[0-9]/.test(pw)], ["One uppercase letter", /[A-Z]/.test(pw)]];
  return (
    <div className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      <div className="relative hidden overflow-hidden bg-gradient-to-br from-[#031B4E] via-[#0552CC] to-[#5B4BDB] p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="flex items-center gap-3"><Brand s={40} /><span className="text-xl font-black">Remote-AI-Platform</span></div>
        <div>
          <h1 className="max-w-lg text-5xl font-black leading-tight">The operating system for remote AI teams.</h1>
          <p className="mt-4 max-w-md text-lg text-white/80">Hire, work, deliver and get paid, with explainable AI matching from first message to final milestone.</p>
          <div className="mt-8 grid max-w-lg grid-cols-3 gap-3">{[["48K+", "Verified engineers"], ["6.2K", "Hiring companies"], ["$212M", "Paid via escrow"]].map(([v, l]) => <div key={l} className="rounded-xl bg-white/10 p-4 backdrop-blur"><p className="text-2xl font-black">{v}</p><p className="text-xs text-white/70">{l}</p></div>)}</div>
          <div className="mt-6 max-w-lg rounded-xl bg-white/10 p-5 backdrop-blur"><div className="flex items-center gap-3"><Av name="Priya Raman" s={44} /><div><p className="font-bold">Priya Raman</p><p className="text-xs text-white/70">Staff ML Engineer - matched in 4 minutes</p></div><Tag t="green">97% match</Tag></div><p className="mt-3 text-sm text-white/85">"The match explanation told me exactly why the role fit and which skills to sharpen. I signed a contract in a week."</p></div>
        </div>
        <p className="text-xs text-white/60">SOC 2 aligned - GDPR ready - Escrow protected payments</p>
      </div>
      <div className="flex items-center justify-center bg-white p-8">
        <div className="w-full max-w-md">
          <div className="mb-8 flex items-center gap-2 lg:hidden"><Brand /><b className="text-lg">Remote-AI-Platform</b></div>
          <h2 className="text-3xl font-black">{mode === "login" ? "Sign in" : "Join Remote-AI-Platform"}</h2>
          <p className="mt-1 text-slate-500">{mode === "login" ? "Welcome back. Stay on top of work, network and projects." : "Create your account in under two minutes."}</p>
          {mode === "register" && (
            <div className="mt-6 grid grid-cols-2 gap-3">{[["engineer", "briefcase", "I want to work", "Find roles and projects, get matched by AI"], ["company", "building", "I want to hire", "Post jobs, discover talent, manage contracts"]].map(([k, i, t, d]) => <button key={k} onClick={() => setRole(k)} className={cx("rounded-xl border-2 p-4 text-left transition", role === k ? "border-[#0552CC] bg-[#F0F6FF]" : "border-slate-200 hover:border-slate-300")}><Ic n={i} c="text-[#0552CC]" s={24} /><p className="mt-2 font-bold">{t}</p><p className="text-xs text-slate-500">{d}</p></button>)}</div>
          )}
          <div className="mt-6 space-y-4">
            {mode === "register" && <div className="grid grid-cols-2 gap-3"><Field label="First name"><input className={inputCls} placeholder="Gokul" /></Field><Field label="Last name"><input className={inputCls} placeholder="Raj" /></Field></div>}
            <Field label="Work email"><input className={inputCls} placeholder="you@company.com" /></Field>
            <Field label="Password"><input type="password" value={pw} onChange={(e) => setPw(e.target.value)} className={inputCls} placeholder="Enter password" /></Field>
            {mode === "register" && <div className="flex flex-wrap gap-2">{rules.map(([l, ok]) => <span key={String(l)} className={cx("flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold", ok ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500")}><Ic n="check" s={12} />{l}</span>)}</div>}
            {mode === "login" && <div className="flex justify-between text-sm"><label className="flex items-center gap-2"><input type="checkbox" defaultChecked />Keep me signed in</label><button className="font-semibold text-[#0552CC]">Forgot password?</button></div>}
            <Btn full onClick={() => go("feed")} c="!py-3 text-base">{mode === "login" ? "Sign in" : "Agree and join"}</Btn>
            <div className="flex items-center gap-3 text-xs text-slate-400"><span className="h-px flex-1 bg-slate-200" />OR<span className="h-px flex-1 bg-slate-200" /></div>
            <Btn v="line" full onClick={() => go("feed")} c="!py-2.5">Continue with Google</Btn>
            <Btn v="line" full onClick={() => go("feed")} c="!py-2.5">Continue with Microsoft</Btn>
          </div>
          <p className="mt-6 text-center text-sm text-slate-600">{mode === "login" ? "New to Remote-AI-Platform? " : "Already a member? "}<button onClick={() => go(mode === "login" ? "register" : "login")} className="font-bold text-[#0552CC]">{mode === "login" ? "Join now" : "Sign in"}</button></p>
          <p className="mt-6 text-center text-xs text-slate-400">By continuing you accept the User Agreement, Privacy Policy and Cookie Policy.</p>
        </div>
      </div>
    </div>
  );
}

function TopBar({ r, go }: { r: string; go: (r: string) => void }) {
  const m = modOf(r);
  const [menu, setMenu] = useState<string | null>(null);
  const [q, setQ] = useState("");
  return (
    <header className="sticky top-0 z-50 border-b border-slate-200 bg-white">
      <div className="flex h-14 items-center gap-3 px-4">
        <button onClick={() => go("feed")} className="flex items-center gap-2"><Brand /><span className="hidden text-lg font-black tracking-tight xl:block">Remote-AI-Platform</span></button>
        <div className="relative">
          <button onClick={() => setMenu(menu === "apps" ? null : "apps")} className="rounded-full p-2 text-slate-600 hover:bg-slate-100"><Ic n="waffle" /></button>
          {menu === "apps" && <div className="absolute left-0 top-11 z-50 w-80 rounded-2xl border border-slate-200 bg-white p-3 shadow-2xl"><p className="px-2 pb-2 text-xs font-bold uppercase tracking-wider text-slate-500">Your products</p><div className="grid grid-cols-3 gap-2">{MODS.map((x) => <button key={x.k} onClick={() => { go(x.sub[0][0]); setMenu(null); }} className="flex flex-col items-center gap-1.5 rounded-xl p-3 hover:bg-slate-100"><span className="flex h-11 w-11 items-center justify-center rounded-xl text-white" style={{ background: x.accent }}><Ic n={x.i} /></span><span className="text-xs font-semibold">{x.l}</span></button>)}</div></div>}
        </div>
        <div className="relative hidden max-w-md flex-1 md:block"><Ic n="search" s={18} c="absolute left-3 top-2.5 text-slate-400" /><input value={q} onChange={(e) => setQ(e.target.value)} onFocus={() => setMenu("search")} placeholder="Search jobs, people, companies, projects" className="h-10 w-full rounded-full bg-slate-100 pl-10 pr-4 text-sm outline-none focus:bg-white focus:ring-2 focus:ring-[#0552CC]/30" />
          {menu === "search" && <div className="absolute left-0 right-0 top-12 z-50 rounded-2xl border border-slate-200 bg-white p-2 shadow-2xl">{[["briefcase", "Senior AI Platform Engineer", "Jobs"], ["user", "Priya Raman", "People"], ["building", "Helix Labs", "Companies"], ["board", "RAI Sprint 12", "Projects"]].map(([i, t, g]) => <button key={t} onClick={() => setMenu(null)} className="flex w-full items-center gap-3 rounded-lg p-2.5 text-left hover:bg-slate-100"><Ic n={i} c="text-slate-500" /><span className="flex-1 text-sm font-semibold">{t}</span><Tag>{g}</Tag></button>)}</div>}
        </div>
        <nav className="mx-auto hidden items-center gap-1 lg:flex">{MODS.slice(0, 5).map((x) => <button key={x.k} onClick={() => go(x.sub[0][0])} className={cx("flex min-w-[76px] flex-col items-center gap-0.5 border-b-2 px-3 py-1.5 text-[11px] font-semibold", m.k === x.k ? "border-current" : "border-transparent text-slate-500 hover:text-slate-900")} style={m.k === x.k ? { color: x.accent } : {}}><Ic n={x.i} s={22} />{x.l}</button>)}</nav>
        <div className="ml-auto flex items-center gap-1">
          <button onClick={() => go("feed")} className="hidden items-center gap-1 rounded-full bg-gradient-to-r from-[#0552CC] to-[#5B4BDB] px-3 py-1.5 text-sm font-bold text-white md:flex"><Ic n="spark" s={16} />Ask AI</button>
          {[["chat", "messenger"], ["bell", "notifications"]].map(([i, k]) => <button key={i} onClick={() => go(k)} className="relative rounded-full p-2.5 text-slate-600 hover:bg-slate-100"><Ic n={i} />{<span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">{i === "bell" ? 7 : 2}</span>}</button>)}
          <div className="relative"><button onClick={() => setMenu(menu === "me" ? null : "me")} className="ml-1 flex items-center gap-1 rounded-full p-1 hover:bg-slate-100"><Av name="Gokul Raj" s={34} /><Ic n="down" s={14} c="text-slate-500" /></button>
            {menu === "me" && <div className="absolute right-0 top-12 z-50 w-72 rounded-2xl border border-slate-200 bg-white p-3 shadow-2xl"><div className="flex items-center gap-3 p-2"><Av name="Gokul Raj" s={48} /><div><p className="font-bold">Gokul Raj</p><p className="text-xs text-slate-500">Founder - Remote-AI-Platform</p></div></div><Btn v="outline" full sm onClick={() => { go("profile"); setMenu(null); }}>View profile</Btn><div className="mt-2 border-t border-slate-100 pt-2 text-sm">{[["Switch workspace: Engineer", "user"], ["Switch workspace: Company", "building"], ["Admin console", "shield"], ["Settings and privacy", "settings"], ["Help center", "question"]].map(([l, i]) => <button key={l} onClick={() => { if (l === "Admin console") go("admin"); setMenu(null); }} className="flex w-full items-center gap-3 rounded-lg p-2 text-left font-semibold text-slate-700 hover:bg-slate-100"><Ic n={i} s={18} />{l}</button>)}<button onClick={() => go("login")} className="flex w-full items-center gap-3 rounded-lg p-2 text-left font-semibold text-slate-700 hover:bg-slate-100"><Ic n="lock" s={18} />Sign out</button></div></div>}
          </div>
        </div>
      </div>
      {m.sub.length > 1 && <div className="flex items-center gap-1 border-t border-slate-100 bg-white px-4"><span className="mr-3 flex items-center gap-1.5 py-2 text-xs font-black uppercase tracking-wider" style={{ color: m.accent }}><Ic n={m.i} s={14} />{m.l}</span>{m.sub.map((s) => <button key={s[0]} onClick={() => go(s[0])} className={cx("border-b-2 px-3 py-2 text-sm font-semibold", r === s[0] ? "border-current" : "border-transparent text-slate-500 hover:text-slate-900")} style={r === s[0] ? { color: m.accent } : {}}>{s[1]}</button>)}</div>}
    </header>
  );
}

function App() {
  const read = () => (window.location.hash || "#feed").slice(1).toLowerCase() || "feed";
  const [r, setR] = useState(read());
  useEffect(() => { const f = () => setR(read()); window.addEventListener("hashchange", f); return () => window.removeEventListener("hashchange", f); }, []);
  const go = (x: string) => { window.location.hash = x; setR(x); window.scrollTo(0, 0); };
  if (["login", "register", "forgot", "reset", "callback"].includes(r)) return <AuthFlow route={r} go={go} />;
  const Page = REG[r] || (() => <NotFound />);
  const mod = modOf(r);
  return (
    <AppShell r={r} go={go} mods={MODS} mod={mod}>
      <Page go={go} />
    </AppShell>
  );
}

export default App;
