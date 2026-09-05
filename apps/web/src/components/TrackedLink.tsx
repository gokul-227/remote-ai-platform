"use client";

import Link, { LinkProps } from "next/link";
import { ReactNode } from "react";
import { trackEvent } from "@/lib/analytics";

interface TrackedLinkProps extends LinkProps {
  className?: string;
  children: ReactNode;
  /** Analytics event name fired on click — kept to a small, fixed vocabulary server-side. */
  eventName: string;
  eventProperties?: Record<string, string | number | boolean>;
}

/**
 * A `next/link` that also fires a first-party analytics event on click.
 * A tiny client component so the pages that use it (e.g. the landing page)
 * can otherwise stay server components.
 */
export function TrackedLink({ eventName, eventProperties, onClick, ...props }: TrackedLinkProps) {
  return (
    <Link
      {...props}
      onClick={(e) => {
        trackEvent(eventName, eventProperties);
        onClick?.(e);
      }}
    />
  );
}
