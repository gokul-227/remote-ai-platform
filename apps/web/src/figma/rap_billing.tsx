"use client";

import { useState } from "react";
import api, { extractErrorMessage } from "@/lib/api";
import { PROMOTION_LABELS, formatPrice, priceLabel, type Catalog, type CatalogItem } from "@/lib/billing";
import { goRoute, useApi } from "./live";
import { Btn, cx } from "./rap_kit";

type Entitlement = { id: string; key: string; quantity: number; subject_id: string | null; expires_at: string | null };
type Sub = {
  id: string;
  plan: string;
  plan_name: string;
  status: string;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
};
type Purchase = {
  id: string;
  plan_slug: string;
  status: string;
  amount_total: number | null;
  currency: string;
  created_at: string;
  fulfilment_status: string;
};
type Invoice = {
  id: string;
  amount_paid: number;
  currency: string;
  created_at: string;
  hosted_invoice_url: string | null;
  invoice_pdf: string | null;
};
type Monthly = { available: number; monthly_remaining: number; pack_remaining: number; included_monthly: number };
export type MyBilling = {
  enabled: boolean;
  has_customer: boolean;
  entitlements: Entitlement[];
  subscriptions: Sub[];
  purchases: Purchase[];
  invoices: Invoice[];
  balances: {
    featured_job_credits: number;
    ad_balance_cents: number;
    ai_tokens: number;
    proposals: Monthly;
    messaging: Monthly;
  };
};

const date = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString() : "");

/** A labelled chip for a paid placement (Featured, Urgent, Sponsored, Promoted). */
export function PromotionChip({ kind }: { kind: string }) {
  const label = PROMOTION_LABELS[kind];
  if (!label) return null;
  return (
    <span
      className="rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-900"
      title="Paid placement"
    >
      {label}
    </span>
  );
}

type Placement = {
  label: string;
  campaign_id?: string | null;
  job: { id: string; title: string; company_name?: string | null };
};

/** Featured and Sponsored jobs above the organic results, each labelled. Empty while billing is off. */
export function PaidPlacements() {
  const q = useApi<{ featured: Placement[]; sponsored: Placement[] }>("/billing/placements/jobs");
  const items = [...(q.data?.featured ?? []), ...(q.data?.sponsored ?? [])];
  if (!items.length) return null;
  const open = (p: Placement) => {
    if (p.campaign_id) void api.post(`/billing/placements/sponsored/${p.campaign_id}/click`).catch(() => undefined);
    goRoute(`jobdetail/${encodeURIComponent(p.job.id)}`);
  };
  return (
    <ul aria-label="Paid placements" className="border-b border-amber-200 bg-amber-50/40">
      {items.map((p) => (
        <li key={`${p.label}-${p.job.id}`}>
          <button
            type="button"
            onClick={() => open(p)}
            className="flex w-full items-center gap-3 p-3 text-left hover:bg-amber-50"
          >
            <PromotionChip kind={p.label.toLowerCase()} />
            <span className="min-w-0 flex-1 truncate font-semibold">{p.job.title}</span>
            <span className="text-sm text-slate-500">{p.job.company_name}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

/** "See plans" link shown where a paid option would help (post job, AI limit, profile). */
export function UpgradeLink({ text = "See plans", plan }: { text?: string; plan?: string }) {
  return (
    <a
      className="text-sm font-semibold text-brand underline"
      href={plan ? `/#billing?plan=${encodeURIComponent(plan)}` : "/pricing"}
    >
      {text}
    </a>
  );
}

export async function startCheckout(plan: string, subjectId?: string): Promise<void> {
  const r = await api.post<{ url: string }>("/billing/checkout", { plan, subject_id: subjectId });
  window.location.assign(r.data.url);
}

function requestedPlan(): string | null {
  if (typeof window === "undefined") return null;
  const query = window.location.hash.split("?")[1] || "";
  return new URLSearchParams(query).get("plan");
}

/** Settings > Billing: plans, balances, invoices, the Stripe portal and purchases. */
export function BillingPanel() {
  const me = useApi<MyBilling>("/billing/me");
  const cat = useApi<Catalog>("/billing/catalog");
  const jobs = useApi<{ id: string; title: string }[]>("/jobs/company");
  const ref = useApi<{ code: string; credit_cents: number }>("/billing/referral");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState("");
  const [job, setJob] = useState("");
  const wanted = requestedPlan();
  if (me.loading || cat.loading) return <p className="text-sm text-slate-500">Loading billing…</p>;
  const enabled = !!cat.data?.enabled;
  const items = (cat.data?.items || []).filter((i) => i.is_active);
  const run = async (key: string, fn: () => Promise<void>) => {
    setErr("");
    setBusy(key);
    try {
      await fn();
    } catch (e) {
      setErr(extractErrorMessage(e, "That didn't work. Nothing was charged."));
    } finally {
      setBusy("");
    }
  };
  const buy = (item: CatalogItem) =>
    run(item.slug, async () => {
      if (item.target === "job" && !job) throw new Error("Choose a job first.");
      await startCheckout(item.slug, item.target === "job" ? job : undefined);
    });
  if (!enabled)
    return (
      <div>
        <h2>Billing</h2>
        <p className="mt-3 text-sm text-slate-600" role="status">
          Paid features are coming soon. Nothing can be bought or charged yet.
        </p>
        <p className="mt-2">
          <UpgradeLink text="See what's planned" />
        </p>
      </div>
    );
  const data = me.data;
  const featuredItem = wanted ? items.find((i) => i.slug === wanted) : undefined;
  const ordered = featuredItem ? [featuredItem, ...items.filter((i) => i !== featuredItem)] : items;
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2>Billing</h2>
        {data?.has_customer && (
          <Btn
            sm
            v="line"
            disabled={busy === "portal"}
            onClick={() =>
              run("portal", async () => {
                const r = await api.post<{ url: string }>("/billing/portal");
                window.location.assign(r.data.url);
              })
            }
          >
            Manage billing and cancel
          </Btn>
        )}
      </div>
      {err && (
        <p role="alert" className="text-sm text-red-700">
          {err}
        </p>
      )}

      <section>
        <h3 className="font-semibold">Your plans</h3>
        {data?.subscriptions.length ? (
          <ul className="mt-2 space-y-1 text-sm">
            {data.subscriptions.map((s) => (
              <li key={s.id}>
                <b>{s.plan_name}</b> · {s.status}
                {s.current_period_end &&
                  (s.cancel_at_period_end
                    ? ` · ends ${date(s.current_period_end)}`
                    : ` · renews ${date(s.current_period_end)}`)}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-1 text-sm text-slate-500">You&apos;re on the free plan.</p>
        )}
      </section>

      {data && (
        <section>
          <h3 className="font-semibold">Balances</h3>
          <ul className="mt-2 grid gap-1 text-sm sm:grid-cols-2">
            <li>Proposals left this month: {data.balances.proposals.available}</li>
            <li>Messaging credits: {data.balances.messaging.available}</li>
            <li>Extra AI tokens: {data.balances.ai_tokens.toLocaleString()}</li>
            <li>Job credits: {data.balances.featured_job_credits}</li>
            <li>Sponsored jobs balance: {formatPrice(data.balances.ad_balance_cents)}</li>
          </ul>
        </section>
      )}

      <section>
        <h3 className="font-semibold">Buy</h3>
        <p className="text-xs text-slate-500">
          Prices include VAT where it applies; tax is calculated at checkout. Paid placements are always labelled.
        </p>
        {(jobs.data?.length ?? 0) > 0 && (
          <label className="mt-2 block text-sm">
            Job for job-specific purchases{" "}
            <select className="ml-2 rounded border px-2 py-1" value={job} onChange={(e) => setJob(e.target.value)}>
              <option value="">Choose a job</option>
              {jobs.data!.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.title}
                </option>
              ))}
            </select>
          </label>
        )}
        <ul className="mt-3 grid gap-3 sm:grid-cols-2">
          {ordered.map((item) => (
            <li
              key={item.slug}
              className={cx("rounded-lg border p-3", item === featuredItem ? "border-brand" : "border-slate-200")}
            >
              <div className="flex items-baseline justify-between gap-2">
                <b>{item.name}</b>
                <span className="text-sm">{priceLabel(item)}</span>
              </div>
              <p className="mt-1 text-xs text-slate-600">{item.description}</p>
              <Btn sm c="mt-2" disabled={!!busy} onClick={() => buy(item)}>
                {busy === item.slug ? "Opening checkout…" : "Buy"}
              </Btn>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h3 className="font-semibold">Invoices</h3>
        {data?.invoices.length ? (
          <ul className="mt-2 space-y-1 text-sm">
            {data.invoices.map((i) => (
              <li key={i.id}>
                {date(i.created_at)} · {formatPrice(i.amount_paid, i.currency)}{" "}
                {i.invoice_pdf && (
                  <a className="text-brand underline" href={i.invoice_pdf} rel="noopener noreferrer" target="_blank">
                    Download PDF
                  </a>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-1 text-sm text-slate-500">
            No invoices yet. Receipts for one-off purchases are emailed by Stripe.
          </p>
        )}
      </section>

      {!!data?.purchases.length && (
        <section>
          <h3 className="font-semibold">Purchases</h3>
          <ul className="mt-2 space-y-1 text-sm">
            {data.purchases.map((p) => (
              <li key={p.id}>
                {date(p.created_at)} · {p.plan_slug.replace(/_/g, " ")} · {p.status}
                {p.amount_total != null && ` · ${formatPrice(p.amount_total, p.currency)}`}
                {p.fulfilment_status === "queued" && " · scheduled by our team"}
              </li>
            ))}
          </ul>
        </section>
      )}

      {ref.data && (
        <section>
          <h3 className="font-semibold">Refer a friend</h3>
          <p className="mt-1 text-sm text-slate-600">
            Share code <b>{ref.data.code}</b>. When they make their first payment you both get{" "}
            {formatPrice(ref.data.credit_cents)} of credit towards future payments.
          </p>
        </section>
      )}
    </div>
  );
}
