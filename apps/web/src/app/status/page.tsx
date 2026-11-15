import type { Metadata } from "next";
import { PublicFrame } from "../PublicChrome";
import { API_URL } from "@/lib/site";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Service status | Remote AI Platform",
  description: "Current availability of the Remote AI Platform website and API.",
  alternates: { canonical: "/status" },
  robots: { index: false, follow: true },
};

/** Live check of the API's readiness probe; the web page itself answering means the website is up. */
async function apiReady(): Promise<boolean> {
  try {
    const res = await fetch(`${API_URL}/health/ready`, { cache: "no-store", signal: AbortSignal.timeout(5000) });
    return res.ok;
  } catch {
    return false;
  }
}

export default async function StatusPage() {
  const api = await apiReady();
  const rows: [string, boolean][] = [
    ["Website", true],
    ["API and sign-in", api],
  ];
  return (
    <PublicFrame>
      <h1 className="text-3xl font-bold text-navy">Service status</h1>
      <p className="mt-2 text-slate-600">Checked {new Date().toUTCString()}.</p>
      <ul className="mt-6 divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white" aria-live="polite">
        {rows.map(([name, ok]) => (
          <li key={name} className="flex items-center justify-between p-4">
            <span className="font-semibold">{name}</span>
            <span
              className={`rounded-full px-3 py-1 text-sm font-semibold ${ok ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-900"}`}
            >
              {ok ? "Operational" : "Degraded — we are looking into it"}
            </span>
          </li>
        ))}
      </ul>
    </PublicFrame>
  );
}
