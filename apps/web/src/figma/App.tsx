import { useEffect, useState } from "react";
import { goRoute } from "./live";
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

export const REG: Record<string, any> = { submissions: () => <TaskMarketplace initial="submissions" />, reviews: () => <TaskMarketplace initial="reviews" />, worklog: WorkLedger, help: HelpCenter, adminusers: () => <Admin initial="adminusers" />, adminjobs: () => <Admin initial="adminjobs" />, reports: () => <Admin initial="reports" />, verifications: () => <Admin initial="verifications" />, audit: () => <Admin initial="audit" />, sync: () => <Admin initial="sync" />, aiusage: () => <Admin initial="aiusage" />, health: () => <Admin initial="health" />, flags: () => <Admin initial="flags" />, orgs: () => <Admin initial="orgs" />, engineer: EngineerDetail, jobdetail: JobDetail, contractsign: ContractSign, workspace: Workspace, quality: Quality, security: Security, search: Search, coprofile: CoProfile, copayments: CoPayments, taskmarket: TaskMarketplace, terms: Terms, privacy: Privacy, impressum: Impressum, group: GroupDetail, dash: Dashboard, recs: Recs, applications: Applications, saved: Saved, engineers: Engineers, companies: Companies, settings: Settings, onboarding: Onboarding, codash: CoDash, postjob: PostJob, candidates: Candidates, cojobs: CoJobs, admin: Admin, projects: Projects, ride: Ride, jobs: Jobs, profile: Profile, network: Network, company: Company, work: Work, talent: Talent, contracts: Contracts, earnings: Earnings, feed: Feed, groups: Groups, messenger: Messenger, notifications: Notifications };

function App() {
  const read = () => (window.location.hash || "#feed").slice(1).toLowerCase() || "feed";
  const [r, setR] = useState(read());
  useEffect(() => { const f = () => setR(read()); window.addEventListener("hashchange", f); return () => window.removeEventListener("hashchange", f); }, []);
  const go = (x: string) => { goRoute(x); setR(x); window.scrollTo(0, 0); };
  if (["login", "register", "forgot", "reset", "callback"].includes(r)) return <AuthFlow key={r} route={r} go={go} />;
  const Page = REG[r] || NotFound;
  return (
    <AppShell r={r} go={go}>
      <Page go={go} />
    </AppShell>
  );
}

export default App;
