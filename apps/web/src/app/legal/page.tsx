import type { Metadata } from "next";
import Link from "next/link";
import { PublicFrame } from "../PublicChrome";
import { LAST_UPDATED, LEGAL_PAGES, OPERATOR } from "@/figma/legal_content";

export const metadata: Metadata = {
  title: "Legal | Remote AI Platform",
  description:
    "Terms, privacy, cookie, community, employer, copyright, security and accessibility policies for Remote AI Platform.",
  alternates: { canonical: "/legal" },
};

export default function Page() {
  return (
    <PublicFrame>
      <article className="rounded-xl border border-slate-200 bg-white p-6 sm:p-10">
        <h1 className="text-3xl font-bold">Legal</h1>
        <p className="mt-2 text-sm text-slate-500">Last updated: {LAST_UPDATED}</p>
        <p className="mt-4 text-sm leading-relaxed text-slate-700">
          The policies that apply when you use Remote AI Platform. Questions about any of them:{" "}
          <a className="text-brand underline" href={`mailto:${OPERATOR.contactEmail}`}>
            {OPERATOR.contactEmail}
          </a>
          .
        </p>
        <ul className="mt-8 divide-y divide-slate-100">
          {LEGAL_PAGES.map((p) => (
            <li key={p.href} className="py-4">
              <h2 className="text-lg font-semibold">
                <Link className="text-brand hover:underline" href={p.href}>
                  {p.title}
                </Link>
              </h2>
              <p className="mt-1 text-sm text-slate-600">{p.summary}</p>
            </li>
          ))}
        </ul>
      </article>
    </PublicFrame>
  );
}
