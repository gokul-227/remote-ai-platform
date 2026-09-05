"use client";

// Root-level error boundary for the App Router: catches errors thrown while
// rendering (or re-rendering) the root layout, which no nested error.tsx can
// catch. Reports to Sentry (a no-op call when NEXT_PUBLIC_SENTRY_DSN is
// unset -- see src/instrumentation-client.ts) and renders Next's default
// error page so this stays a plain client-facing error, not a monitoring
// integration change in behavior.
import * as Sentry from "@sentry/nextjs";
import NextError from "next/error";
import { useEffect } from "react";

export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body>
        <NextError statusCode={0} />
      </body>
    </html>
  );
}
