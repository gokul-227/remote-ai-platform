import { notFound } from "next/navigation";
import LegacyRedirect from "./LegacyRedirect";

/** Old path-based URLs → the app's hash routes, so existing links and bookmarks still land on the right screen.
 * Anything else is a real 404 (it used to answer 200 with the app shell). /jobs/<id> has its own public page. */
const ROUTES: Array<[RegExp, string]> = [
  [/^auth\/login$/, "login"],
  [/^auth\/register$/, "register"],
  [/^auth\/forgot-password$/, "forgot"],
  [/^auth\/reset-password$/, "reset"],
  [/^auth\/callback$/, "callback"],
  [/^jobs\/new$/, "postjob"],
  [/^jobs$/, "jobs"],
  [/^saved$/, "saved"],
  [/^engineer\/dashboard$/, "dash"],
  [/^engineer\/recommendations$/, "recs"],
  [/^engineer\/applications$/, "applications"],
  [/^engineer\/profile$|^profile$/, "profile"],
  [/^(engineer\/)?workspace$/, "workspace"],
  [/^(?:engineers|professionals)\/([^/]+)$/, "engineer/$1"],
  [/^engineers$|^freelancers$|^professionals$/, "engineers"],
  [/^companies\/([^/]+)$/, "company/$1"],
  [/^companies$/, "companies"],
  [/^company\/dashboard$/, "codash"],
  [/^company\/jobs$/, "cojobs"],
  [/^company\/candidates$/, "candidates"],
  [/^company\/profile$/, "coprofile"],
  [/^messages$/, "messenger"],
  [/^payments$/, "earnings"],
  [/^contracts\/([^/]+)$/, "contractsign/$1"],
  [/^groups\/([^/]+)$/, "group/$1"],
  [/^projects\/[^/]+$/, "projects"],
  [/^admin(\/.*)?$/, "admin"],
  [
    /^(feed|network|groups|notifications|projects|contracts|quality|settings|security|search|onboarding|privacy|terms|impressum)$/,
    "",
  ],
];

export default async function LegacyPath({ params }: { params: Promise<{ slug: string[] }> }) {
  const path = (await params).slug.join("/");
  const hit = ROUTES.find(([re]) => re.test(path));
  if (!hit) notFound();
  // "$1" carries a resource id from the old path into the hash route.
  return <LegacyRedirect route={hit[1] ? path.replace(hit[0], hit[1]) : path} />;
}
