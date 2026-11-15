import type { Metadata } from "next";
import Link from "next/link";
import { Breadcrumbs, JsonLd, PublicFrame } from "../PublicChrome";
import { breadcrumbJsonLd } from "@/lib/brand";
import { SITE_URL } from "@/lib/site";
import { OPERATOR } from "@/figma/legal_content";

export const metadata: Metadata = {
  title: "Trust and security | Remote AI Platform",
  description: "How Remote AI Platform protects accounts and data, and how to report a vulnerability.",
  alternates: { canonical: "/trust" },
};

export default function SecurityPage() {
  return (
    <PublicFrame>
      <Breadcrumbs
        trail={[
          ["Remote AI Platform", "/"],
          ["Trust and security", "/trust"],
        ]}
      />
      <JsonLd
        data={breadcrumbJsonLd(SITE_URL || "https://remoteaiplatform.com", [
          ["Remote AI Platform", "/"],
          ["Trust and security", "/trust"],
        ])}
      />
      <article className="rounded-xl border border-slate-200 bg-white p-6 sm:p-10">
        <h1 className="text-3xl font-bold text-[#102A43]">Trust and security</h1>
        <section className="mt-8 space-y-3 leading-relaxed">
          <h2 className="text-xl font-semibold">How we protect your account</h2>
          <ul className="list-disc space-y-2 pl-5 text-slate-700">
            <li>All traffic is encrypted in transit with HTTPS.</li>
            <li>Sign-in is handled by a dedicated identity provider; we never store your password.</li>
            <li>Access to your data is checked on the server for every request.</li>
            <li>You can download or delete your data from your account settings.</li>
          </ul>
        </section>
        <section className="mt-8 space-y-3 leading-relaxed">
          <h2 className="text-xl font-semibold">Report a vulnerability</h2>
          <p className="text-slate-700">
            If you believe you have found a security issue, please email{" "}
            {OPERATOR.contactEmail ? (
              <a className="font-semibold text-[#175CD3] underline" href={`mailto:${OPERATOR.contactEmail}`}>
                {OPERATOR.contactEmail}
              </a>
            ) : (
              "the operator"
            )}{" "}
            with steps to reproduce. Please do not access other people&apos;s data or disrupt the service while testing.
          </p>
        </section>
        <p className="mt-8 text-sm text-slate-600">
          See also our{" "}
          <Link href="/privacy" className="text-[#175CD3] underline">
            privacy notice
          </Link>{" "}
          and{" "}
          <Link href="/status" className="text-[#175CD3] underline">
            service status
          </Link>
          .
        </p>
      </article>
    </PublicFrame>
  );
}
