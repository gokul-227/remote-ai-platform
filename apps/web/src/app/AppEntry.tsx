"use client";

import dynamic from "next/dynamic";
import { useSyncExternalStore, type ReactNode } from "react";
import { useAuth } from "@/lib/auth";

const FigmaApp = dynamic(() => import("@/figma/App"), { ssr: false });
const subscribe = (notify: () => void) => {
  window.addEventListener("hashchange", notify);
  window.addEventListener("popstate", notify);
  return () => {
    window.removeEventListener("hashchange", notify);
    window.removeEventListener("popstate", notify);
  };
};
const hasRoute = () => window.location.hash.length > 1;
const serverRoute = () => false;

/** Preserve hash links and member sessions while serving useful public HTML. */
export function AppEntry({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const routed = useSyncExternalStore(subscribe, hasRoute, serverRoute);
  return routed || user ? <FigmaApp /> : children;
}
