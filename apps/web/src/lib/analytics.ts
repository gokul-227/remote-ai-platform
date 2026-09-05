import api from "@/lib/api";

/**
 * Minimal first-party product analytics — fire-and-forget event tracking.
 *
 * Posts to the backend's own `/analytics/events` endpoint (no third-party
 * analytics vendor). `user_id` is never sent from here — the backend derives
 * it from the request's auth token (null for anonymous visitors), so this
 * helper never needs to know or handle identity.
 *
 * Deliberately fire-and-forget: analytics must never block or break the
 * user's actual action, so failures (network errors, ad-blockers, backend
 * hiccups) are swallowed silently.
 */
export function trackEvent(eventName: string, properties?: Record<string, string | number | boolean>): void {
  try {
    void api.post("/analytics/events", { event_name: eventName, properties: properties ?? {} }).catch(() => {
      // Swallow — analytics must never surface an error to the user.
    });
  } catch {
    // Defensive: api.post itself should never throw synchronously, but
    // never let this helper be the reason a click handler blows up.
  }
}
