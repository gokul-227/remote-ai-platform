import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";
import { deployEnvProblems, isIndexable } from "./src/lib/deployEnv";

// A deployed build (production/dev) with a missing or local public env would
// otherwise ship pointing at localhost or a placeholder Supabase project.
const envProblems = deployEnvProblems(process.env);
if (envProblems.length) {
  throw new Error(`Refusing to build for ${process.env.NEXT_PUBLIC_DEPLOY_ENV}: ${envProblems.join("; ")}`);
}

// API_URL/SUPABASE_URL vary per environment (prod vs dev) -- baked in at
// build time via NEXT_PUBLIC_* the same way the rest of the app consumes
// them, so the CSP's connect-src matches whichever backend this build
// actually talks to instead of hardcoding one environment's URL.
const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co";
// Browser error reports go to the Sentry ingest host named in the DSN; without
// it in connect-src the browser silently blocks every report.
const sentryOrigin = (() => {
  try {
    return process.env.NEXT_PUBLIC_SENTRY_DSN ? new URL(process.env.NEXT_PUBLIC_SENTRY_DSN).origin : "";
  } catch {
    return "";
  }
})();

// unsafe-inline on script-src is a known, deliberate relaxation: Next.js's
// own inline hydration scripts need it. The app itself renders no inline
// scripts or HTML strings (no dangerouslySetInnerHTML), and user-supplied
// links pass through safeHref. A nonce-based CSP would remove this but needs
// per-request middleware -- worth doing if the app ever renders rich user HTML.
const csp = [
  "default-src 'self'",
  `connect-src 'self' ${apiUrl} ${supabaseUrl} ${sentryOrigin}`.trim(),
  // Organisations link logos hosted anywhere; images can't run code, so any
  // HTTPS source is allowed (plain HTTP and other schemes are not).
  "img-src 'self' data: https:",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  // Everything except the production site is kept out of search engines.
  ...(isIndexable(process.env) ? [] : [{ key: "X-Robots-Tag", value: "noindex, nofollow" }]),
];

const nextConfig: NextConfig = {
  // Allow clearbit image domains
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "logo.clearbit.com",
      },
    ],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

// Only wrap with Sentry's build plugin when a DSN is actually configured.
// Left unwrapped otherwise, so a DSN-less build (every build until the
// user's Sentry projects exist, and every build in this repo's CI today)
// gets zero Sentry-related build behavior -- no source-map processing, no
// attempt to talk to Sentry's API, no extra webpack plugin at all.
export default process.env.NEXT_PUBLIC_SENTRY_DSN
  ? withSentryConfig(nextConfig, {
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
      // No SENTRY_AUTH_TOKEN exists yet either -- disable source map upload
      // rather than let the plugin fail/warn trying to authenticate.
      sourcemaps: { disable: !process.env.SENTRY_AUTH_TOKEN },
      silent: !process.env.CI,
      widenClientFileUpload: true,
      disableLogger: true,
    })
  : nextConfig;
