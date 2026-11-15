import { NextResponse, type NextRequest } from "next/server";

/**
 * Long-gone job pages answer 410 Gone (removed, hidden, or expired more than
 * JOB_GONE_AFTER_DAYS ago), so search engines drop them faster than a soft
 * "no longer available" page. Recently expired jobs keep their 200 noindex page.
 * Fails open: if the API can't answer quickly, the normal page renders.
 */
const API_URL = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const UUID = /^\/jobs\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/?$/i;

export const GONE_HTML = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Job no longer available | Remote AI Platform</title></head><body style="font-family:system-ui,sans-serif;max-width:40rem;margin:4rem auto;padding:0 1rem;color:#102A43"><h1>This job is no longer available</h1><p>The listing was removed or closed some time ago.</p><p><a href="/remote-jobs">Browse current remote jobs</a></p></body></html>`;

export async function proxy(request: NextRequest) {
  const match = UUID.exec(request.nextUrl.pathname);
  if (!match) return NextResponse.next();
  try {
    const res = await fetch(`${API_URL}/api/v1/jobs/${match[1]}/availability`, { signal: AbortSignal.timeout(1500) });
    if (res.ok && (await res.json()).state === "gone")
      return new NextResponse(GONE_HTML, {
        status: 410,
        headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "public, max-age=3600" },
      });
  } catch {
    // fall through to the page
  }
  return NextResponse.next();
}

export const config = { matcher: "/jobs/:id" };
