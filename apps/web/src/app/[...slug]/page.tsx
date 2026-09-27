"use client";

import { use, useEffect } from "react";

/** Old path-based URLs → the Figma app's hash routes, so existing links and bookmarks still land on the right screen. */
const ROUTES: Array<[RegExp, string]> = [
  [/^auth\/login$/, "login"],
  [/^auth\/register$/, "register"],
  [/^auth\/forgot-password$/, "forgot"],
  [/^auth\/reset-password$/, "reset"],
  [/^auth\/callback$/, "callback"],
  [/^jobs\/new$/, "postjob"],
  [/^jobs\/([^/]+)$/, "jobdetail/$1"],
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

export default function LegacyRedirect({ params }: { params: Promise<{ slug: string[] }> }) {
  const { slug } = use(params);
  useEffect(() => {
    const path = slug.join("/");
    const hit = ROUTES.find(([re]) => re.test(path));
    // "$1" carries a resource id from the old path into the hash route.
    const route = hit ? (hit[1] ? path.replace(hit[0], hit[1]) : path) : "notfound";
    // Keep the query (e.g. ?token= on password-reset links) for the Figma screen.
    window.location.replace(`/${window.location.search}#${route}`);
  }, [slug]);
  return null;
}
