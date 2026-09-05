// Sentry server-runtime (Node.js) configuration.
//
// Imported by src/instrumentation.ts's register() hook only when
// NEXT_RUNTIME === "nodejs". Intentionally does nothing at all -- no client
// is created, no network calls are made -- until NEXT_PUBLIC_SENTRY_DSN is
// configured. There's no separate server-only DSN env var: Sentry DSNs
// aren't secret (they only allow *sending* events to a project, not reading
// them), so reusing the public one avoids managing two copies of the same
// value across Render/Cloudflare.
import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NEXT_PUBLIC_APP_ENV || process.env.NODE_ENV,
    tracesSampleRate: 0.1,
    // Never attach PII (request bodies, cookies, IPs) to events.
    sendDefaultPii: false,
  });
}
