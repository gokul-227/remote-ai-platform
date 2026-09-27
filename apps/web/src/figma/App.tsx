import { useEffect, useState } from "react";
import { goRoute } from "./live";
import { useAuth } from "@/lib/auth";
import { Feed, Groups, Messenger, Notifications } from "./rap_social";
import { Jobs, Profile, Network, Company } from "./rap_jobs";
import { Admin } from "./rap_admin";
import {
  Dashboard,
  Recs,
  Applications,
  Saved,
  Engineers,
  Companies,
  Settings,
  Onboarding,
  CoDash,
  PostJob,
  Candidates,
  CoJobs,
} from "./rap_home";
import { AuthFlow } from "./rap_auth";
import {
  EngineerDetail,
  JobDetail,
  ContractSign,
  Workspace,
  Quality,
  Security,
  Search,
  CoProfile,
  Terms,
  Privacy,
  Impressum,
  NotFound,
  GroupDetail,
} from "./rap_pages";
import { AppShell } from "./rap_shell";
import { Projects } from "./rap_projects";
import { Ride } from "./rap_ride";
import { Work, Talent, Contracts, Earnings, CoPayments, TaskMarketplace } from "./rap_work";
import { WorkLedger, HelpCenter } from "./rap_enterprise";

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

export function readRoute(): { route: string; id: string | null } {
  const raw = (window.location.hash || "#feed").slice(1) || "feed";
  const [head, ...rest] = raw.split("/");
  const route = head.toLowerCase() || "feed";
  let id = rest.length ? decodeURIComponent(rest.join("/")) : null;
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
  useEffect(() => {
    const f = () => setLoc(readRoute());
    window.addEventListener("hashchange", f);
    return () => window.removeEventListener("hashchange", f);
  }, []);
  const go = (x: string) => {
    goRoute(x);
    setLoc(readRoute());
    window.scrollTo(0, 0);
  };
  // Visitors land on public job discovery rather than a members-only home feed.
  const r = !user && loc.route === "feed" ? "jobs" : loc.route;
  if (["login", "register", "forgot", "reset", "callback"].includes(r)) return <AuthFlow key={r} route={r} go={go} />;
  const Page = REG[r] || NotFound;
  return (
    <AppShell r={r} go={go}>
      {/* Remount when the resource changes so a screen never shows the previous one. */}
      <Page key={`${r}/${loc.id ?? ""}`} go={go} />
    </AppShell>
  );
}

export default App;
