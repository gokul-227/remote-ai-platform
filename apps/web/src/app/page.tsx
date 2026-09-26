"use client";

import dynamic from "next/dynamic";

// The Figma Make app is a client-only SPA (hash routing, sessionStorage), so it
// is rendered in the browser only.
const FigmaApp = dynamic(() => import("@/figma/App"), { ssr: false });

export default function Home() {
  return <FigmaApp />;
}
