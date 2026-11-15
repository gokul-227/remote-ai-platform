"use client";

import { useEffect, useState } from "react";
import { SHARE_LABELS, SHARE_NETWORKS, shareUrl, withUtm, type ShareNetwork } from "@/lib/share";

// Simplified brand marks (inline SVG, no external requests).
const ICONS: Record<ShareNetwork | "copy" | "native", string> = {
  linkedin:
    "M4.98 3.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5zM3 9.5h4V21H3zM9.5 9.5h3.8v1.6h.05c.53-1 1.83-2.05 3.77-2.05 4.03 0 4.78 2.65 4.78 6.1V21h-4v-5.1c0-1.22-.02-2.78-1.7-2.78-1.7 0-1.96 1.33-1.96 2.7V21h-4z",
  x: "M17.75 3h3.07l-6.7 7.66L22 21h-6.17l-4.83-6.32L5.47 21H2.4l7.17-8.2L2 3h6.33l4.37 5.78zm-1.08 16.17h1.7L7.4 4.74H5.57z",
  facebook:
    "M22 12a10 10 0 1 0-11.56 9.88v-6.99H7.9V12h2.54V9.8c0-2.5 1.49-3.89 3.78-3.89 1.09 0 2.24.2 2.24.2v2.46h-1.26c-1.24 0-1.63.77-1.63 1.56V12h2.78l-.44 2.89h-2.34v6.99A10 10 0 0 0 22 12z",
  whatsapp:
    "M12.04 2a9.9 9.9 0 0 0-8.5 14.98L2 22l5.15-1.5A9.9 9.9 0 1 0 12.04 2zm5.8 14.03c-.25.7-1.45 1.33-2 1.38-.53.05-1.03.24-3.47-.72-2.93-1.16-4.8-4.15-4.95-4.34-.14-.2-1.18-1.57-1.18-3s.75-2.13 1.02-2.42c.27-.3.58-.37.78-.37h.56c.18 0 .42-.07.66.5.25.6.84 2.04.91 2.19.08.14.12.31.03.5-.1.2-.14.31-.29.48-.14.17-.3.38-.43.5-.15.15-.3.3-.13.6.17.29.76 1.25 1.63 2.02 1.12 1 2.06 1.3 2.36 1.45.29.15.46.12.63-.07.17-.2.73-.85.92-1.14.2-.3.39-.24.66-.15.27.1 1.71.81 2 .96.3.15.49.22.56.34.08.12.08.7-.17 1.4z",
  reddit:
    "M22 12.14a2.2 2.2 0 0 0-3.73-1.57 10.8 10.8 0 0 0-5.8-1.84l.99-4.65 3.23.69a1.56 1.56 0 1 0 .16-.77l-3.6-.77a.4.4 0 0 0-.47.3l-1.1 5.2a10.8 10.8 0 0 0-5.88 1.84 2.2 2.2 0 1 0-2.42 3.6 4.3 4.3 0 0 0 0 .66c0 3.37 3.92 6.1 8.76 6.1s8.76-2.73 8.76-6.1a4.3 4.3 0 0 0 0-.66A2.2 2.2 0 0 0 22 12.14zM7 13.7a1.56 1.56 0 1 1 3.12 0A1.56 1.56 0 0 1 7 13.7zm8.73 4.13c-1.07.8-2.38 1.2-3.72 1.14a5.6 5.6 0 0 1-3.72-1.14.4.4 0 0 1 .57-.57c.9.66 2.03 1 3.14.94 1.12.06 2.23-.27 3.14-.92a.41.41 0 1 1 .59.58zm-.28-2.57a1.56 1.56 0 1 1 0-3.12 1.56 1.56 0 0 1 0 3.12z",
  telegram:
    "M21.94 4.3 18.9 18.63c-.23 1.01-.83 1.26-1.68.79l-4.63-3.41-2.23 2.15c-.25.25-.45.45-.93.45l.33-4.71 8.58-7.75c.37-.33-.08-.52-.58-.19L7.16 12.64 2.6 11.22c-.99-.31-1.01-.99.21-1.47L20.62 2.9c.83-.3 1.55.2 1.32 1.4z",
  email: "M3 5h18a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zm9 7.2L4 7.3V17h16V7.3z",
  copy: "M16 1H4a2 2 0 0 0-2 2v14h2V3h12zm3 4H8a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2zm0 16H8V7h11z",
  native:
    "M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7a2.9 2.9 0 0 0 0-1.4l7.05-4.11A2.99 2.99 0 1 0 15 5c0 .24.04.47.09.7L8.04 9.81a3 3 0 1 0 0 4.38l7.12 4.16c-.05.21-.08.43-.08.65A2.92 2.92 0 1 0 18 16.08z",
};

function Icon({ name }: { name: keyof typeof ICONS }) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false" fill="currentColor">
      <path d={ICONS[name]} />
    </svg>
  );
}

const btn =
  "inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-700 hover:border-brand hover:text-brand focus:outline-none focus-visible:ring-2 focus-visible:ring-brand";

/** Share a public page: networks as plain links, copy link, and the Web Share API where available. */
export function ShareButtons({ url, title, label = "Share" }: { url: string; title: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const [canNative, setCanNative] = useState(false);
  useEffect(() => {
    void Promise.resolve().then(() =>
      setCanNative(typeof navigator !== "undefined" && typeof navigator.share === "function"),
    );
  }, []);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(withUtm(url, "copy"));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };
  const native = async () => {
    try {
      await navigator.share({ title, url: withUtm(url, "native") });
    } catch {
      // Cancelled.
    }
  };
  return (
    <div role="group" aria-label={label} className="flex flex-wrap items-center gap-2">
      <span className="text-sm font-semibold text-slate-600">{label}</span>
      {canNative && (
        <button type="button" className={btn} onClick={native} aria-label="Share with an app on this device">
          <Icon name="native" />
        </button>
      )}
      {SHARE_NETWORKS.map((n) => (
        <a
          key={n}
          className={btn}
          href={shareUrl(n, url, title)}
          target={n === "email" ? undefined : "_blank"}
          rel="noopener noreferrer"
          aria-label={n === "email" ? "Share by email" : `Share on ${SHARE_LABELS[n]} (opens in a new tab)`}
          title={SHARE_LABELS[n]}
        >
          <Icon name={n} />
        </a>
      ))}
      <button type="button" className={btn} onClick={copy} aria-label="Copy link" title="Copy link">
        <Icon name="copy" />
      </button>
      <span role="status" aria-live="polite" className="text-xs text-slate-500">
        {copied ? "Link copied" : ""}
      </span>
    </div>
  );
}
