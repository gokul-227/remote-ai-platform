import { faqJsonLd, type Faq } from "@/lib/hubs";
import { JsonLd } from "./PublicChrome";

/** Visible questions and answers plus the matching FAQPage markup (server-rendered). */
export function FaqSection({ faqs, title = "Frequently asked questions" }: { faqs: Faq[]; title?: string }) {
  const ld = faqJsonLd(faqs);
  if (!ld) return null;
  return (
    <section aria-labelledby="faq" className="mt-10">
      <h2 id="faq" className="mb-3 text-xl font-bold text-navy">
        {title}
      </h2>
      <dl className="space-y-4">
        {faqs.map((f) => (
          <div key={f.q} className="rounded-xl border border-slate-200 bg-white p-4">
            <dt className="font-semibold">{f.q}</dt>
            <dd className="mt-1 text-slate-700">{f.a}</dd>
          </div>
        ))}
      </dl>
      <JsonLd data={ld} />
    </section>
  );
}
