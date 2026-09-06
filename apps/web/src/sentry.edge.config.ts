// Sentry edge-runtime configuration (middleware, edge API routes, and the
// Cloudflare Workers runtime this app deploys to via @opennextjs/cloudflare).
//
// Imported by src/instrumentation.ts's register() hook only when
// NEXT_RUNTIME === "edge". Same no-op-until-configured behavior as
// sentry.server.config.ts.
import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NEXT_PUBLIC_APP_ENV || process.env.NODE_ENV,
    tracesSampleRate: 0.1,
    sendDefaultPii: false,
  });
}
