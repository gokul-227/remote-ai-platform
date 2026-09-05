import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

// API_URL/SUPABASE_URL vary per environment (prod vs dev) -- baked in at
// build time via NEXT_PUBLIC_* the same way the rest of the app consumes
// them, so the CSP's connect-src matches whichever backend this build
// actually talks to instead of hardcoding one environment's URL.
const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co";

// unsafe-inline on script-src is a known, deliberate relaxation: the app
// router's theme-init script (src/lib/theme.ts, inlined via
// dangerouslySetInnerHTML in layout.tsx to avoid a flash of the wrong theme)
// needs it, and Next.js's own inline hydration data does too. A nonce-based
// CSP would remove this but needs per-request middleware -- worth doing if
// this app later renders more user-supplied content, not yet in place.
const csp = [
  "default-src 'self'",
  `connect-src 'self' ${apiUrl} ${supabaseUrl}`,
  "img-src 'self' data: https://logo.clearbit.com https://*.supabase.co",
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
