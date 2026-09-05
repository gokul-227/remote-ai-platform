// Sentry browser (client-side) initialization. Next.js auto-loads this file
// on the client for every route; it runs before any React code.
//
// A no-op DSN check guards the whole thing: with NEXT_PUBLIC_SENTRY_DSN
// unset (the default until the user's Sentry project exists), Sentry.init is
// never called, so no client is created and no requests ever leave the
// browser for this.
import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NEXT_PUBLIC_APP_ENV || process.env.NODE_ENV,
    tracesSampleRate: 0.1,
    // Never attach PII (IP address, cookies) to events.
    sendDefaultPii: false,
  });
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
