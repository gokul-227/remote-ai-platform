// Next.js instrumentation hook -- runs once when the server process (or, on
// Cloudflare, the Worker) starts, before any request is handled. This is
// where Sentry's App Router setup wires up server/edge initialization.
//
// Both imported config modules are themselves no-ops when
// NEXT_PUBLIC_SENTRY_DSN is unset, so this hook is safe to run unconditionally
// in every environment.
import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

export const onRequestError = Sentry.captureRequestError;
