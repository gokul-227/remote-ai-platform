"use client";

import { useState } from "react";
import { api } from "@/lib/client";
import { ReasonDialog, Section, State, useLoad } from "./kit";

interface Revenue {
  mrr_cents: number;
  active_subscriptions: number;
  trialing_subscriptions: number;
  churned_30d: number;
  churn_rate_30d: number;
  one_off_revenue_cents_30d: number;
  one_off_revenue_cents_total: number;
  subscription_invoices_cents_30d: number;
  ad_spend_cents_30d: number;
  billing_enabled: boolean;
}
interface Purchase {
  id: string;
  user_id: string | null;
  plan_slug: string;
  status: string;
  amount_total: number | null;
  amount_refunded: number;
  currency: string;
  fulfilment_status: string;
  subject_id: string | null;
  created_at: string;
}
interface Sub {
  id: string;
  user_id: string;
  status: string;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  stripe_subscription_id: string | null;
}
interface Ent {
  id: string;
  user_id: string;
  key: string;
  quantity: number;
  source: string;
  expires_at: string | null;
  revoked_at: string | null;
}
interface Plan {
  slug: string;
  name: string;
  price_cents: number;
  billing_interval: string;
  is_active: boolean;
}
type Action = { title: string; danger?: boolean; run: (reason: string) => Promise<void> };

export const eur = (cents: number | null | undefined) =>
  cents == null ? "—" : `€${(cents / 100).toFixed(cents % 100 ? 2 : 0)}`;

/** Revenue, computed by the API from recorded Stripe events only. */
export function BillingRevenue() {
  const r = useLoad<Revenue>("/admin/billing/revenue");
  const d = r.data;
  return (
    <Section title="Revenue">
      <State loading={r.loading && !d} error={r.error} retry={r.reload} />
      {d && (
        <div className="card">
          {!d.billing_enabled && (
            <p className="muted">Billing is off (BILLING_ENABLED=false); nothing is chargeable.</p>
          )}
          <table>
            <tbody>
              <tr>
                <th>MRR</th>
                <td>{eur(d.mrr_cents)}</td>
              </tr>
              <tr>
                <th>Active subscriptions</th>
                <td>{d.active_subscriptions}</td>
              </tr>
              <tr>
                <th>In trial</th>
                <td>{d.trialing_subscriptions}</td>
              </tr>
              <tr>
                <th>Churned (30 days)</th>
                <td>
                  {d.churned_30d} ({(d.churn_rate_30d * 100).toFixed(1)}%)
                </td>
              </tr>
              <tr>
                <th>One-off revenue (30 days)</th>
                <td>{eur(d.one_off_revenue_cents_30d)}</td>
              </tr>
              <tr>
                <th>One-off revenue (all time)</th>
                <td>{eur(d.one_off_revenue_cents_total)}</td>
              </tr>
              <tr>
                <th>Subscription invoices (30 days)</th>
                <td>{eur(d.subscription_invoices_cents_30d)}</td>
              </tr>
              <tr>
                <th>Sponsored-job ad spend (30 days)</th>
                <td>{eur(d.ad_spend_cents_30d)}</td>
              </tr>
            </tbody>
          </table>
          <p className="muted">From recorded Stripe webhooks; amounts include VAT.</p>
        </div>
      )}
    </Section>
  );
}

export function BillingPurchases({ writable }: { writable: boolean }) {
  const [status, setStatus] = useState("");
  const [dialog, setDialog] = useState<Action | null>(null);
  const list = useLoad<Purchase[]>(`/admin/billing/purchases?limit=100${status ? `&status=${status}` : ""}`);
  return (
    <Section title="Purchases">
      <label>
        Status{" "}
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All</option>
          {["pending", "paid", "partially_refunded", "refunded", "expired"].map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      </label>
      <State
        loading={list.loading && !list.data}
        error={list.error}
        empty={list.data?.length === 0}
        retry={list.reload}
      />
      {!!list.data?.length && (
        <table>
          <thead>
            <tr>
              <th>When</th>
              <th>Product</th>
              <th>Member</th>
              <th>Status</th>
              <th>Amount</th>
              <th>Fulfilment</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {list.data.map((p) => (
              <tr key={p.id}>
                <td>{p.created_at.slice(0, 10)}</td>
                <td>{p.plan_slug}</td>
                <td>
                  <code>{p.user_id ?? "deleted"}</code>
                </td>
                <td>{p.status}</td>
                <td>
                  {eur(p.amount_total)}
                  {p.amount_refunded ? ` (refunded ${eur(p.amount_refunded)})` : ""}
                </td>
                <td>
                  {p.fulfilment_status}
                  {p.fulfilment_status === "queued" && (
                    <button
                      className="btn"
                      disabled={!writable}
                      onClick={() =>
                        setDialog({
                          title: `Mark ${p.plan_slug} as fulfilled`,
                          run: async (reason) => {
                            await api(`/admin/billing/purchases/${p.id}/fulfilment`, {
                              method: "POST",
                              json: { reason, fulfilment_status: "done" },
                            });
                            list.reload();
                          },
                        })
                      }
                    >
                      Mark done
                    </button>
                  )}
                </td>
                <td>
                  {(p.status === "paid" || p.status === "partially_refunded") && (
                    <button
                      className="btn danger"
                      disabled={!writable}
                      onClick={() =>
                        setDialog({
                          title: `Refund ${eur((p.amount_total ?? 0) - p.amount_refunded)} through Stripe`,
                          danger: true,
                          run: async (reason) => {
                            await api(`/admin/billing/purchases/${p.id}/refund`, { method: "POST", json: { reason } });
                            list.reload();
                          },
                        })
                      }
                    >
                      Refund
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {dialog && (
        <ReasonDialog
          title={dialog.title}
          danger={dialog.danger}
          onCancel={() => setDialog(null)}
          onConfirm={async (reason) => {
            await dialog.run(reason);
            setDialog(null);
          }}
        />
      )}
    </Section>
  );
}

export function BillingSubscriptions() {
  const list = useLoad<Sub[]>("/admin/billing/subscriptions?limit=100");
  return (
    <Section title="Subscriptions">
      <State
        loading={list.loading && !list.data}
        error={list.error}
        empty={list.data?.length === 0}
        retry={list.reload}
      />
      {!!list.data?.length && (
        <table>
          <thead>
            <tr>
              <th>Member</th>
              <th>Status</th>
              <th>Period end</th>
              <th>Stripe</th>
            </tr>
          </thead>
          <tbody>
            {list.data.map((s) => (
              <tr key={s.id}>
                <td>
                  <code>{s.user_id}</code>
                </td>
                <td>
                  {s.status}
                  {s.cancel_at_period_end ? " (cancels at period end)" : ""}
                </td>
                <td>{s.current_period_end?.slice(0, 10) ?? "—"}</td>
                <td>
                  <code>{s.stripe_subscription_id}</code>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Section>
  );
}

export function BillingEntitlements({ writable }: { writable: boolean }) {
  const [user, setUser] = useState("");
  const [dialog, setDialog] = useState<Action | null>(null);
  const list = useLoad<Ent[]>(
    `/admin/billing/entitlements?limit=200${user ? `&user_id=${encodeURIComponent(user)}` : ""}`,
  );
  return (
    <Section title="Entitlements">
      <label>
        Member id <input className="input" value={user} onChange={(e) => setUser(e.target.value.trim())} />
      </label>
      <State
        loading={list.loading && !list.data}
        error={list.error}
        empty={list.data?.length === 0}
        retry={list.reload}
      />
      {!!list.data?.length && (
        <table>
          <thead>
            <tr>
              <th>Member</th>
              <th>Key</th>
              <th>Qty</th>
              <th>Source</th>
              <th>Expires</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {list.data.map((e) => (
              <tr key={e.id}>
                <td>
                  <code>{e.user_id}</code>
                </td>
                <td>{e.key}</td>
                <td>{e.quantity}</td>
                <td>{e.source}</td>
                <td>{e.revoked_at ? "revoked" : (e.expires_at?.slice(0, 10) ?? "—")}</td>
                <td>
                  {!e.revoked_at && (
                    <button
                      className="btn danger"
                      disabled={!writable}
                      onClick={() =>
                        setDialog({
                          title: `Revoke ${e.key}`,
                          danger: true,
                          run: async (reason) => {
                            await api(`/admin/billing/entitlements/${e.id}/revoke`, {
                              method: "POST",
                              json: { reason },
                            });
                            list.reload();
                          },
                        })
                      }
                    >
                      Revoke
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {dialog && (
        <ReasonDialog
          title={dialog.title}
          danger={dialog.danger}
          onCancel={() => setDialog(null)}
          onConfirm={async (reason) => {
            await dialog.run(reason);
            setDialog(null);
          }}
        />
      )}
    </Section>
  );
}

/** Price editing: a new price creates a new Stripe Price; existing subscribers keep theirs. */
export function BillingPrices({ writable }: { writable: boolean }) {
  const list = useLoad<Plan[]>("/admin/billing/plans");
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [dialog, setDialog] = useState<Action | null>(null);
  return (
    <Section title="Prices">
      <State loading={list.loading && !list.data} error={list.error} retry={list.reload} />
      {!!list.data?.length && (
        <table>
          <thead>
            <tr>
              <th>Product</th>
              <th>Interval</th>
              <th>Price (EUR, incl. VAT)</th>
              <th>Available</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {list.data.map((p) => (
              <tr key={p.slug}>
                <td>{p.name}</td>
                <td>{p.billing_interval}</td>
                <td>
                  <input
                    aria-label={`Price for ${p.name}`}
                    className="input"
                    inputMode="decimal"
                    value={edits[p.slug] ?? (p.price_cents / 100).toFixed(2)}
                    onChange={(e) => setEdits({ ...edits, [p.slug]: e.target.value })}
                  />
                </td>
                <td>{p.is_active ? "yes" : "no"}</td>
                <td>
                  <button
                    className="btn"
                    disabled={!writable || edits[p.slug] === undefined}
                    onClick={() => {
                      const cents = Math.round(Number(edits[p.slug]) * 100);
                      setDialog({
                        title: `Change ${p.name} to ${eur(cents)}`,
                        run: async (reason) => {
                          await api(`/admin/billing/plans/${p.slug}`, {
                            method: "PATCH",
                            json: { reason, price_cents: cents },
                          });
                          setEdits(({ [p.slug]: _drop, ...rest }) => rest);
                          list.reload();
                        },
                      });
                    }}
                  >
                    Save price
                  </button>{" "}
                  <button
                    className="btn"
                    disabled={!writable}
                    onClick={() =>
                      setDialog({
                        title: `${p.is_active ? "Withdraw" : "Offer"} ${p.name}`,
                        run: async (reason) => {
                          await api(`/admin/billing/plans/${p.slug}`, {
                            method: "PATCH",
                            json: { reason, is_active: !p.is_active },
                          });
                          list.reload();
                        },
                      })
                    }
                  >
                    {p.is_active ? "Withdraw" : "Offer"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {dialog && (
        <ReasonDialog
          title={dialog.title}
          onCancel={() => setDialog(null)}
          onConfirm={async (reason) => {
            await dialog.run(reason);
            setDialog(null);
          }}
        />
      )}
    </Section>
  );
}
