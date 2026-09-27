"use client";

import { useEffect } from "react";

/** Sends an old path-based URL to the app's hash route (kept for existing links). */
export default function LegacyRedirect({ route }: { route: string }) {
  useEffect(() => {
    // Keep the query (e.g. ?token= on password-reset links) for the app screen.
    window.location.replace(`/${window.location.search}#${route}`);
  }, [route]);
  return null;
}
