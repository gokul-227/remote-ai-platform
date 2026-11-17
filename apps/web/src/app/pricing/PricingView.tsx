import Link from "next/link";
import { priceLabel, type Catalog, type CatalogItem } from "@/lib/billing";

const FREE_FEATURES = [
  "Search, view and apply for jobs",
  "Your profile, matches and job alerts",
  "Messaging with your connections",
  "A monthly AI allowance for the assistant and profile tools",
  "20 proposals a month on freelance projects",
  "Posting jobs and reviewing applicants",
];

const GROUPS: { title: string; audience: CatalogItem["audience"]; mode: CatalogItem["mode"] }[] = [
  { title: "Employer plans", audience: "employer", mode: "subscription" },
  { title: "Employer one-off purchases", audience: "employer", mode: "payment" },
  { title: "Member plans", audience: "member", mode: "subscription" },
  { title: "Member one-off purchases", audience: "member", mode: "payment" },
];

function Item({ item, enabled }: { item: CatalogItem; enabled: boolean }) {
  const available = enabled && item.is_active;
  return (
    <li className="flex flex-col rounded-xl border border-slate-200 bg-white p-5" data-testid={`plan-${item.slug}`}>
      <h3 className="text-lg font-semibold">{item.name}</h3>
      <p className="mt-1 text-xl font-bold">{priceLabel(item)}</p>
      {item.trial_days ? (
        <p className="text-sm text-slate-600">{item.trial_days}-day free trial, once per member</p>
      ) : null}
      <p className="mt-2 flex-1 text-sm text-slate-700">{item.description}</p>
      {available ? (
        <Link
          href={`/#billing?plan=${encodeURIComponent(item.slug)}`}
          className="mt-4 inline-flex justify-center rounded-full bg-brand px-4 py-2 font-semibold text-white"
        >
          {item.target === "job" ? "Choose a job and buy" : "Buy"}
        </Link>
      ) : (
        <span className="mt-4 inline-flex justify-center rounded-full bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-600">
          {item.is_active ? "Coming soon" : "Not available yet"}
        </span>
      )}
    </li>
  );
}

/** Public pricing (server-rendered from the live catalogue). */
export function PricingView({ catalog }: { catalog: Catalog }) {
  return (
    <article className="rounded-xl border border-slate-200 bg-white p-6 sm:p-10">
      <h1 className="text-3xl font-bold">Pricing</h1>
      <p className="mt-3 text-slate-700">
        Searching, viewing and applying for jobs is free. Paid options add visibility and extra capacity on top of a
        free product you can use without paying.
      </p>
      {!catalog.enabled && (
        <p role="status" className="mt-4 rounded-lg bg-amber-50 p-4 text-amber-900">
          Paid features are coming soon. Nothing can be bought or charged yet.
        </p>
      )}

      <section className="mt-8">
        <h2 className="text-xl font-semibold">Free</h2>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-slate-700">
          {FREE_FEATURES.map((f) => (
            <li key={f}>{f}</li>
          ))}
        </ul>
      </section>

      {catalog.items.length === 0 ? (
        <p className="mt-8 text-sm text-slate-600">Prices are not available right now. Please check back later.</p>
      ) : (
        GROUPS.map((g) => {
          const items = catalog.items.filter((i) => i.audience === g.audience && i.mode === g.mode);
          if (!items.length) return null;
          return (
            <section key={g.title} className="mt-8">
              <h2 className="text-xl font-semibold">{g.title}</h2>
              <ul className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {items.map((item) => (
                  <Item key={item.slug} item={item} enabled={catalog.enabled} />
                ))}
              </ul>
            </section>
          );
        })
      )}

      <section className="mt-10 space-y-2 text-sm text-slate-700">
        <h2 className="text-xl font-semibold text-slate-900">Good to know</h2>
        <p>
          {catalog.tax_calculated
            ? "Prices are in euros and include VAT where it applies. VAT is worked out at checkout from your billing address; businesses can add a VAT number."
            : "Prices are in euros and are the final amount you pay, including any VAT that applies."}{" "}
          Payments are handled by our payment processor.
        </p>
        <p>
          Featured, Sponsored and Promoted placements are always labelled as paid. They never change the order of
          organic search results.
        </p>
        <p>
          Subscriptions renew automatically until you cancel in Settings &gt; Billing; cancelling stops the next
          renewal. Credits expire 12 months after purchase. For digital services that start straight away you agree at
          checkout that the 14-day right of withdrawal ends once the service has been fully provided.
        </p>
        <p>
          Full details:{" "}
          <Link className="text-brand underline" href="/terms#paid-services">
            Terms of Service, Paid services
          </Link>{" "}
          and{" "}
          <Link className="text-brand underline" href="/employer-terms">
            Job Posting and Employer Terms
          </Link>
          .
        </p>
      </section>
    </article>
  );
}
