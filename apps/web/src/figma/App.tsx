import { Suspense, lazy, useEffect, useState } from "react";
import { AUTH_ROUTES, goRoute, rememberReturnTo } from "./live";
import { useAuth } from "@/lib/auth";
import { Jobs, Profile, Network, Company } from "./rap_jobs";
import { AuthFlow } from "./rap_auth";
import { AppShell } from "./rap_shell";

// Screens load when first opened: a visitor on the job list doesn't download
// the admin console, project boards or workspace. Jobs, sign-in and the shell
// stay in the first bundle.
const Feed = lazy(() => import("./rap_social").then((m) => ({ default: m.Feed })));
const Groups = lazy(() => import("./rap_social").then((m) => ({ default: m.Groups })));
const Messenger = lazy(() => import("./rap_social").then((m) => ({ default: m.Messenger })));
const Notifications = lazy(() => import("./rap_social").then((m) => ({ default: m.Notifications })));
const Admin = lazy(() => import("./rap_admin").then((m) => ({ default: m.Admin })));
const Dashboard = lazy(() => import("./rap_home").then((m) => ({ default: m.Dashboard })));
const Recs = lazy(() => import("./rap_home").then((m) => ({ default: m.Recs })));
const Applications = lazy(() => import("./rap_home").then((m) => ({ default: m.Applications })));
const Saved = lazy(() => import("./rap_home").then((m) => ({ default: m.Saved })));
const Engineers = lazy(() => import("./rap_home").then((m) => ({ default: m.Engineers })));
const Companies = lazy(() => import("./rap_home").then((m) => ({ default: m.Companies })));
const Settings = lazy(() => import("./rap_home").then((m) => ({ default: m.Settings })));
const Onboarding = lazy(() => import("./rap_home").then((m) => ({ default: m.Onboarding })));
const CoDash = lazy(() => import("./rap_home").then((m) => ({ default: m.CoDash })));
const PostJob = lazy(() => import("./rap_home").then((m) => ({ default: m.PostJob })));
const Candidates = lazy(() => import("./rap_home").then((m) => ({ default: m.Candidates })));
const CoJobs = lazy(() => import("./rap_home").then((m) => ({ default: m.CoJobs })));
const EngineerDetail = lazy(() => import("./rap_pages").then((m) => ({ default: m.EngineerDetail })));
const JobDetail = lazy(() => import("./rap_pages").then((m) => ({ default: m.JobDetail })));
const ContractSign = lazy(() => import("./rap_pages").then((m) => ({ default: m.ContractSign })));
const Workspace = lazy(() => import("./rap_pages").then((m) => ({ default: m.Workspace })));
const Quality = lazy(() => import("./rap_pages").then((m) => ({ default: m.Quality })));
const Security = lazy(() => import("./rap_pages").then((m) => ({ default: m.Security })));
const Search = lazy(() => import("./rap_pages").then((m) => ({ default: m.Search })));
const CoProfile = lazy(() => import("./rap_pages").then((m) => ({ default: m.CoProfile })));
const Terms = lazy(() => import("./rap_pages").then((m) => ({ default: m.Terms })));
const Privacy = lazy(() => import("./rap_pages").then((m) => ({ default: m.Privacy })));
const Impressum = lazy(() => import("./rap_pages").then((m) => ({ default: m.Impressum })));
const NotFound = lazy(() => import("./rap_pages").then((m) => ({ default: m.NotFound })));
const GroupDetail = lazy(() => import("./rap_pages").then((m) => ({ default: m.GroupDetail })));
const Projects = lazy(() => import("./rap_projects").then((m) => ({ default: m.Projects })));
const Ride = lazy(() => import("./rap_ride").then((m) => ({ default: m.Ride })));
const Work = lazy(() => import("./rap_work").then((m) => ({ default: m.Work })));
const Talent = lazy(() => import("./rap_work").then((m) => ({ default: m.Talent })));
const Contracts = lazy(() => import("./rap_work").then((m) => ({ default: m.Contracts })));
const Earnings = lazy(() => import("./rap_work").then((m) => ({ default: m.Earnings })));
const CoPayments = lazy(() => import("./rap_work").then((m) => ({ default: m.CoPayments })));
const TaskMarketplace = lazy(() => import("./rap_work").then((m) => ({ default: m.TaskMarketplace })));
const WorkLedger = lazy(() => import("./rap_enterprise").then((m) => ({ default: m.WorkLedger })));
const HelpCenter = lazy(() => import("./rap_enterprise").then((m) => ({ default: m.HelpCenter })));

export const REG: Record<string, any> = {
  submissions: () => <TaskMarketplace initial="submissions" />,
  reviews: () => <TaskMarketplace initial="reviews" />,
  worklog: WorkLedger,
  help: HelpCenter,
  adminusers: () => <Admin initial="adminusers" />,
  adminjobs: () => <Admin initial="adminjobs" />,
  reports: () => <Admin initial="reports" />,
  verifications: () => <Admin initial="verifications" />,
  audit: () => <Admin initial="audit" />,
  sync: () => <Admin initial="sync" />,
  aiusage: () => <Admin initial="aiusage" />,
  health: () => <Admin initial="health" />,
  flags: () => <Admin initial="flags" />,
  orgs: () => <Admin initial="orgs" />,
  engineer: EngineerDetail,
  jobdetail: JobDetail,
  contractsign: ContractSign,
  workspace: Workspace,
  quality: Quality,
  security: Security,
  search: Search,
  coprofile: CoProfile,
  copayments: CoPayments,
  taskmarket: TaskMarketplace,
  terms: Terms,
  privacy: Privacy,
  impressum: Impressum,
  group: GroupDetail,
  dash: Dashboard,
  recs: Recs,
  applications: Applications,
  saved: Saved,
  engineers: Engineers,
  companies: Companies,
  settings: Settings,
  onboarding: Onboarding,
  codash: CoDash,
  postjob: PostJob,
  candidates: Candidates,
  cojobs: CoJobs,
  admin: Admin,
  projects: Projects,
  ride: Ride,
  jobs: Jobs,
  profile: Profile,
  network: Network,
  company: Company,
  work: Work,
  talent: Talent,
  contracts: Contracts,
  earnings: Earnings,
  feed: Feed,
  groups: Groups,
  messenger: Messenger,
  notifications: Notifications,
};

/**
 * Detail screens read the selected resource from browser storage. Putting its
 * id in the URL (#engineer/<id>) makes links shareable, refresh-safe and
 * bookmarkable: an id in the URL is written to that storage key before the
 * screen renders, and a bare #engineer is rewritten to include the stored id.
 */
export const ID_ROUTES: Record<string, { key: string; store: "local" | "session" }> = {
  engineer: { key: "rap-person-id", store: "session" },
  jobdetail: { key: "rap-selected-job", store: "local" },
  company: { key: "rap-company-id", store: "session" },
  contractsign: { key: "rap-contract-id", store: "session" },
  group: { key: "rap-group-id", store: "session" },
};
const storeOf = (s: "local" | "session") => (s === "local" ? localStorage : sessionStorage);

// A malformed percent-escape ("#job/%E0%A4") makes decodeURIComponent throw,
// which would crash the whole app while reading its initial route. Keep the
// raw text instead so the link still reaches its page (UX-01).
const safeDecode = (s: string) => {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
};

export function readRoute(): { route: string; id: string | null } {
  const raw = (window.location.hash || "#feed").slice(1) || "feed";
  const [head, ...rest] = raw.split("/");
  const route = head.toLowerCase() || "feed";
  let id = rest.length ? safeDecode(rest.join("/")) : null;
  const spec = ID_ROUTES[route];
  if (spec) {
    try {
      if (id) storeOf(spec.store).setItem(spec.key, id);
      else {
        id = storeOf(spec.store).getItem(spec.key);
        if (id)
          window.history.replaceState(
            null,
            "",
            `${window.location.pathname}${window.location.search}#${route}/${encodeURIComponent(id)}`,
          );
      }
    } catch {
      // Storage unavailable (private mode): the URL id still identifies the page.
    }
  }
  return { route, id: spec ? id : null };
}

function App() {
  const { user } = useAuth();
  const [loc, setLoc] = useState(readRoute);
  // Going to sign in remembers where you were, so signing in brings you back.
  const moveTo = (next: ReturnType<typeof readRoute>, from: ReturnType<typeof readRoute>) => {
    if (next.route === "login" && !AUTH_ROUTES.includes(from.route))
      rememberReturnTo(from.id ? `${from.route}/${encodeURIComponent(from.id)}` : from.route);
    return next;
  };
  useEffect(() => {
    const f = () => setLoc((from) => moveTo(readRoute(), from));
    window.addEventListener("hashchange", f);
    return () => window.removeEventListener("hashchange", f);
  }, []);
  const go = (x: string) => {
    goRoute(x);
    setLoc((from) => moveTo(readRoute(), from));
    window.scrollTo(0, 0);
  };
  // Visitors land on public job discovery rather than a members-only home feed.
  const r = !user && loc.route === "feed" ? "jobs" : loc.route;
  if (AUTH_ROUTES.includes(r)) return <AuthFlow key={r} route={r} go={go} />;
  const Page = REG[r] || NotFound;
  return (
    <AppShell r={r} go={go}>
      {/* Remount when the resource changes so a screen never shows the previous one. */}
      <Suspense fallback={<p className="p-8 text-slate-500">Loading…</p>}>
        <Page key={`${r}/${loc.id ?? ""}`} go={go} />
      </Suspense>
    </AppShell>
  );
}

export default App;
