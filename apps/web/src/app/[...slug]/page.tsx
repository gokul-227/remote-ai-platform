"use client";

import { use, useEffect } from "react";

/** Old path-based URLs → the Figma app's hash routes, so existing links and bookmarks still land on the right screen. */
const ROUTES: Array<[RegExp, string]> = [
  [/^auth\/login$/, "login"], [/^auth\/register$/, "register"], [/^auth\/forgot-password$/, "forgot"],
  [/^auth\/reset-password$/, "reset"], [/^auth\/callback$/, "callback"],
  [/^jobs\/new$/, "postjob"], [/^jobs\/[^/]+$/, "jobdetail"], [/^jobs$/, "jobs"], [/^saved$/, "saved"],
  [/^engineer\/dashboard$/, "dash"], [/^engineer\/recommendations$/, "recs"], [/^engineer\/applications$/, "applications"],
  [/^engineer\/profile$|^profile$/, "profile"], [/^(engineer\/)?workspace$/, "workspace"],
  [/^engineers\/[^/]+$/, "engineer"], [/^engineers$|^freelancers$/, "engineers"],
  [/^companies\/[^/]+$/, "company"], [/^companies$/, "companies"],
  [/^company\/dashboard$/, "codash"], [/^company\/jobs$/, "cojobs"], [/^company\/candidates$/, "candidates"], [/^company\/profile$/, "coprofile"],
  [/^messages$/, "messenger"], [/^payments$/, "earnings"], [/^contracts\/[^/]+$/, "contractsign"],
  [/^groups\/[^/]+$/, "group"], [/^projects\/[^/]+$/, "projects"], [/^admin(\/.*)?$/, "admin"],
  [/^(feed|network|groups|notifications|projects|contracts|quality|settings|security|search|onboarding|privacy|terms|impressum)$/, ""],
];

export default function LegacyRedirect({ params }: { params: Promise<{ slug: string[] }> }) {
  const { slug } = use(params);
  useEffect(() => {
    const path = slug.join("/");
    const hit = ROUTES.find(([re]) => re.test(path));
    const route = hit ? hit[1] || path : "notfound";
    window.location.replace(`/#${route}`);
  }, [slug]);
  return null;
}
