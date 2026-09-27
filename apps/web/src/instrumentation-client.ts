// Sentry browser (client-side) initialization. Next.js auto-loads this file
// on the client for every route.
//
// Only when NEXT_PUBLIC_SENTRY_DSN is set, and loaded after the page rather
// than in the first bundle: the SDK is ~140 KB gzipped, the largest piece of
// JavaScript on the site. (Errors in the first moments of a page load are the
// trade-off.) Events carry the deploy environment and the commit being run.
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  void import("@sentry/nextjs").then((Sentry) =>
    Sentry.init({
      dsn,
      environment: process.env.NEXT_PUBLIC_DEPLOY_ENV || "unknown",
      release: process.env.NEXT_PUBLIC_BUILD_SHA,
      tracesSampleRate: 0.1,
      // Never attach PII (IP address, cookies) to events.
      sendDefaultPii: false,
    }),
  );
}
